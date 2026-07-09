using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class NotificationsController(AppDbContext db) : ControllerBase
{
    [HttpPost("device-token/register")]
    public async Task<IActionResult> RegisterDeviceToken(RegisterDeviceTokenRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (string.IsNullOrWhiteSpace(request.Token))
            return BadRequest(new { message = "Device token is required." });

        var normalizedPlatform = string.IsNullOrWhiteSpace(request.Platform)
            ? "android"
            : request.Platform.Trim().ToLowerInvariant();

        var token = request.Token.Trim();
        var existing = await db.DevicePushTokens.SingleOrDefaultAsync(t => t.Token == token);

        if (existing is null)
        {
            db.DevicePushTokens.Add(new DevicePushToken
            {
                UserId = userId,
                Token = token,
                Platform = normalizedPlatform,
                UpdatedAt = DateTime.UtcNow
            });
        }
        else
        {
            existing.UserId = userId;
            existing.Platform = normalizedPlatform;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        return Ok();
    }

    [HttpPost("device-token/unregister")]
    public async Task<IActionResult> UnregisterDeviceToken(UnregisterDeviceTokenRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (string.IsNullOrWhiteSpace(request.Token))
            return BadRequest(new { message = "Device token is required." });

        var token = request.Token.Trim();
        var existing = await db.DevicePushTokens
            .Where(t => t.UserId == userId && t.Token == token)
            .ToListAsync();

        if (existing.Count == 0)
            return Ok();

        db.DevicePushTokens.RemoveRange(existing);
        await db.SaveChangesAsync();

        return Ok();
    }
}
