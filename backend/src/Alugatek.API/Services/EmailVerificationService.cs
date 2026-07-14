using System.Net;
using System.Net.Http.Headers;
using System.Net.Mail;
using System.Security.Cryptography;
using Alugatek.Domain.Entities;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace Alugatek.API.Services;

public class EmailVerificationService(
    IOptions<EmailVerificationOptions> options,
    IHttpClientFactory httpClientFactory)
{
    private readonly EmailVerificationOptions _options = options.Value;

    public string GenerateToken(User user)
    {
        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        var token = WebEncoders.Base64UrlEncode(tokenBytes);

        user.EmailVerificationTokenHash = HashToken(token);
        user.EmailVerificationTokenExpiresAt = DateTime.UtcNow.AddMinutes(Math.Max(5, _options.TokenTtlMinutes));

        return token;
    }

    public bool TryVerify(User user, string token)
    {
        if (user.EmailVerified)
            return true;

        if (string.IsNullOrWhiteSpace(user.EmailVerificationTokenHash) ||
            user.EmailVerificationTokenExpiresAt is null ||
            user.EmailVerificationTokenExpiresAt <= DateTime.UtcNow)
        {
            return false;
        }

        var tokenHash = HashToken(token);
        if (!string.Equals(tokenHash, user.EmailVerificationTokenHash, StringComparison.Ordinal))
            return false;

        user.EmailVerified = true;
        user.EmailVerifiedAt = DateTime.UtcNow;
        user.EmailVerificationTokenHash = null;
        user.EmailVerificationTokenExpiresAt = null;

        return true;
    }

    public async Task SendVerificationEmailAsync(User user, string token)
    {
        if (!_options.Enabled)
            throw new InvalidOperationException("Email verification is required but EmailVerification:Enabled is false.");

        var verificationUrl = BuildVerificationUrl(user.Email, token);
        var subject = "Confirme o seu email no Alugatek";
        var body = $"Olá {user.Name},\n\nConfirme o seu email para ativar a conta:\n{verificationUrl}\n\nEste link expira em {_options.TokenTtlMinutes} minutos.";

        if (!string.IsNullOrWhiteSpace(_options.ResendApiKey))
        {
            await SendViaResendAsync(user.Email, subject, body);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(_options.SmtpHost) || string.IsNullOrWhiteSpace(_options.FromEmail))
                throw new InvalidOperationException("Email verification is enabled but SMTP/FromEmail is not configured.");

            await SendViaSmtpAsync(user.Email, subject, body);
        }
    }

    private async Task SendViaResendAsync(string toEmail, string subject, string body)
    {
        var client = httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _options.ResendApiKey);

        var payload = new
        {
            from = $"{_options.FromName} <{_options.FromEmail}>",
            to = new[] { toEmail },
            subject,
            text = body
        };

        var response = await client.PostAsJsonAsync("https://api.resend.com/emails", payload);
        response.EnsureSuccessStatusCode();
    }

    private async Task SendViaSmtpAsync(string toEmail, string subject, string body)
    {
        using var mailMessage = new MailMessage
        {
            From = new MailAddress(_options.FromEmail, _options.FromName),
            Subject = subject,
            Body = body,
            IsBodyHtml = false
        };
        mailMessage.To.Add(toEmail);

        using var smtpClient = new SmtpClient(_options.SmtpHost, _options.SmtpPort)
        {
            EnableSsl = _options.UseSsl,
            DeliveryMethod = SmtpDeliveryMethod.Network,
            Timeout = 30000
        };

        if (!string.IsNullOrWhiteSpace(_options.SmtpUsername))
        {
            smtpClient.Credentials = new NetworkCredential(_options.SmtpUsername, _options.SmtpPassword ?? string.Empty);
        }

        await smtpClient.SendMailAsync(mailMessage);
    }

    private string BuildVerificationUrl(string email, string token)
    {
        var separator = _options.VerificationEndpoint.Contains('?') ? "&" : "?";
        return $"{_options.VerificationEndpoint}{separator}email={Uri.EscapeDataString(email)}&token={Uri.EscapeDataString(token)}";
    }

    private static string HashToken(string token)
    {
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }
}
