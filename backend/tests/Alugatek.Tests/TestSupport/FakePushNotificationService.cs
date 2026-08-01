using Alugatek.API.Services;

namespace Alugatek.Tests.TestSupport;

/// <summary>Records push notification calls and can report device tokens as invalid.</summary>
public sealed class FakePushNotificationService : IPushNotificationService
{
    public List<(Guid MessageId, IReadOnlyCollection<string> Tokens, string Content)> ChatMessages { get; } = [];
    public List<Guid> ExpiryReminders { get; } = [];

    /// <summary>Tokens that should be reported back to the caller as no longer registered.</summary>
    public HashSet<string> InvalidTokens { get; } = [];

    public Task<IReadOnlyCollection<string>> SendChatMessageAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid messageId,
        Guid senderId,
        string senderName,
        Guid itemId,
        string itemTitle,
        string content,
        IReadOnlyCollection<string>? imageUrls = null,
        CancellationToken cancellationToken = default)
    {
        ChatMessages.Add((messageId, deviceTokens, content));
        IReadOnlyCollection<string> invalid = deviceTokens.Where(InvalidTokens.Contains).ToList();
        return Task.FromResult(invalid);
    }

    public Task<IReadOnlyCollection<string>> SendRentalExpiryReminderAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid rentalId,
        string itemTitle,
        DateTime endDateUtc,
        CancellationToken cancellationToken = default)
    {
        ExpiryReminders.Add(rentalId);
        IReadOnlyCollection<string> invalid = deviceTokens.Where(InvalidTokens.Contains).ToList();
        return Task.FromResult(invalid);
    }
}
