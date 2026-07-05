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

public class Rental
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public decimal TotalPrice { get; set; }
    public RentalStatus Status { get; set; } = RentalStatus.Pending;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Guid ItemId { get; set; }
    public TechItem Item { get; set; } = null!;

    public Guid RenterId { get; set; }
    public User Renter { get; set; } = null!;
}
