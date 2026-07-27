namespace Alugatek.Domain.Entities;

public class RentalReview
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int Rating { get; set; }
    public string Comment { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Guid RentalId { get; set; }
    public Rental Rental { get; set; } = null!;

    public Guid ReviewerId { get; set; }
    public User Reviewer { get; set; } = null!;

    public Guid RevieweeId { get; set; }
    public User Reviewee { get; set; } = null!;
}