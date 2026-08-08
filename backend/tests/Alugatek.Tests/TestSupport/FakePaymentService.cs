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

    /// <summary>Makes the next charge come back as a pending 3D Secure challenge.</summary>
    public bool ChargeRequiresAction { get; set; }

    /// <summary>Makes the next hold come back as a pending 3D Secure challenge.</summary>
    public bool HoldRequiresAction { get; set; }

    /// <summary>Outcome reported by <see cref="GetChargeAsync"/> / <see cref="GetHoldAsync"/>.</summary>
    public PaymentOutcome RetrievedOutcome { get; set; } = PaymentOutcome.Succeeded;

    public List<string> RetrievedCharges { get; } = [];
    public List<string> RetrievedHolds { get; } = [];

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

    public Task<PaymentChargeResult> ChargeAsync(
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
        var intentId = $"pi_charge_{Charges.Count}";

        return Task.FromResult(ChargeRequiresAction
            ? new PaymentChargeResult(intentId, $"secret_{intentId}", PaymentOutcome.RequiresAction, customerId, paymentMethodId)
            : new PaymentChargeResult(intentId, $"secret_{intentId}", PaymentOutcome.Succeeded, customerId, paymentMethodId));
    }

    public Task<PaymentChargeResult> GetChargeAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        RetrievedCharges.Add(paymentIntentId);
        return Task.FromResult(new PaymentChargeResult(
            paymentIntentId, $"secret_{paymentIntentId}", RetrievedOutcome, "cus_retrieved", "pm_retrieved"));
    }

    public Task<PaymentHoldResult> GetHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default)
    {
        RetrievedHolds.Add(paymentIntentId);
        return Task.FromResult(new PaymentHoldResult(
            paymentIntentId,
            $"secret_{paymentIntentId}",
            HoldCaptureBefore,
            HoldExtendedAuthorizationStatus,
            RetrievedOutcome,
            "cus_retrieved",
            "pm_retrieved"));
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
            HoldExtendedAuthorizationStatus,
            HoldRequiresAction ? PaymentOutcome.RequiresAction : PaymentOutcome.Succeeded,
            customerId,
            paymentMethodId));
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
