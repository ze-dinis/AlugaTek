using Alugatek.API.DTOs;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UsersController(AppDbContext db) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("{userId:guid}/rental-rating")]
    public async Task<ActionResult<UserRentalRatingSummaryDto>> GetRentalRating(Guid userId)
    {
        var userExists = await db.Users.AnyAsync(u => u.Id == userId);
        if (!userExists)
            return NotFound(new { message = "User not found." });

        var reviewQuery = db.RentalReviews.Where(r => r.RevieweeId == userId);
        var reviewCount = await reviewQuery.CountAsync();
        var averageRating = reviewCount > 0
            ? await reviewQuery.AverageAsync(r => (double?)r.Rating)
            : null;

        return Ok(new UserRentalRatingSummaryDto(userId, averageRating, reviewCount));
    }

    [AllowAnonymous]
    [HttpGet("{userId:guid}/rental-reviews")]
    public async Task<ActionResult<IReadOnlyList<UserRentalReviewCommentDto>>> GetRentalReviews(
        Guid userId,
        [FromQuery] int? limit = null,
        [FromQuery] int? skip = null,
        [FromQuery] string? sort = null)
    {
        var userExists = await db.Users.AnyAsync(u => u.Id == userId);
        if (!userExists)
            return NotFound(new { message = "User not found." });

        var resolvedLimit = limit.GetValueOrDefault(20);
        var resolvedSkip = skip.GetValueOrDefault(0);
        if (resolvedLimit <= 0)
            return BadRequest(new { message = "Limit must be greater than 0." });
        if (resolvedSkip < 0)
            return BadRequest(new { message = "Skip cannot be negative." });

        if (resolvedLimit > 100)
            resolvedLimit = 100;

        var reviewQuery = db.RentalReviews
            .AsNoTracking()
            .Where(r => r.RevieweeId == userId);

        var normalizedSort = (sort ?? "recent").Trim().ToLowerInvariant();
        reviewQuery = normalizedSort switch
        {
            "highest" => reviewQuery.OrderByDescending(r => r.Rating).ThenByDescending(r => r.CreatedAt),
            "lowest" => reviewQuery.OrderBy(r => r.Rating).ThenByDescending(r => r.CreatedAt),
            _ => reviewQuery.OrderByDescending(r => r.CreatedAt)
        };

        var reviews = await reviewQuery
            .Skip(resolvedSkip)
            .Take(resolvedLimit)
            .Select(r => new UserRentalReviewCommentDto(
                r.Id,
                r.RentalId,
                r.Rating,
                r.Comment,
                r.CreatedAt,
                new UserDto(
                    r.Reviewer.Id,
                    r.Reviewer.Name,
                    r.Reviewer.Email,
                    r.Reviewer.AvatarUrl,
                    r.Reviewer.Phone),
                r.Rental.Item.Title))
            .ToListAsync();

        return Ok(reviews);
    }
}
