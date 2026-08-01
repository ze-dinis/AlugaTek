using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/support/auth")]
public class SupportAuthController(AppDbContext db, JwtService jwt) : ControllerBase
{
    [HttpPost("login")]
    public async Task<ActionResult<SupportAuthResponse>> Login(LoginRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);

        if (user is null || user.PasswordHash is null ||
            !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return Unauthorized(new { message = "Credenciais inválidas." });
        }

        if (RefreshExpiredBan(user))
            await db.SaveChangesAsync();

        var banMessage = GetBanMessage(user);
        if (banMessage is not null)
            return StatusCode(StatusCodes.Status403Forbidden, new { message = banMessage });

        if (user.Role is not Alugatek.Domain.Entities.User.RoleSupport and not Alugatek.Domain.Entities.User.RoleAdmin)
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Acesso de suporte obrigatório." });

        return Ok(new SupportAuthResponse(
            jwt.GenerateToken(user, JwtService.SupportTokenLifetime), user.Name, user.Role));
    }

    private static bool RefreshExpiredBan(User user)
    {
        if (!user.IsBanned || user.BannedUntil is null || user.BannedUntil > DateTime.UtcNow)
            return false;

        user.IsBanned = false;
        user.BannedAt = null;
        user.BannedUntil = null;
        user.BanReason = null;
        return true;
    }

    private static string? GetBanMessage(User user)
    {
        if (!user.IsBanned)
            return null;

        if (user.BannedUntil is not null)
            return $"Conta suspensa até {user.BannedUntil.Value:yyyy-MM-dd HH:mm} UTC.";

        return "Conta suspensa. Contacte o suporte.";
    }
}
