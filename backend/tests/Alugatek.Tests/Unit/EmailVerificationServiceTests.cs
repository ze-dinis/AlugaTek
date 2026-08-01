using System.Net;
using System.Security.Cryptography;
using Alugatek.API.Services;
using Alugatek.Domain.Entities;
using Alugatek.Tests.TestSupport;
using Microsoft.Extensions.Options;

namespace Alugatek.Tests.Unit;

public class EmailVerificationServiceTests
{
    private static (EmailVerificationService Service, StubHttpMessageHandler Handler) CreateService(
        Action<EmailVerificationOptions>? configure = null)
    {
        var options = new EmailVerificationOptions
        {
            Enabled = true,
            TokenTtlMinutes = 60,
            FromEmail = "no-reply@alugatek.pt",
            FromName = "Alugatek",
            ResendApiKey = "re_test_key",
            VerificationEndpoint = "https://api.alugatek.pt/api/auth/verify-email"
        };

        configure?.Invoke(options);

        var handler = new StubHttpMessageHandler();
        var service = new EmailVerificationService(
            Options.Create(options),
            new FakeHttpClientFactory(handler));

        return (service, handler);
    }

    private static User CreateUser() => new()
    {
        Name = "Ana Silva",
        Email = "ana+test@example.com"
    };

    [Fact]
    public void GenerateToken_StoresHashedTokenAndExpiry()
    {
        var (service, _) = CreateService();
        var user = CreateUser();

        var token = service.GenerateToken(user);

        Assert.False(string.IsNullOrWhiteSpace(token));
        Assert.NotNull(user.EmailVerificationTokenHash);
        Assert.NotEqual(token, user.EmailVerificationTokenHash);
        Assert.Equal(Hash(token), user.EmailVerificationTokenHash);
        Assert.NotNull(user.EmailVerificationTokenExpiresAt);
        Assert.InRange(
            user.EmailVerificationTokenExpiresAt!.Value,
            DateTime.UtcNow.AddMinutes(58),
            DateTime.UtcNow.AddMinutes(62));
    }

    [Fact]
    public void GenerateToken_EnforcesAMinimumFiveMinuteTtl()
    {
        var (service, _) = CreateService(o => o.TokenTtlMinutes = 1);
        var user = CreateUser();

        service.GenerateToken(user);

        Assert.InRange(
            user.EmailVerificationTokenExpiresAt!.Value,
            DateTime.UtcNow.AddMinutes(4),
            DateTime.UtcNow.AddMinutes(6));
    }

    [Fact]
    public void GenerateToken_ProducesADifferentTokenEveryTime()
    {
        var (service, _) = CreateService();
        var user = CreateUser();

        var first = service.GenerateToken(user);
        var second = service.GenerateToken(user);

        Assert.NotEqual(first, second);
    }

    [Fact]
    public void TryVerify_MarksTheUserVerifiedAndClearsTheToken()
    {
        var (service, _) = CreateService();
        var user = CreateUser();
        var token = service.GenerateToken(user);

        Assert.True(service.TryVerify(user, token));
        Assert.True(user.EmailVerified);
        Assert.NotNull(user.EmailVerifiedAt);
        Assert.Null(user.EmailVerificationTokenHash);
        Assert.Null(user.EmailVerificationTokenExpiresAt);
    }

    [Fact]
    public void TryVerify_RejectsAWrongToken()
    {
        var (service, _) = CreateService();
        var user = CreateUser();
        service.GenerateToken(user);

        Assert.False(service.TryVerify(user, "not-the-right-token"));
        Assert.False(user.EmailVerified);
        Assert.NotNull(user.EmailVerificationTokenHash);
    }

    [Fact]
    public void TryVerify_RejectsAnExpiredToken()
    {
        var (service, _) = CreateService();
        var user = CreateUser();
        var token = service.GenerateToken(user);
        user.EmailVerificationTokenExpiresAt = DateTime.UtcNow.AddMinutes(-1);

        Assert.False(service.TryVerify(user, token));
        Assert.False(user.EmailVerified);
    }

    [Fact]
    public void TryVerify_RejectsWhenNoTokenWasIssued()
    {
        var (service, _) = CreateService();

        Assert.False(service.TryVerify(CreateUser(), "any-token"));
    }

    [Fact]
    public void TryVerify_IsANoOpForAnAlreadyVerifiedUser()
    {
        var (service, _) = CreateService();
        var user = CreateUser();
        user.EmailVerified = true;

        Assert.True(service.TryVerify(user, "irrelevant"));
    }

    [Fact]
    public async Task SendVerificationEmailAsync_PostsToResendWithTheVerificationLink()
    {
        var (service, handler) = CreateService();
        var user = CreateUser();
        var token = service.GenerateToken(user);

        await service.SendVerificationEmailAsync(user, token);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://api.resend.com/emails", request.Uri.ToString());
        Assert.Equal("re_test_key", request.AuthorizationParameter);
        Assert.Contains(Uri.EscapeDataString(user.Email), request.Body);
        Assert.Contains(Uri.EscapeDataString(token), request.Body);
    }

    [Fact]
    public async Task SendVerificationEmailAsync_ThrowsWhenVerificationIsDisabled()
    {
        var (service, _) = CreateService(o => o.Enabled = false);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.SendVerificationEmailAsync(CreateUser(), "token"));
    }

    [Fact]
    public async Task SendVerificationEmailAsync_ThrowsWhenNoTransportIsConfigured()
    {
        var (service, _) = CreateService(o =>
        {
            o.ResendApiKey = null;
            o.SmtpHost = string.Empty;
        });

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.SendVerificationEmailAsync(CreateUser(), "token"));
    }

    [Fact]
    public async Task SendVerificationEmailAsync_ThrowsWhenResendRejectsTheRequest()
    {
        var (service, handler) = CreateService();
        handler.StatusCode = HttpStatusCode.Unauthorized;

        await Assert.ThrowsAsync<HttpRequestException>(
            () => service.SendVerificationEmailAsync(CreateUser(), "token"));
    }

    private static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token)));
}
