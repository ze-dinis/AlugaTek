namespace Alugatek.API.Services;

/// <summary>How a PaymentIntent confirmation ended up.</summary>
public enum PaymentOutcome
{
    /// <summary>Charge captured, or hold authorized and awaiting capture.</summary>
    Succeeded,

    /// <summary>The issuer demands 3D Secure; the client must run the challenge with the returned client secret.</summary>
    RequiresAction
}

/// <summary>Result of charging a card for the rental price.</summary>
/// <param name="CustomerId">Populated when re-reading an intent, so the caução hold can reuse the same card.</param>
public record PaymentChargeResult(
    string PaymentIntentId,
    string? ClientSecret,
    PaymentOutcome Outcome,
    string? CustomerId = null,
    string? PaymentMethodId = null);

/// <summary>Result of placing an authorization hold on a card payment.</summary>
public record PaymentHoldResult(
    string PaymentIntentId,
    string? ClientSecret,
    DateTime? CaptureBefore,
    string? ExtendedAuthorizationStatus,
    PaymentOutcome Outcome = PaymentOutcome.Succeeded,
    string? CustomerId = null,
    string? PaymentMethodId = null);

public interface IPaymentService
{
    /// <summary>
    /// Creates a Stripe Customer and attaches the given PaymentMethod to it, so the same
    /// card can be charged more than once (rental price + caução hold). Returns the customer id.
    /// </summary>
    Task<string> CreateCustomerForPaymentAsync(
        string paymentMethodId,
        string rentalId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates and immediately captures a PaymentIntent for the rental price. May come back as
    /// <see cref="PaymentOutcome.RequiresAction"/> when the issuer demands a 3D Secure challenge.
    /// </summary>
    Task<PaymentChargeResult> ChargeAsync(
        decimal amount,
        string currency,
        string paymentMethodId,
        string customerId,
        string rentalId,
        string? paymentDescription = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates and confirms an uncaptured (manual capture) PaymentIntent for the caução.
    /// Funds are held on the card and captured only on confirmed return.
    /// </summary>
    Task<PaymentHoldResult> PlaceHoldAsync(
        decimal amount,
        string currency,
        string paymentMethodId,
        string customerId,
        string rentalId,
        string? paymentDescription = null,
        CancellationToken cancellationToken = default);

    /// <summary>Re-reads a rental price intent after the client completed a 3D Secure challenge.</summary>
    Task<PaymentChargeResult> GetChargeAsync(string paymentIntentId, CancellationToken cancellationToken = default);

    /// <summary>Re-reads a caução hold intent after the client completed a 3D Secure challenge.</summary>
    Task<PaymentHoldResult> GetHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default);

    /// <summary>Captures the held caução funds, completing the transfer to the owner.</summary>
    Task CaptureHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default);

    /// <summary>Releases a caução hold without capturing any funds.</summary>
    Task ReleaseHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default);

    /// <summary>Refunds a captured PaymentIntent in full.</summary>
    Task RefundAsync(string paymentIntentId, CancellationToken cancellationToken = default);
}
