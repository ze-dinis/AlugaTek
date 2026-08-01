using Alugatek.API.Controllers;
using Alugatek.API.DTOs;
using Alugatek.API.Services;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Infrastructure.Services;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Alugatek.Tests.Integration;

public class AuthControllerTests : IDisposable
{
    private readonly AppDbContext _db = TestDb.CreateContext();
    private readonly StubHttpMessageHandler _mailHandler = new();

    public void Dispose() => _db.Dispose();

    private AuthController CreateController(
        Action<EmailVerificationOptions>? configureEmail = null,
        string environmentName = "Development")
    {
        var emailOptions = new EmailVerificationOptions
        {
            Enabled = false,
            FromEmail = "no-reply@alugatek.pt",
            ResendApiKey = "re_test_key"
        };

        configureEmail?.Invoke(emailOptions);

        var jwt = new JwtService(new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = "alugatek-test-signing-key-that-is-long-enough-1234567890",
                ["Jwt:Issuer"] = "alugatek-tests",
                ["Jwt:Audience"] = "alugatek-clients"
            })
            .Build());

        var controller = new AuthController(
            _db,
            jwt,
            new EmailVerificationService(Options.Create(emailOptions), new FakeHttpClientFactory(_mailHandler)),
            Options.Create(emailOptions),
            new FakeWebHostEnvironment(environmentName),
            NullLogger<AuthController>.Instance);

        return controller.Anonymous();
    }

    [Fact]
    public async Task Register_WithVerificationDisabledInDevelopment_CreatesVerifiedAccount()
    {
        var controller = CreateController();

        var result = await controller.Register(new RegisterRequest("Ana Silva", "  Ana@Example.COM ", "Password123!"));

        Assert.IsType<OkObjectResult>(result.Result);
        var user = await _db.Users.SingleAsync();
        Assert.Equal("ana@example.com", user.Email);
        Assert.True(user.EmailVerified);
        Assert.Empty(_mailHandler.Requests);
    }

    [Fact]
    public async Task Register_WithVerificationEnabled_SendsEmailAndLeavesAccountUnverified()
    {
        var controller = CreateController(o => o.Enabled = true);

        var result = await controller.Register(new RegisterRequest("Ana", "ana@example.com", "Password123!"));

        Assert.IsType<OkObjectResult>(result.Result);
        var user = await _db.Users.SingleAsync();
        Assert.False(user.EmailVerified);
        Assert.NotNull(user.EmailVerificationTokenHash);
        Assert.Single(_mailHandler.Requests);
    }

    [Fact]
    public async Task Register_HashesThePasswordInsteadOfStoringIt()
    {
        var controller = CreateController();

        await controller.Register(new RegisterRequest("Ana", "ana@example.com", "Password123!"));

        var user = await _db.Users.SingleAsync();
        Assert.NotNull(user.PasswordHash);
        Assert.NotEqual("Password123!", user.PasswordHash);
        Assert.True(BCrypt.Net.BCrypt.Verify("Password123!", user.PasswordHash));
    }

    [Fact]
    public async Task Register_WithAnAlreadyVerifiedEmail_ReturnsConflict()
    {
        _db.AddUser(email: "ana@example.com", emailVerified: true);
        var controller = CreateController();

        var result = await controller.Register(new RegisterRequest("Ana", "ANA@example.com", "Password123!"));

        Assert.IsType<ConflictObjectResult>(result.Result);
    }

    [Fact]
    public async Task Register_ReusesAPendingUnverifiedAccount()
    {
        var existing = _db.AddUser(name: "Old Name", email: "ana@example.com", emailVerified: false);
        var controller = CreateController(o => o.Enabled = true);

        await controller.Register(new RegisterRequest("New Name", "ana@example.com", "NewPassword123!"));

        var user = await _db.Users.SingleAsync();
        Assert.Equal(existing.Id, user.Id);
        Assert.Equal("New Name", user.Name);
        Assert.True(BCrypt.Net.BCrypt.Verify("NewPassword123!", user.PasswordHash));
    }

    [Fact]
    public async Task Register_RollsBackTheNewUserWhenTheVerificationEmailFails()
    {
        _mailHandler.StatusCode = System.Net.HttpStatusCode.InternalServerError;
        var controller = CreateController(o => o.Enabled = true);

        var result = await controller.Register(new RegisterRequest("Ana", "ana@example.com", "Password123!"));

        var status = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status500InternalServerError, status.StatusCode);
        Assert.Empty(await _db.Users.ToListAsync());
    }

    [Fact]
    public async Task Login_WithValidCredentials_ReturnsATokenAndTheUser()
    {
        var user = _db.AddUser(email: "ana@example.com", password: "Password123!");
        var controller = CreateController();

        var result = await controller.Login(new LoginRequest("ANA@example.com ", "Password123!"));

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var response = Assert.IsType<AuthResponse>(ok.Value);
        Assert.False(string.IsNullOrWhiteSpace(response.Token));
        Assert.Equal(user.Id, response.User.Id);
    }

    [Fact]
    public async Task Login_IncludesTheRentalRatingSummary()
    {
        var owner = _db.AddUser(name: "Owner");
        var otherOwner = _db.AddUser(name: "Other Owner");
        var renter = _db.AddUser(name: "Renter", email: "renter@example.com", password: "Password123!");
        var item = _db.AddItem(owner);
        var rental = _db.AddRental(item, renter, RentalStatus.Returned);

        _db.RentalReviews.AddRange(
            new RentalReview { RentalId = rental.Id, ReviewerId = owner.Id, RevieweeId = renter.Id, Rating = 5, Comment = "Top" },
            new RentalReview { RentalId = rental.Id, ReviewerId = otherOwner.Id, RevieweeId = renter.Id, Rating = 3, Comment = "Ok" });
        await _db.SaveChangesAsync();

        var controller = CreateController();
        var result = await controller.Login(new LoginRequest("renter@example.com", "Password123!"));

        var response = Assert.IsType<AuthResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(2, response.User.RentalReviewCount);
        Assert.Equal(4d, response.User.AverageRentalRating);
    }

    [Fact]
    public async Task Login_WithAWrongPassword_ReturnsUnauthorized()
    {
        _db.AddUser(email: "ana@example.com", password: "Password123!");
        var controller = CreateController();

        var result = await controller.Login(new LoginRequest("ana@example.com", "WrongPassword"));

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
    }

    [Fact]
    public async Task Login_WithAnUnknownEmail_ReturnsUnauthorized()
    {
        var controller = CreateController();

        var result = await controller.Login(new LoginRequest("nobody@example.com", "Password123!"));

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
    }

    [Fact]
    public async Task Login_WithAnOAuthOnlyAccount_ReturnsUnauthorized()
    {
        _db.AddUser(email: "ana@example.com", password: null);
        var controller = CreateController();

        var result = await controller.Login(new LoginRequest("ana@example.com", "Password123!"));

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
    }

    [Fact]
    public async Task Login_WithAnUnverifiedEmail_IsForbidden()
    {
        _db.AddUser(email: "ana@example.com", password: "Password123!", emailVerified: false);
        var controller = CreateController();

        var result = await controller.Login(new LoginRequest("ana@example.com", "Password123!"));

        var status = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, status.StatusCode);
    }

    [Fact]
    public async Task Login_WithAPermanentBan_IsForbidden()
    {
        var user = _db.AddUser(email: "ana@example.com", password: "Password123!");
        user.IsBanned = true;
        user.BannedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var result = await CreateController().Login(new LoginRequest("ana@example.com", "Password123!"));

        var status = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, status.StatusCode);
        Assert.Equal("Conta suspensa. Contacte o suporte.", status.GetMessage());
    }

    [Fact]
    public async Task Login_WithAnExpiredTemporaryBan_ClearsTheBanAndSucceeds()
    {
        var user = _db.AddUser(email: "ana@example.com", password: "Password123!");
        user.IsBanned = true;
        user.BannedAt = DateTime.UtcNow.AddDays(-3);
        user.BannedUntil = DateTime.UtcNow.AddDays(-1);
        user.BanReason = "Spam";
        await _db.SaveChangesAsync();

        var result = await CreateController().Login(new LoginRequest("ana@example.com", "Password123!"));

        Assert.IsType<OkObjectResult>(result.Result);
        var reloaded = await _db.Users.SingleAsync();
        Assert.False(reloaded.IsBanned);
        Assert.Null(reloaded.BannedUntil);
        Assert.Null(reloaded.BanReason);
    }

    [Fact]
    public async Task VerifyEmail_WithAValidToken_VerifiesTheAccount()
    {
        var controller = CreateController(o => o.Enabled = true);
        await controller.Register(new RegisterRequest("Ana", "ana@example.com", "Password123!"));

        var token = ExtractTokenFromLastEmail();
        var result = await controller.VerifyEmail("ana@example.com", token);

        Assert.IsType<OkObjectResult>(result);
        Assert.True((await _db.Users.SingleAsync()).EmailVerified);
    }

    [Fact]
    public async Task VerifyEmail_WithAnInvalidToken_ReturnsBadRequest()
    {
        var controller = CreateController(o => o.Enabled = true);
        await controller.Register(new RegisterRequest("Ana", "ana@example.com", "Password123!"));

        var result = await controller.VerifyEmail("ana@example.com", "bogus-token");

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.False((await _db.Users.SingleAsync()).EmailVerified);
    }

    [Fact]
    public async Task VerifyEmail_ForAnUnknownEmail_ReturnsBadRequest()
    {
        var result = await CreateController().VerifyEmail("nobody@example.com", "token");

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task VerifyEmail_ViaJsonBody_VerifiesTheAccount()
    {
        var controller = CreateController(o => o.Enabled = true);
        await controller.Register(new RegisterRequest("Ana", "ana@example.com", "Password123!"));

        var result = await controller.VerifyEmail(new VerifyEmailRequest("ANA@example.com", ExtractTokenFromLastEmail()));

        Assert.IsType<OkObjectResult>(result);
        Assert.True((await _db.Users.SingleAsync()).EmailVerified);
    }

    [Fact]
    public async Task ResendVerificationEmail_ForAPendingAccount_SendsANewEmail()
    {
        var controller = CreateController(o => o.Enabled = true);
        await controller.Register(new RegisterRequest("Ana", "ana@example.com", "Password123!"));

        var result = await controller.ResendVerificationEmail(new ResendVerificationEmailRequest("ana@example.com"));

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal(2, _mailHandler.Requests.Count);
    }

    [Fact]
    public async Task ResendVerificationEmail_ForAnUnknownAccount_DoesNotLeakExistenceOrSendEmail()
    {
        var controller = CreateController(o => o.Enabled = true);

        var result = await controller.ResendVerificationEmail(new ResendVerificationEmailRequest("nobody@example.com"));

        Assert.IsType<OkObjectResult>(result);
        Assert.Empty(_mailHandler.Requests);
    }

    [Fact]
    public async Task ResendVerificationEmail_ForAVerifiedAccount_DoesNotSendEmail()
    {
        _db.AddUser(email: "ana@example.com", emailVerified: true);
        var controller = CreateController(o => o.Enabled = true);

        var result = await controller.ResendVerificationEmail(new ResendVerificationEmailRequest("ana@example.com"));

        Assert.IsType<OkObjectResult>(result);
        Assert.Empty(_mailHandler.Requests);
    }

    [Fact]
    public async Task Login_IssuesARefreshTokenStoredOnlyAsAHash()
    {
        _db.AddUser(email: "ana@example.com", password: "Password123!");
        var controller = CreateController();

        var result = await controller.Login(new LoginRequest("ana@example.com", "Password123!"));

        var response = Assert.IsType<AuthResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.False(string.IsNullOrWhiteSpace(response.RefreshToken));

        var stored = await _db.RefreshTokens.SingleAsync();
        Assert.NotEqual(response.RefreshToken, stored.TokenHash);
        Assert.Equal(JwtService.HashRefreshToken(response.RefreshToken!), stored.TokenHash);
        Assert.True(stored.ExpiresAt > DateTime.UtcNow.AddDays(50));
    }

    [Fact]
    public async Task Refresh_ReturnsANewAccessTokenAndRotatesTheRefreshToken()
    {
        _db.AddUser(email: "ana@example.com", password: "Password123!");
        var controller = CreateController();
        var login = Assert.IsType<AuthResponse>(
            Assert.IsType<OkObjectResult>((await controller.Login(new LoginRequest("ana@example.com", "Password123!"))).Result).Value);

        var result = await controller.Refresh(new RefreshTokenRequest(login.RefreshToken!));

        var refreshed = Assert.IsType<AuthResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.False(string.IsNullOrWhiteSpace(refreshed.Token));
        Assert.NotEqual(login.RefreshToken, refreshed.RefreshToken);

        var oldToken = await _db.RefreshTokens
            .SingleAsync(t => t.TokenHash == JwtService.HashRefreshToken(login.RefreshToken!));
        Assert.NotNull(oldToken.RevokedAt);
        Assert.Equal(JwtService.HashRefreshToken(refreshed.RefreshToken!), oldToken.ReplacedByTokenHash);
    }

    [Fact]
    public async Task Refresh_RejectsAnUnknownToken()
    {
        var controller = CreateController();

        var result = await controller.Refresh(new RefreshTokenRequest("not-a-real-token"));

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
    }

    [Fact]
    public async Task Refresh_RejectsAnExpiredToken()
    {
        var user = _db.AddUser(email: "ana@example.com");
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = JwtService.HashRefreshToken("stale-token"),
            ExpiresAt = DateTime.UtcNow.AddDays(-1)
        });
        await _db.SaveChangesAsync();
        var controller = CreateController();

        var result = await controller.Refresh(new RefreshTokenRequest("stale-token"));

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
    }

    [Fact]
    public async Task Refresh_ReusingARotatedTokenRevokesEverySessionForThatUser()
    {
        _db.AddUser(email: "ana@example.com", password: "Password123!");
        var controller = CreateController();
        var login = Assert.IsType<AuthResponse>(
            Assert.IsType<OkObjectResult>((await controller.Login(new LoginRequest("ana@example.com", "Password123!"))).Result).Value);
        await controller.Refresh(new RefreshTokenRequest(login.RefreshToken!));

        // Replaying the already-rotated token looks like theft.
        var result = await controller.Refresh(new RefreshTokenRequest(login.RefreshToken!));

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
        Assert.All(await _db.RefreshTokens.ToListAsync(), t => Assert.NotNull(t.RevokedAt));
    }

    [Fact]
    public async Task Refresh_RejectsABannedUserAndRevokesTheirSessions()
    {
        var user = _db.AddUser(email: "ana@example.com", password: "Password123!");
        var controller = CreateController();
        var login = Assert.IsType<AuthResponse>(
            Assert.IsType<OkObjectResult>((await controller.Login(new LoginRequest("ana@example.com", "Password123!"))).Result).Value);

        user.IsBanned = true;
        await _db.SaveChangesAsync();

        var result = await controller.Refresh(new RefreshTokenRequest(login.RefreshToken!));

        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result.Result).StatusCode);
        Assert.All(await _db.RefreshTokens.ToListAsync(), t => Assert.NotNull(t.RevokedAt));
    }

    [Fact]
    public async Task Logout_RevokesTheRefreshTokenSoItCannotBeReused()
    {
        _db.AddUser(email: "ana@example.com", password: "Password123!");
        var controller = CreateController();
        var login = Assert.IsType<AuthResponse>(
            Assert.IsType<OkObjectResult>((await controller.Login(new LoginRequest("ana@example.com", "Password123!"))).Result).Value);

        await controller.Logout(new RefreshTokenRequest(login.RefreshToken!));

        var stored = await _db.RefreshTokens.SingleAsync();
        Assert.NotNull(stored.RevokedAt);

        var reuse = await controller.Refresh(new RefreshTokenRequest(login.RefreshToken!));
        Assert.IsType<UnauthorizedObjectResult>(reuse.Result);
    }

    [Fact]
    public async Task Logout_WithoutATokenSucceeds()
    {
        var controller = CreateController();

        var result = await controller.Logout(new RefreshTokenRequest(string.Empty));

        Assert.IsType<OkObjectResult>(result);
    }

    private string ExtractTokenFromLastEmail()
    {
        var body = _mailHandler.Requests[^1].Body;
        var marker = "token=";
        var start = body.LastIndexOf(marker, StringComparison.Ordinal);
        Assert.True(start >= 0, "The verification email did not contain a token.");

        start += marker.Length;
        var end = start;
        while (end < body.Length && (char.IsLetterOrDigit(body[end]) || body[end] is '-' or '_'))
            end++;

        return Uri.UnescapeDataString(body[start..end]);
    }
}
