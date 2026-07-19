namespace Alugatek.API.Services;

public interface IPushNotificationService
{
    Task<IReadOnlyCollection<string>> SendChatMessageAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid messageId,
        Guid senderId,
        string senderName,
        Guid itemId,
        string itemTitle,
        string content,
        IReadOnlyCollection<string>? imageUrls = null,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<string>> SendRentalExpiryReminderAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid rentalId,
        string itemTitle,
        DateTime endDateUtc,
        CancellationToken cancellationToken = default);
}
