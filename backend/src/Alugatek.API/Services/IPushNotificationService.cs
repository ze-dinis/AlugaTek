namespace Alugatek.API.Services;

public interface IPushNotificationService
{
    Task<IReadOnlyCollection<string>> SendChatMessageAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid senderId,
        string senderName,
        string content,
        CancellationToken cancellationToken = default);
}
