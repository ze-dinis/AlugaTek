using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/support/users")]
[Authorize(Policy = "SupportAccess")]
public class SupportUsersController(AppDbContext db, ILogger<SupportUsersController> logger) : ControllerBase
{
    [HttpPost("{userId:guid}/ban")]
    public async Task<IActionResult> Ban(Guid userId, BanUserRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { message = "Ban reason is required." });

        if (request.DurationDays is <= 0)
            return BadRequest(new { message = "DurationDays must be greater than zero when provided." });

        var actorId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var actorRole = User.FindFirstValue(ClaimTypes.Role) ?? Alugatek.Domain.Entities.User.RoleUser;

        if (actorId == userId)
            return BadRequest(new { message = "You cannot ban your own account." });

        var target = await db.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (target is null)
            return NotFound(new { message = "User not found." });

        if (target.Role == Alugatek.Domain.Entities.User.RoleAdmin && actorRole != Alugatek.Domain.Entities.User.RoleAdmin)
            return Forbid();

        var now = DateTime.UtcNow;
        target.IsBanned = true;
        target.BannedAt = now;
        target.BannedUntil = request.DurationDays.HasValue ? now.AddDays(request.DurationDays.Value) : null;
        target.BanReason = request.Reason.Trim();

        await db.SaveChangesAsync();

        logger.LogWarning(
            "User {TargetUserId} was banned by {ActorUserId}. DurationDays={DurationDays}. Reason={Reason}",
            target.Id,
            actorId,
            request.DurationDays,
            target.BanReason);

        return Ok(new
        {
            target.Id,
            target.IsBanned,
            target.BannedAt,
            target.BannedUntil,
            target.BanReason
        });
    }
}
