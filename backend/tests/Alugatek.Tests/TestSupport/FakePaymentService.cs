using Alugatek.API.Services;
using Stripe;

namespace Alugatek.Tests.TestSupport;

/// <summary>
/// In-memory <see cref="IPaymentService"/> that records calls and can be told to fail like Stripe would.
/// </summary>
public sealed class FakePaymentService : IPaymentService
{
    public List<string> CreatedCustomers { get; } = [];
    public List<decimal> Charges { get; } = [];
    public List<decimal> Holds { get; } = [];
    public List<string> CapturedHolds { get; } = [];
    public List<string> ReleasedHolds { get; } = [];
    public List<string> Refunds { get; } = [];
    public List<string?> Descriptions { get; } = [];

    public bool FailCustomerCreation { get; set; }
    public bool FailCharge { get; set; }
    public bool FailHold { get; set; }
    public bool FailRelease { get; set; }
    public bool FailRefund { get; set; }

    public DateTime? HoldCaptureBefore { get; set; } = DateTime.UtcNow.AddDays(30);
    public string HoldExtendedAuthorizationStatus { get; set; } = "enabled";

    public Task<string> CreateCustomerForPaymentAsync(
        string paymentMethodId,
        string rentalId,
        CancellationToken cancellationToken = default)
    {
        if (FailCustomerCreation)
            throw StripeFailure("card_declined", "Customer setup failed.");

        var customerId = $"cus_{CreatedCustomers.Count + 1}";
        CreatedCustomers.Add(customerId);
        return Task.FromResult(customerId);
    }

    public Task<string> ChargeAsync(
        decimal amount,
        string currency,
        string paymentMethodId,
        string customerId,
        string rentalId,
        string? paymentDescription = null,
        CancellationToken cancellationToken = default)
    {
        if (FailCharge)
            throw StripeFailure("card_declined", "Your card was declined.");

        Charges.Add(amount);
        Descriptions.Add(paymentDescription);
        return Task.FromResult($"pi_charge_{Charges.Count}");
    }

    public Task<PaymentHoldResult> PlaceHoldAsync(
        decimal amount,
        string currency,
        string paymentMethodId,
        string customerId,
        string rentalId,
        string? paymentDescription = null,
        CancellationToken cancellationToken = default)
    {
        if (FailHold)
            throw StripeFailure("card_declined", "Hold failed.");

        Holds.Add(amount);
        Descriptions.Add(paymentDescription);
        return Task.FromResult(new PaymentHoldResult(
            $"pi_hold_{Holds.Count}",
            $"secret_{Holds.Count}",
            HoldCaptureBefore,
            HoldExtendedAuthorizationStatus));
    }

    public Task CaptureHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        CapturedHolds.Add(paymentIntentId);
        return Task.CompletedTask;
    }

    public Task ReleaseHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        if (FailRelease)
            throw StripeFailure("charge_already_refunded", "Hold could not be released.");

        ReleasedHolds.Add(paymentIntentId);
        return Task.CompletedTask;
    }

    public Task RefundAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        if (FailRefund)
            throw StripeFailure("charge_already_refunded", "Refund failed.");

        Refunds.Add(paymentIntentId);
        return Task.CompletedTask;
    }

    private static StripeException StripeFailure(string code, string message) =>
        new(message)
        {
            StripeError = new StripeError { Code = code, Message = message }
        };
}
