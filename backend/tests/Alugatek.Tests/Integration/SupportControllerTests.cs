using Alugatek.API.Controllers;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Infrastructure.Services;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

namespace Alugatek.Tests.Integration;

public class SupportControllerTests : IDisposable
{
    private readonly AppDbContext _db = TestDb.CreateContext();

    public void Dispose() => _db.Dispose();

    private static JwtService Jwt() => new(new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "alugatek-test-signing-key-that-is-long-enough-1234567890",
            ["Jwt:Issuer"] = "alugatek-tests",
            ["Jwt:Audience"] = "alugatek-clients"
        })
        .Build());

    private SupportAuthController CreateAuthController() =>
        new SupportAuthController(_db, Jwt()).Anonymous();

    private SupportUsersController CreateUsersController(User actor) =>
        new SupportUsersController(_db, NullLogger<SupportUsersController>.Instance).AuthenticateAs(actor);

    [Theory]
    [InlineData(User.RoleSupport)]
    [InlineData(User.RoleAdmin)]
    public async Task Login_SucceedsForStaffRoles(string role)
    {
        _db.AddUser(name: "Staff", email: "staff@alugatek.pt", password: "Password123!", role: role);

        var result = await CreateAuthController().Login(new LoginRequest("STAFF@alugatek.pt ", "Password123!"));

        var response = Assert.IsType<SupportAuthResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(role, response.Role);
        Assert.False(string.IsNullOrWhiteSpace(response.Token));
    }

    [Fact]
    public async Task Login_IsForbiddenForRegularUsers()
    {
        _db.AddUser(email: "user@example.com", password: "Password123!");

        var result = await CreateAuthController().Login(new LoginRequest("user@example.com", "Password123!"));

        var status = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, status.StatusCode);
        Assert.Equal("Acesso de suporte obrigatório.", status.GetMessage());
    }

    [Fact]
    public async Task Login_WithBadCredentials_ReturnsUnauthorized()
    {
        _db.AddUser(email: "staff@alugatek.pt", password: "Password123!", role: User.RoleSupport);

        var result = await CreateAuthController().Login(new LoginRequest("staff@alugatek.pt", "Nope"));

        Assert.IsType<UnauthorizedObjectResult>(result.Result);
    }

    [Fact]
    public async Task Login_IsForbiddenForBannedStaff()
    {
        var staff = _db.AddUser(email: "staff@alugatek.pt", password: "Password123!", role: User.RoleSupport);
        staff.IsBanned = true;
        await _db.SaveChangesAsync();

        var result = await CreateAuthController().Login(new LoginRequest("staff@alugatek.pt", "Password123!"));

        var status = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(StatusCodes.Status403Forbidden, status.StatusCode);
    }

    [Fact]
    public async Task Ban_AppliesAPermanentBanWhenNoDurationIsGiven()
    {
        var support = _db.AddUser(role: User.RoleSupport);
        var target = _db.AddUser();

        var result = await CreateUsersController(support).Ban(target.Id, new BanUserRequest("  Spam  ", null));

        Assert.IsType<OkObjectResult>(result);
        var stored = await _db.Users.SingleAsync(u => u.Id == target.Id);
        Assert.True(stored.IsBanned);
        Assert.Null(stored.BannedUntil);
        Assert.Equal("Spam", stored.BanReason);
    }

    [Fact]
    public async Task Ban_AppliesATemporaryBanWithTheGivenDuration()
    {
        var support = _db.AddUser(role: User.RoleSupport);
        var target = _db.AddUser();

        await CreateUsersController(support).Ban(target.Id, new BanUserRequest("Spam", 7));

        var stored = await _db.Users.SingleAsync(u => u.Id == target.Id);
        Assert.NotNull(stored.BannedUntil);
        Assert.InRange(stored.BannedUntil!.Value, DateTime.UtcNow.AddDays(6.9), DateTime.UtcNow.AddDays(7.1));
    }

    [Fact]
    public async Task Ban_RequiresAReason()
    {
        var support = _db.AddUser(role: User.RoleSupport);
        var target = _db.AddUser();

        var result = await CreateUsersController(support).Ban(target.Id, new BanUserRequest(" ", null));

        Assert.Equal("Ban reason is required.", Assert.IsType<BadRequestObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task Ban_RejectsANonPositiveDuration()
    {
        var support = _db.AddUser(role: User.RoleSupport);
        var target = _db.AddUser();

        var result = await CreateUsersController(support).Ban(target.Id, new BanUserRequest("Spam", 0));

        Assert.Equal(
            "DurationDays must be greater than zero when provided.",
            Assert.IsType<BadRequestObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task Ban_RejectsSelfBans()
    {
        var support = _db.AddUser(role: User.RoleSupport);

        var result = await CreateUsersController(support).Ban(support.Id, new BanUserRequest("Spam", null));

        Assert.Equal("You cannot ban your own account.", Assert.IsType<BadRequestObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task Ban_PreventsSupportStaffFromBanningAdmins()
    {
        var support = _db.AddUser(role: User.RoleSupport);
        var admin = _db.AddUser(role: User.RoleAdmin);

        Assert.IsType<ForbidResult>(await CreateUsersController(support).Ban(admin.Id, new BanUserRequest("Spam", null)));
    }

    [Fact]
    public async Task Ban_AllowsAdminsToBanOtherAdmins()
    {
        var admin = _db.AddUser(role: User.RoleAdmin);
        var otherAdmin = _db.AddUser(role: User.RoleAdmin);

        var result = await CreateUsersController(admin).Ban(otherAdmin.Id, new BanUserRequest("Abuse", null));

        Assert.IsType<OkObjectResult>(result);
        Assert.True((await _db.Users.SingleAsync(u => u.Id == otherAdmin.Id)).IsBanned);
    }

    [Fact]
    public async Task BanByEmail_FindsTheAccountCaseInsensitively()
    {
        var support = _db.AddUser(role: User.RoleSupport);
        var target = _db.AddUser(email: "target@example.com");

        var result = await CreateUsersController(support)
            .BanByEmail(new BanUserByEmailRequest(" TARGET@Example.com ", "Spam", null));

        Assert.IsType<OkObjectResult>(result);
        Assert.True((await _db.Users.SingleAsync(u => u.Id == target.Id)).IsBanned);
    }

    [Fact]
    public async Task BanByEmail_ReturnsNotFoundForAnUnknownEmail()
    {
        var support = _db.AddUser(role: User.RoleSupport);

        var result = await CreateUsersController(support)
            .BanByEmail(new BanUserByEmailRequest("nobody@example.com", "Spam", null));

        Assert.Equal(
            "No account found with that email address.",
            Assert.IsType<NotFoundObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task BanByEmail_RequiresAnEmail()
    {
        var support = _db.AddUser(role: User.RoleSupport);

        var result = await CreateUsersController(support).BanByEmail(new BanUserByEmailRequest(" ", "Spam", null));

        Assert.Equal("Email is required.", Assert.IsType<BadRequestObjectResult>(result).GetMessage());
    }
}
