namespace Alugatek.API.Services;

public class EmailVerificationOptions
{
    public bool Enabled { get; set; }
    public string VerificationEndpoint { get; set; } = "http://localhost:5000/api/auth/verify-email";
    public int TokenTtlMinutes { get; set; } = 60;

    public string FromEmail { get; set; } = string.Empty;
    public string FromName { get; set; } = "Alugatek";

    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; } = 587;
    public bool UseSsl { get; set; } = true;
    public string? SmtpUsername { get; set; }
    public string? SmtpPassword { get; set; }
}
