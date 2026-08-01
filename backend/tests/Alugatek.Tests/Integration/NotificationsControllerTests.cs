using Alugatek.API.Controllers;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.Tests.Integration;

public class NotificationsControllerTests : IDisposable
{
    private readonly AppDbContext _db = TestDb.CreateContext();

    public void Dispose() => _db.Dispose();

    private NotificationsController CreateController(User user) =>
        new NotificationsController(_db).AuthenticateAs(user);

    [Fact]
    public async Task RegisterDeviceToken_StoresTheTokenNormalized()
    {
        var user = _db.AddUser();

        var result = await CreateController(user)
            .RegisterDeviceToken(new RegisterDeviceTokenRequest("  device-token-1  ", "ANDROID"));

        Assert.IsType<OkResult>(result);
        var token = await _db.DevicePushTokens.SingleAsync();
        Assert.Equal("device-token-1", token.Token);
        Assert.Equal("android", token.Platform);
        Assert.Equal(user.Id, token.UserId);
    }

    [Fact]
    public async Task RegisterDeviceToken_DefaultsToAndroidWhenNoPlatformIsGiven()
    {
        var user = _db.AddUser();

        await CreateController(user).RegisterDeviceToken(new RegisterDeviceTokenRequest("device-token-1", "  "));

        Assert.Equal("android", (await _db.DevicePushTokens.SingleAsync()).Platform);
    }

    [Fact]
    public async Task RegisterDeviceToken_ReassignsAnExistingTokenToTheNewOwner()
    {
        var first = _db.AddUser();
        var second = _db.AddUser();

        await CreateController(first).RegisterDeviceToken(new RegisterDeviceTokenRequest("shared-token", "android"));
        await CreateController(second).RegisterDeviceToken(new RegisterDeviceTokenRequest("shared-token", "ios"));

        var token = await _db.DevicePushTokens.SingleAsync();
        Assert.Equal(second.Id, token.UserId);
        Assert.Equal("ios", token.Platform);
    }

    [Fact]
    public async Task RegisterDeviceToken_RequiresAToken()
    {
        var user = _db.AddUser();

        var result = await CreateController(user).RegisterDeviceToken(new RegisterDeviceTokenRequest("  ", "android"));

        Assert.Equal("Device token is required.", Assert.IsType<BadRequestObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task UnregisterDeviceToken_RemovesOnlyTheCallersToken()
    {
        var owner = _db.AddUser();
        var other = _db.AddUser();
        _db.DevicePushTokens.AddRange(
            new DevicePushToken { UserId = owner.Id, Token = "mine", Platform = "android" },
            new DevicePushToken { UserId = other.Id, Token = "theirs", Platform = "android" });
        await _db.SaveChangesAsync();

        var result = await CreateController(owner).UnregisterDeviceToken(new UnregisterDeviceTokenRequest("mine"));

        Assert.IsType<OkResult>(result);
        Assert.Equal("theirs", (await _db.DevicePushTokens.SingleAsync()).Token);
    }

    [Fact]
    public async Task UnregisterDeviceToken_IsANoOpForAnUnknownToken()
    {
        var user = _db.AddUser();

        var result = await CreateController(user).UnregisterDeviceToken(new UnregisterDeviceTokenRequest("missing"));

        Assert.IsType<OkResult>(result);
    }

    [Fact]
    public async Task UnregisterDeviceToken_RequiresAToken()
    {
        var user = _db.AddUser();

        var result = await CreateController(user).UnregisterDeviceToken(new UnregisterDeviceTokenRequest(" "));

        Assert.Equal("Device token is required.", Assert.IsType<BadRequestObjectResult>(result).GetMessage());
    }
}
