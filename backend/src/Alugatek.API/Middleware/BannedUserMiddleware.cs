using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
using Alugatek.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Middleware;

public class BannedUserMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, AppDbContext db)
    {
        if (context.User.Identity?.IsAuthenticated != true)
        {
            await next(context);
            return;
        }

        var userIdClaim = context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.User.FindFirstValue(JwtRegisteredClaimNames.Sub);

        if (!Guid.TryParse(userIdClaim, out var userId))
        {
            await next(context);
            return;
        }

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId);
        if (user is null)
        {
            await next(context);
            return;
        }

        if (RefreshExpiredBan(user))
            await db.SaveChangesAsync();

        var banMessage = GetBanMessage(user);
        if (banMessage is null)
        {
            await next(context);
            return;
        }

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new { message = banMessage }));
    }

    private static bool RefreshExpiredBan(Domain.Entities.User user)
    {
        if (!user.IsBanned || user.BannedUntil is null || user.BannedUntil > DateTime.UtcNow)
            return false;

        user.IsBanned = false;
        user.BannedAt = null;
        user.BannedUntil = null;
        user.BanReason = null;
        return true;
    }

    private static string? GetBanMessage(Domain.Entities.User user)
    {
        if (!user.IsBanned)
            return null;

        if (user.BannedUntil is not null)
            return $"Conta suspensa até {user.BannedUntil.Value:yyyy-MM-dd HH:mm} UTC.";

        return "Conta suspensa. Contacte o suporte.";
    }
}