namespace Alugatek.API.Services;

public class PushNotificationOptions
{
    public bool Enabled { get; set; }
    /// <summary>
    /// Raw JSON content of the Firebase service account. Takes priority over
    /// <see cref="ServiceAccountJsonPath"/>. Set via the
    /// <c>PushNotifications__ServiceAccountJson</c> environment variable (Railway, etc.).
    /// </summary>
    public string? ServiceAccountJson { get; set; }
    /// <summary>Path to the Firebase service account JSON file (local/Docker).</summary>
    public string? ServiceAccountJsonPath { get; set; }
}
