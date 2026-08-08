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

    public async Task<string> ChargeAsync(
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
            // Records an off-session mandate on this first, customer-present charge. Without it the
            // follow-up caução hold is rejected with authentication_required under live-mode SCA.
            SetupFutureUsage = "off_session",
            Description = description,
            Metadata = new Dictionary<string, string> { ["rentalId"] = rentalId, ["type"] = "rental_price" },
        };

        var intent = await _paymentIntents.CreateAsync(options, cancellationToken: cancellationToken);
        _logger.LogInformation("Charged rental price for rental {RentalId}: intent {IntentId}, status {Status}.",
            rentalId, intent.Id, intent.Status);

        if (intent.Status != "succeeded")
        {
            _logger.LogError(
                "Rental price intent {IntentId} for rental {RentalId} did not succeed. Status: {Status}, NextAction: {NextAction}.",
                intent.Id, rentalId, intent.Status, intent.NextAction?.Type);

            throw Failure(
                intent.Status == "requires_action" ? "authentication_required" : "payment_intent_unexpected_state",
                intent.Status == "requires_action"
                    ? "O banco exige autenticação (3D Secure) para este cartão. Use outro cartão."
                    : "O pagamento não foi concluído. Tente novamente ou use outro cartão.");
        }

        return intent.Id;
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
            OffSession = true,
            CaptureMethod = "manual",
            PaymentMethodTypes = ["card"],
            Description = description,
            Metadata = new Dictionary<string, string> { ["rentalId"] = rentalId, ["type"] = "caucao" },
            Expand = ["latest_charge"]
        };

        var intent = await _paymentIntents.CreateAsync(createOptions, cancellationToken: cancellationToken);

        DateTime? captureBefore = null;
        string? extendedAuthStatus = null;
        var cardDetails = intent.LatestCharge?.PaymentMethodDetails?.Card;
        if (cardDetails is not null)
        {
            captureBefore = cardDetails.CaptureBefore;
            extendedAuthStatus = cardDetails.ExtendedAuthorization?.Status;
        }

        _logger.LogInformation(
            "Placed caução hold for rental {RentalId}: intent {IntentId}, status {Status}, captureBefore {CaptureBefore}.",
            rentalId, intent.Id, intent.Status, captureBefore);

        // A usable hold ends up in requires_capture. Anything else (requires_action, processing)
        // means no funds are actually reserved, so fail loudly instead of storing a phantom hold.
        if (intent.Status != "requires_capture")
        {
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
                intent.Status == "requires_action" ? "authentication_required" : "payment_intent_unexpected_state",
                "Não foi possível reter a caução neste cartão. Use um cartão que suporte pré-autorizações.");
        }

        return new PaymentHoldResult(intent.Id, intent.ClientSecret, captureBefore, extendedAuthStatus);
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
