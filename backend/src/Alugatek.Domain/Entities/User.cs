namespace Alugatek.Domain.Entities;

public class User
{
    public const string RoleUser = "User";
    public const string RoleSupport = "Support";
    public const string RoleAdmin = "Admin";

    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool EmailVerified { get; set; }
    public DateTime? EmailVerifiedAt { get; set; }
    public string? EmailVerificationTokenHash { get; set; }
    public DateTime? EmailVerificationTokenExpiresAt { get; set; }
    public string? PasswordHash { get; set; }
    public string? OAuthProvider { get; set; }   // "Google", "Facebook", etc.
    public string? OAuthSubject { get; set; }    // external user ID
    public string? AvatarUrl { get; set; }
    public string? Phone { get; set; }
    public string Role { get; set; } = RoleUser;
    public bool IsBanned { get; set; }
    public DateTime? BannedAt { get; set; }
    public DateTime? BannedUntil { get; set; }
    public string? BanReason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<TechItem> ListedItems { get; set; } = [];
    public ICollection<Rental> Rentals { get; set; } = [];
    public ICollection<RentalReview> GivenRentalReviews { get; set; } = [];
    public ICollection<RentalReview> ReceivedRentalReviews { get; set; } = [];
    public ICollection<Message> SentMessages { get; set; } = [];
    public ICollection<Message> ReceivedMessages { get; set; } = [];
    public ICollection<DevicePushToken> DevicePushTokens { get; set; } = [];
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}
