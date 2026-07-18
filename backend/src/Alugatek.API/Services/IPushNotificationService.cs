namespace Alugatek.API.Services;

public interface IPushNotificationService
{
    Task<IReadOnlyCollection<string>> SendChatMessageAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid senderId,
        string senderName,
        Guid itemId,
        string itemTitle,
        string content,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<string>> SendRentalExpiryReminderAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid rentalId,
        string itemTitle,
        DateTime endDateUtc,
        CancellationToken cancellationToken = default);
}
