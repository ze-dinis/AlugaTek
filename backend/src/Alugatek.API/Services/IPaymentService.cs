namespace Alugatek.API.Services;

/// <summary>Result of placing an authorization hold on a card payment.</summary>
public record PaymentHoldResult(
    string PaymentIntentId,
    string ClientSecret,
    DateTime? CaptureBefore,
    string? ExtendedAuthorizationStatus);

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
    /// Creates and immediately captures a PaymentIntent for the rental price.
    /// Returns the PaymentIntent id.
    /// </summary>
    Task<string> ChargeAsync(
        decimal amount,
        string currency,
        string paymentMethodId,
        string customerId,
        string rentalId,
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
        CancellationToken cancellationToken = default);

    /// <summary>Captures the held caução funds, completing the transfer to the owner.</summary>
    Task CaptureHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default);

    /// <summary>Releases a caução hold without capturing any funds.</summary>
    Task ReleaseHoldAsync(string paymentIntentId, CancellationToken cancellationToken = default);

    /// <summary>Refunds a captured PaymentIntent in full.</summary>
    Task RefundAsync(string paymentIntentId, CancellationToken cancellationToken = default);
}
