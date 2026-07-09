namespace Alugatek.Domain.Entities;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public string? OAuthProvider { get; set; }   // "Google", "Facebook", etc.
    public string? OAuthSubject { get; set; }    // external user ID
    public string? AvatarUrl { get; set; }
    public string? Phone { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<TechItem> ListedItems { get; set; } = [];
    public ICollection<Rental> Rentals { get; set; } = [];
    public ICollection<Review> Reviews { get; set; } = [];
    public ICollection<Message> SentMessages { get; set; } = [];
    public ICollection<Message> ReceivedMessages { get; set; } = [];
    public ICollection<DevicePushToken> DevicePushTokens { get; set; } = [];
}
