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
public class ReviewsController(AppDbContext db) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<ReviewDto>> Create(CreateReviewRequest request)
    {
        if (request.Rating is < 1 or > 5)
            return BadRequest(new { message = "Rating must be between 1 and 5." });

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        // Reviewer must have completed a rental for this item
        var hasRented = await db.Rentals.AnyAsync(r =>
            r.ItemId == request.ItemId &&
            r.RenterId == userId &&
            r.Status == RentalStatus.Completed);

        if (!hasRented)
            return BadRequest(new { message = "You can only review items you have rented." });

        var alreadyReviewed = await db.Reviews.AnyAsync(r =>
            r.ItemId == request.ItemId && r.AuthorId == userId);

        if (alreadyReviewed)
            return Conflict(new { message = "You have already reviewed this item." });

        var review = new Review
        {
            ItemId = request.ItemId,
            AuthorId = userId,
            Rating = request.Rating,
            Comment = request.Comment
        };

        db.Reviews.Add(review);
        await db.SaveChangesAsync();
        await db.Entry(review).Reference(r => r.Author).LoadAsync();

        return CreatedAtAction(nameof(GetByItem), new { itemId = request.ItemId },
            MapToDto(review));
    }

    [AllowAnonymous]
    [HttpGet("item/{itemId:guid}")]
    public async Task<ActionResult<IEnumerable<ReviewDto>>> GetByItem(Guid itemId)
    {
        var reviews = await db.Reviews
            .Include(r => r.Author)
            .Where(r => r.ItemId == itemId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return Ok(reviews.Select(MapToDto));
    }

    private static ReviewDto MapToDto(Review r) => new(
        r.Id, r.Rating, r.Comment,
        new UserDto(r.Author.Id, r.Author.Name, r.Author.Email, r.Author.AvatarUrl, r.Author.Phone),
        r.CreatedAt);
}
