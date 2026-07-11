using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Options;

namespace Alugatek.API.Services;

public class FirebasePushNotificationService : IPushNotificationService
{
    private readonly ILogger<FirebasePushNotificationService> _logger;
    private readonly FirebaseMessaging? _messaging;

    public FirebasePushNotificationService(
        IOptions<PushNotificationOptions> options,
        IWebHostEnvironment environment,
        ILogger<FirebasePushNotificationService> logger)
    {
        _logger = logger;
        var pushOptions = options.Value;

        if (!pushOptions.Enabled)
        {
            _logger.LogInformation("Push notifications are disabled via configuration.");
            return;
        }

        if (string.IsNullOrWhiteSpace(pushOptions.ServiceAccountJsonPath))
        {
            _logger.LogWarning("Push notifications enabled, but ServiceAccountJsonPath is missing.");
            return;
        }

        var credentialPath = Path.IsPathRooted(pushOptions.ServiceAccountJsonPath)
            ? pushOptions.ServiceAccountJsonPath
            : Path.Combine(environment.ContentRootPath, pushOptions.ServiceAccountJsonPath);

        if (!File.Exists(credentialPath))
        {
            _logger.LogWarning("Firebase service account file not found at {CredentialPath}", credentialPath);
            return;
        }

        // FirebaseApp.DefaultInstance returns null (does not throw) when no app
        // has been created yet, so guard with null-coalescing.
        var app = FirebaseApp.DefaultInstance;
        if (app is null)
        {
            try
            {
                app = FirebaseApp.Create(new AppOptions
                {
                    Credential = GoogleCredential.FromFile(credentialPath)
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to initialize Firebase app; push notifications disabled.");
                return;
            }
        }

        _messaging = FirebaseMessaging.GetMessaging(app);
        _logger.LogInformation("Firebase push notifications initialized.");
    }

    public async Task<IReadOnlyCollection<string>> SendChatMessageAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid senderId,
        string senderName,
        string content,
        CancellationToken cancellationToken = default)
    {
        if (_messaging is null || deviceTokens.Count == 0)
        {
            _logger.LogInformation(
                "Chat push skipped (messagingInitialized={Initialized}, tokenCount={Count}).",
                _messaging is not null, deviceTokens.Count);
            return Array.Empty<string>();
        }

        _logger.LogInformation("Sending chat push to {Count} device token(s).", deviceTokens.Count);

        var invalidTokens = new List<string>();
        var messageTasks = deviceTokens.Select(async token =>
        {
            var message = new Message
            {
                Token = token,
                Notification = new Notification
                {
                    Title = $"New message from {senderName}",
                    Body = content
                },
                Data = new Dictionary<string, string>
                {
                    ["type"] = "chat_message",
                    ["otherId"] = senderId.ToString(),
                    ["otherName"] = senderName,
                    ["content"] = content
                },
                Android = new AndroidConfig
                {
                    Priority = Priority.High,
                    Notification = new AndroidNotification
                    {
                        ChannelId = "chat-messages-v2",
                        DefaultSound = true,
                        DefaultVibrateTimings = true,
                    }
                }
            };

            try
            {
                await _messaging.SendAsync(message, cancellationToken);
            }
            catch (FirebaseMessagingException ex) when (
                ex.ErrorCode == ErrorCode.NotFound ||
                ex.ErrorCode == ErrorCode.InvalidArgument)
            {
                lock (invalidTokens)
                {
                    invalidTokens.Add(token);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send chat push notification.");
            }
        });

        await Task.WhenAll(messageTasks);
        _logger.LogInformation(
            "Chat push send complete. invalidTokens={Count}.", invalidTokens.Count);
        return invalidTokens;
    }

    public async Task<IReadOnlyCollection<string>> SendRentalExpiryReminderAsync(
        IReadOnlyCollection<string> deviceTokens,
        Guid rentalId,
        string itemTitle,
        DateTime endDateUtc,
        CancellationToken cancellationToken = default)
    {
        if (_messaging is null || deviceTokens.Count == 0)
        {
            _logger.LogInformation(
                "Rental expiry push skipped (messagingInitialized={Initialized}, tokenCount={Count}).",
                _messaging is not null, deviceTokens.Count);
            return Array.Empty<string>();
        }

        _logger.LogInformation("Sending rental expiry push to {Count} device token(s).", deviceTokens.Count);

        var invalidTokens = new List<string>();
        var endDateText = endDateUtc.ToString("yyyy-MM-dd HH:mm");
        var messageTasks = deviceTokens.Select(async token =>
        {
            var message = new Message
            {
                Token = token,
                Notification = new Notification
                {
                    Title = "Aluguer a expirar em 24h",
                    Body = $"{itemTitle} termina a {endDateText}. Renove para continuar com o item."
                },
                Data = new Dictionary<string, string>
                {
                    ["type"] = "rental_expiring_24h",
                    ["rentalId"] = rentalId.ToString(),
                    ["itemTitle"] = itemTitle,
                    ["endDateUtc"] = endDateUtc.ToString("o")
                },
                Android = new AndroidConfig
                {
                    Priority = Priority.High,
                    Notification = new AndroidNotification
                    {
                        ChannelId = "chat-messages-v2",
                        DefaultSound = true,
                        DefaultVibrateTimings = true,
                    }
                }
            };

            try
            {
                await _messaging.SendAsync(message, cancellationToken);
            }
            catch (FirebaseMessagingException ex) when (
                ex.ErrorCode == ErrorCode.NotFound ||
                ex.ErrorCode == ErrorCode.InvalidArgument)
            {
                lock (invalidTokens)
                {
                    invalidTokens.Add(token);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send rental expiry push notification.");
            }
        });

        await Task.WhenAll(messageTasks);
        _logger.LogInformation(
            "Rental expiry push send complete. invalidTokens={Count}.", invalidTokens.Count);
        return invalidTokens;
    }
}
