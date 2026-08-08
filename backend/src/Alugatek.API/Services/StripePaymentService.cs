using Microsoft.Extensions.Options;
using Stripe;

namespace Alugatek.API.Services;

public class StripePaymentService : IPaymentService
{
    private readonly StripeOptions _options;
    private readonly ILogger<StripePaymentService> _logger;
    private readonly PaymentIntentService _paymentIntents = new();
    private readonly CustomerService _customers = new();
    private readonly PaymentMethodService _paymentMethods = new();

    public StripePaymentService(IOptions<StripeOptions> options, ILogger<StripePaymentService> logger)
    {
        _options = options.Value;
        _logger = logger;

        if (!string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            StripeConfiguration.ApiKey = _options.SecretKey;
        }
        else
        {
            _logger.LogWarning("Stripe secret key is not configured; card payments will fail.");
        }
    }

    public async Task<string> CreateCustomerForPaymentAsync(
        string paymentMethodId,
        string rentalId,
        CancellationToken cancellationToken = default)
    {
        var customer = await _customers.CreateAsync(
            new CustomerCreateOptions
            {
                Metadata = new Dictionary<string, string> { ["rentalId"] = rentalId },
            },
            cancellationToken: cancellationToken);

        // Attach the client-collected PaymentMethod to the customer so it can be
        // reused for both the rental charge and the caução hold.
        await _paymentMethods.AttachAsync(
            paymentMethodId,
            new PaymentMethodAttachOptions { Customer = customer.Id },
            cancellationToken: cancellationToken);

        _logger.LogInformation("Created Stripe customer {CustomerId} for rental {RentalId}.", customer.Id, rentalId);
        return customer.Id;
    }

    public async Task<PaymentChargeResult> ChargeAsync(
        decimal amount,
        string currency,
        string paymentMethodId,
        string customerId,
        string rentalId,
        string? paymentDescription = null,
        CancellationToken cancellationToken = default)
    {
        var amountInMinorUnits = ToMinorUnits(amount);
        var description = BuildChargeDescription(rentalId, paymentDescription);

        var options = new PaymentIntentCreateOptions
        {
            Amount = amountInMinorUnits,
            Currency = currency.ToLowerInvariant(),
            Customer = customerId,
            PaymentMethod = paymentMethodId,
            Confirm = true,
            PaymentMethodTypes = ["card"],
            // Makes Stripe hand the 3DS challenge to the mobile SDK instead of a bare redirect.
            UseStripeSdk = true,
            ReturnUrl = _options.ReturnUrl,
            Description = description,
            Metadata = new Dictionary<string, string> { ["rentalId"] = rentalId, ["type"] = "rental_price" },
        };

        var intent = await _paymentIntents.CreateAsync(options, cancellationToken: cancellationToken);
        _logger.LogInformation("Charged rental price for rental {RentalId}: intent {IntentId}, status {Status}.",
            rentalId, intent.Id, intent.Status);

        return ToChargeResult(intent, rentalId);
    }

    public async Task<PaymentChargeResult> GetChargeAsync(
        string paymentIntentId,
        CancellationToken cancellationToken = default)
    {
        var intent = await _paymentIntents.GetAsync(paymentIntentId, cancellationToken: cancellationToken);
        _logger.LogInformation("Re-read rental price intent {IntentId}: status {Status}.", intent.Id, intent.Status);
        return ToChargeResult(intent, intent.Metadata.GetValueOrDefault("rentalId") ?? "unknown");
    }

    private PaymentChargeResult ToChargeResult(PaymentIntent intent, string rentalId)
    {
        switch (intent.Status)
        {
            case "succeeded":
                return new PaymentChargeResult(
                    intent.Id, intent.ClientSecret, PaymentOutcome.Succeeded, intent.CustomerId, intent.PaymentMethodId);

            case "requires_action":
                return new PaymentChargeResult(
                    intent.Id, intent.ClientSecret, PaymentOutcome.RequiresAction, intent.CustomerId, intent.PaymentMethodId);

            default:
                _logger.LogError(
                    "Rental price intent {IntentId} for rental {RentalId} did not succeed. Status: {Status}, NextAction: {NextAction}.",
                    intent.Id, rentalId, intent.Status, intent.NextAction?.Type);

                throw Failure(
                    "payment_intent_unexpected_state",
                    "O pagamento não foi concluído. Tente novamente ou use outro cartão.");
        }
    }

    public async Task<PaymentHoldResult> PlaceHoldAsync(
        decimal amount,
        string currency,
        string paymentMethodId,
        string customerId,
        string rentalId,
        string? paymentDescription = null,
        CancellationToken cancellationToken = default)
    {
        var amountInMinorUnits = ToMinorUnits(amount);
        var description = BuildChargeDescription(rentalId, paymentDescription);

        var createOptions = new PaymentIntentCreateOptions
        {
            Amount = amountInMinorUnits,
            Currency = currency.ToLowerInvariant(),
            Customer = customerId,
            PaymentMethod = paymentMethodId,
            Confirm = true,
            // Deliberately on-session: the renter is still in the app, so the issuer can run a 3DS
            // challenge. Off-session made this a merchant-initiated transaction, which EEA issuers
            // reject outright with authentication_required and no way to recover.
            OffSession = false,
            CaptureMethod = "manual",
            PaymentMethodTypes = ["card"],
            UseStripeSdk = true,
            ReturnUrl = _options.ReturnUrl,
            Description = description,
            Metadata = new Dictionary<string, string> { ["rentalId"] = rentalId, ["type"] = "caucao" },
            Expand = ["latest_charge"]
        };

        PaymentIntent intent;
        try
        {
            intent = await _paymentIntents.CreateAsync(createOptions, cancellationToken: cancellationToken);
        }
        catch (StripeException ex) when (ex.StripeError?.Code == "authentication_required"
                                         && ex.StripeError.PaymentIntent is not null)
        {
            // Defensive: Stripe reports SCA on a confirmation as an error rather than a status.
            var pending = ex.StripeError.PaymentIntent;
            _logger.LogInformation(
                "Caução hold for rental {RentalId} needs 3D Secure. Intent {IntentId}.", rentalId, pending.Id);

            return new PaymentHoldResult(
                pending.Id, pending.ClientSecret, null, null, PaymentOutcome.RequiresAction);
        }

        return await ToHoldResultAsync(intent, rentalId, cancellationToken);
    }

    public async Task<PaymentHoldResult> GetHoldAsync(
        string paymentIntentId,
        CancellationToken cancellationToken = default)
    {
        var intent = await _paymentIntents.GetAsync(
            paymentIntentId,
            new PaymentIntentGetOptions { Expand = ["latest_charge"] },
            cancellationToken: cancellationToken);

        _logger.LogInformation("Re-read caução intent {IntentId}: status {Status}.", intent.Id, intent.Status);
        return await ToHoldResultAsync(intent, intent.Metadata.GetValueOrDefault("rentalId") ?? "unknown", cancellationToken);
    }

    private async Task<PaymentHoldResult> ToHoldResultAsync(
        PaymentIntent intent,
        string rentalId,
        CancellationToken cancellationToken)
    {
        var cardDetails = intent.LatestCharge?.PaymentMethodDetails?.Card;
        var captureBefore = cardDetails?.CaptureBefore;
        var extendedAuthStatus = cardDetails?.ExtendedAuthorization?.Status;

        _logger.LogInformation(
            "Caução hold for rental {RentalId}: intent {IntentId}, status {Status}, captureBefore {CaptureBefore}.",
            rentalId, intent.Id, intent.Status, captureBefore);

        switch (intent.Status)
        {
            case "requires_capture":
                return new PaymentHoldResult(
                    intent.Id, intent.ClientSecret, captureBefore, extendedAuthStatus,
                    PaymentOutcome.Succeeded, intent.CustomerId, intent.PaymentMethodId);

            case "requires_action":
                return new PaymentHoldResult(
                    intent.Id, intent.ClientSecret, captureBefore, extendedAuthStatus,
                    PaymentOutcome.RequiresAction, intent.CustomerId, intent.PaymentMethodId);

            default:
                // Anything else means no funds are reserved, so fail instead of storing a phantom hold.
                _logger.LogError(
                    "Caução hold {IntentId} for rental {RentalId} is not capturable. Status: {Status}, NextAction: {NextAction}.",
                    intent.Id, rentalId, intent.Status, intent.NextAction?.Type);

                try
                {
                    await _paymentIntents.CancelAsync(intent.Id, cancellationToken: cancellationToken);
                }
                catch (StripeException cancelEx)
                {
                    _logger.LogWarning(cancelEx, "Could not cancel non-capturable caução intent {IntentId}.", intent.Id);
                }

                throw Failure(
                    "payment_intent_unexpected_state",
                    "Não foi possível reter a caução neste cartão. Use um cartão que suporte pré-autorizações.");
        }
    }

    public async Task CaptureHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        await _paymentIntents.CaptureAsync(paymentIntentId, cancellationToken: cancellationToken);
        _logger.LogInformation("Captured caução hold for intent {IntentId}.", paymentIntentId);
    }

    public async Task ReleaseHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        await _paymentIntents.CancelAsync(paymentIntentId, cancellationToken: cancellationToken);
        _logger.LogInformation("Released caução hold for intent {IntentId}.", paymentIntentId);
    }

    public async Task RefundAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        var refunds = new RefundService();
        await refunds.CreateAsync(
            new RefundCreateOptions { PaymentIntent = paymentIntentId },
            cancellationToken: cancellationToken);
        _logger.LogInformation("Refunded rental price for intent {IntentId}.", paymentIntentId);
    }

    private static StripeException Failure(string code, string message) =>
        new(message) { StripeError = new StripeError { Code = code, Message = message } };

    private static long ToMinorUnits(decimal amount) =>
        (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);

    private static string BuildChargeDescription(string rentalId, string? paymentDescription)
    {
        if (string.IsNullOrWhiteSpace(paymentDescription))
            return $"Alugatek rental {rentalId}";

        var normalized = paymentDescription.Trim();

        if (normalized.Length > 500)
            normalized = normalized[..500];

        return normalized;
    }
}
