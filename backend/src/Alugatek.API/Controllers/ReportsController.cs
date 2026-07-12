using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportsController(AppDbContext db) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateReportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { message = "Reason is required." });

        var reporterId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (reporterId == request.ReportedUserId)
            return BadRequest(new { message = "You cannot report yourself." });

        var itemExists = await db.TechItems.AnyAsync(i => i.Id == request.ItemId);
        if (!itemExists)
            return NotFound(new { message = "Item not found." });

        var reportedUserExists = await db.Users.AnyAsync(u => u.Id == request.ReportedUserId);
        if (!reportedUserExists)
            return NotFound(new { message = "Reported user not found." });

        // Prevent duplicate reports from the same reporter for the same item
        var alreadyReported = await db.UserReports.AnyAsync(r =>
            r.ReporterId == reporterId &&
            r.ReportedUserId == request.ReportedUserId &&
            r.ItemId == request.ItemId);

        if (alreadyReported)
            return Conflict(new { message = "You have already reported this user for this listing." });

        db.UserReports.Add(new UserReport
        {
            ReporterId = reporterId,
            ReportedUserId = request.ReportedUserId,
            ItemId = request.ItemId,
            Reason = request.Reason.Trim(),
        });

        await db.SaveChangesAsync();

        return Ok(new { message = "Report submitted." });
    }
}

[ApiController]
[Route("api/support/reports")]
[Authorize(Policy = "SupportAccess")]
public class SupportReportsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var reports = await db.UserReports
            .Include(r => r.Reporter)
            .Include(r => r.ReportedUser)
            .Include(r => r.Item)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                r.Reason,
                r.CreatedAt,
                ReporterName = r.Reporter.Name,
                ReporterEmail = r.Reporter.Email,
                ReportedUserName = r.ReportedUser.Name,
                ReportedUserEmail = r.ReportedUser.Email,
                ReportedUserId = r.ReportedUserId,
                ItemTitle = r.Item.Title,
                ItemId = r.ItemId,
            })
            .ToListAsync();

        return Ok(reports);
    }
}
