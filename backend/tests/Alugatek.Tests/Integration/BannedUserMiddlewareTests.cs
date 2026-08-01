using System.Security.Claims;
using System.Text.Json;
using Alugatek.API.Middleware;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.Tests.Integration;

public class BannedUserMiddlewareTests : IDisposable
{
    private readonly AppDbContext _db = TestDb.CreateContext();

    public void Dispose() => _db.Dispose();

    private async Task<(HttpContext Context, bool ReachedNext, string Body)> InvokeAsync(ClaimsPrincipal principal)
    {
        var reachedNext = false;
        var middleware = new BannedUserMiddleware(_ =>
        {
            reachedNext = true;
            return Task.CompletedTask;
        });

        var context = new DefaultHttpContext { User = principal };
        var responseBody = new MemoryStream();
        context.Response.Body = responseBody;

        await middleware.InvokeAsync(context, _db);

        responseBody.Position = 0;
        return (context, reachedNext, await new StreamReader(responseBody).ReadToEndAsync());
    }

    private static ClaimsPrincipal Authenticated(Guid userId) =>
        new(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], "TestAuth"));

    [Fact]
    public async Task AnonymousRequests_PassThrough()
    {
        var (_, reachedNext, _) = await InvokeAsync(new ClaimsPrincipal(new ClaimsIdentity()));

        Assert.True(reachedNext);
    }

    [Fact]
    public async Task RequestsWithAnUnparsableUserId_PassThrough()
    {
        var principal = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "not-a-guid")], "TestAuth"));

        var (_, reachedNext, _) = await InvokeAsync(principal);

        Assert.True(reachedNext);
    }

    [Fact]
    public async Task RequestsForADeletedUser_PassThrough()
    {
        var (_, reachedNext, _) = await InvokeAsync(Authenticated(Guid.NewGuid()));

        Assert.True(reachedNext);
    }

    [Fact]
    public async Task ActiveUsers_PassThrough()
    {
        var user = _db.AddUser();

        var (context, reachedNext, _) = await InvokeAsync(Authenticated(user.Id));

        Assert.True(reachedNext);
        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
    }

    [Fact]
    public async Task PermanentlyBannedUsers_AreBlockedWithAJsonMessage()
    {
        var user = _db.AddUser();
        user.IsBanned = true;
        user.BannedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var (context, reachedNext, body) = await InvokeAsync(Authenticated(user.Id));

        Assert.False(reachedNext);
        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
        Assert.Equal("application/json", context.Response.ContentType);
        Assert.Equal(
            "Conta suspensa. Contacte o suporte.",
            JsonDocument.Parse(body).RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task TemporarilyBannedUsers_AreBlockedUntilTheBanExpires()
    {
        var user = _db.AddUser();
        user.IsBanned = true;
        user.BannedAt = DateTime.UtcNow;
        user.BannedUntil = DateTime.UtcNow.AddDays(1);
        await _db.SaveChangesAsync();

        var (context, reachedNext, body) = await InvokeAsync(Authenticated(user.Id));

        Assert.False(reachedNext);
        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
        Assert.Contains("Conta suspensa até", JsonDocument.Parse(body).RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task ExpiredBans_AreClearedAndTheRequestProceeds()
    {
        var user = _db.AddUser();
        user.IsBanned = true;
        user.BannedAt = DateTime.UtcNow.AddDays(-3);
        user.BannedUntil = DateTime.UtcNow.AddMinutes(-1);
        user.BanReason = "Spam";
        await _db.SaveChangesAsync();

        var (_, reachedNext, _) = await InvokeAsync(Authenticated(user.Id));

        Assert.True(reachedNext);
        var stored = await _db.Users.SingleAsync();
        Assert.False(stored.IsBanned);
        Assert.Null(stored.BannedAt);
        Assert.Null(stored.BannedUntil);
        Assert.Null(stored.BanReason);
    }

    [Fact]
    public async Task TheSubClaimIsUsedWhenNameIdentifierIsMissing()
    {
        var user = _db.AddUser();
        user.IsBanned = true;
        await _db.SaveChangesAsync();

        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim("sub", user.Id.ToString())], "TestAuth"));

        var (context, reachedNext, _) = await InvokeAsync(principal);

        Assert.False(reachedNext);
        Assert.Equal(StatusCodes.Status403Forbidden, context.Response.StatusCode);
    }
}
