namespace Alugatek.Domain.Entities;

public class TechItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string District { get; set; } = string.Empty;
    public string? Localidade { get; set; }
    public decimal DailyRate { get; set; }
    /// <summary>Security deposit (caução) held on the renter's card and released on confirmed return.</summary>
    public decimal Caucao { get; set; } = 0;
    public string? ImageUrl { get; set; }
    public string? ImageUrlsJson { get; set; }
    public bool IsAvailable { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;

    public Guid OwnerId { get; set; }
    public User Owner { get; set; } = null!;

    public ICollection<Rental> Rentals { get; set; } = [];
    public ICollection<Review> Reviews { get; set; } = [];
}
