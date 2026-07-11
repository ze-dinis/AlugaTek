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
        CancellationToken cancellationToken = default)
    {
        var amountInMinorUnits = ToMinorUnits(amount);

        var options = new PaymentIntentCreateOptions
        {
            Amount = amountInMinorUnits,
            Currency = currency.ToLowerInvariant(),
            Customer = customerId,
            PaymentMethod = paymentMethodId,
            Confirm = true,
            PaymentMethodTypes = ["card"],
            Metadata = new Dictionary<string, string> { ["rentalId"] = rentalId, ["type"] = "rental_price" },
        };

        var intent = await _paymentIntents.CreateAsync(options, cancellationToken: cancellationToken);
        _logger.LogInformation("Charged rental price for rental {RentalId}: intent {IntentId}, status {Status}.",
            rentalId, intent.Id, intent.Status);
        return intent.Id;
    }

    public async Task<PaymentHoldResult> PlaceHoldAsync(
        decimal amount,
        string currency,
        string paymentMethodId,
        string customerId,
        string rentalId,
        CancellationToken cancellationToken = default)
    {
        var amountInMinorUnits = ToMinorUnits(amount);

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

    private static long ToMinorUnits(decimal amount) =>
        (long)Math.Round(amount * 100m, MidpointRounding.AwayFromZero);
}
