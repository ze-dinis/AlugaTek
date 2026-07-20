namespace Alugatek.Domain.Entities;

public class FavoriteItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public Guid ItemId { get; set; }
    public TechItem Item { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
