namespace Alugatek.Domain.Entities;

public enum RentalStatus
{
    Pending,
    Active,
    Completed,
    ReturnRequested,
    Returned,
    Cancelled
}

public enum PaymentStatus
{
    None,
    /// <summary>Funds are authorized and held (uncaptured PaymentIntent), awaiting capture.</summary>
    Held,
    /// <summary>Held funds were captured and transferred to the owner.</summary>
    Captured,
    /// <summary>The authorization hold was released without capturing.</summary>
    Released,
    /// <summary>The payment failed asynchronously after the hold appeared to succeed.</summary>
    Failed
}

public class Rental
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public decimal TotalPrice { get; set; }
    public RentalStatus Status { get; set; } = RentalStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // --- Rental price payment (immediate charge) ---
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.None;

    /// <summary>Stripe PaymentIntent id (pi_...) for the immediately captured rental price.</summary>
    public string? PaymentIntentId { get; set; }

    // --- Caução / security deposit (manual-capture hold, released on confirmed return) ---
    /// <summary>Security deposit amount copied from the item at rental creation time.</summary>
    public decimal CaucaoAmount { get; set; } = 0;

    public PaymentStatus CaucaoPaymentStatus { get; set; } = PaymentStatus.None;

    /// <summary>Stripe PaymentIntent id (pi_...) for the caução hold.</summary>
    public string? CaucaoPaymentIntentId { get; set; }

    /// <summary>The latest time the caução hold can be captured.</summary>
    public DateTime? CaptureBefore { get; set; }

    /// <summary>Whether Stripe granted the extended authorization window ("enabled"/"disabled").</summary>
    public string? ExtendedAuthorizationStatus { get; set; }

    /// <summary>Seller payout destination captured at rental confirmation (IBAN or MB WAY).</summary>
    public string? SellerPaymentDestination { get; set; }

    /// <summary>UTC deadline by which the buyer must complete payment after the owner confirms. Null until confirmed.</summary>
    public DateTime? PaymentDeadline { get; set; }

    public Guid ItemId { get; set; }
    public TechItem Item { get; set; } = null!;

    public Guid RenterId { get; set; }
    public User Renter { get; set; } = null!;
}
