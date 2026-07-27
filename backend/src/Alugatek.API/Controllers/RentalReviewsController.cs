using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/rental-reviews")]
[Authorize]
public class RentalReviewsController(AppDbContext db) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<RentalUserReviewDto>> Create(CreateRentalUserReviewRequest request)
    {
        if (request.Rating is < 1 or > 5)
            return BadRequest(new { message = "Rating must be between 1 and 5." });

        var reviewerId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == request.RentalId);

        if (rental is null)
            return NotFound(new { message = "Rental not found." });

        if (rental.RenterId != reviewerId && rental.Item.OwnerId != reviewerId)
            return Forbid();

        if (!IsReviewWindowOpen(rental.Status))
            return BadRequest(new { message = "Reviews are only available after payment is completed." });

        var revieweeId = rental.RenterId == reviewerId ? rental.Item.OwnerId : rental.RenterId;

        var alreadyReviewed = await db.RentalReviews.AnyAsync(r =>
            r.RentalId == request.RentalId &&
            r.ReviewerId == reviewerId);

        if (alreadyReviewed)
            return Conflict(new { message = "You have already reviewed this rental." });

        var review = new RentalReview
        {
            RentalId = request.RentalId,
            ReviewerId = reviewerId,
            RevieweeId = revieweeId,
            Rating = request.Rating,
            Comment = request.Comment.Trim()
        };

        db.RentalReviews.Add(review);
        await db.SaveChangesAsync();

        var reviewerDto = new UserDto(
            reviewerId,
            rental.RenterId == reviewerId ? rental.Renter.Name : rental.Item.Owner.Name,
            rental.RenterId == reviewerId ? rental.Renter.Email : rental.Item.Owner.Email,
            rental.RenterId == reviewerId ? rental.Renter.AvatarUrl : rental.Item.Owner.AvatarUrl,
            rental.RenterId == reviewerId ? rental.Renter.Phone : rental.Item.Owner.Phone);

        var revieweeDto = new UserDto(
            revieweeId,
            rental.RenterId == reviewerId ? rental.Item.Owner.Name : rental.Renter.Name,
            rental.RenterId == reviewerId ? rental.Item.Owner.Email : rental.Renter.Email,
            rental.RenterId == reviewerId ? rental.Item.Owner.AvatarUrl : rental.Renter.AvatarUrl,
            rental.RenterId == reviewerId ? rental.Item.Owner.Phone : rental.Renter.Phone);

        return CreatedAtAction(
            nameof(GetEligibility),
            new { rentalId = request.RentalId },
            new RentalUserReviewDto(review.Id, review.RentalId, review.Rating, review.Comment, reviewerDto, revieweeDto, review.CreatedAt));
    }

    [HttpGet("rental/{rentalId:guid}/eligibility")]
    public async Task<ActionResult<RentalReviewEligibilityDto>> GetEligibility(Guid rentalId)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == rentalId);

        if (rental is null)
            return NotFound(new { message = "Rental not found." });

        if (rental.RenterId != userId && rental.Item.OwnerId != userId)
            return Forbid();

        var reviewee = rental.RenterId == userId ? rental.Item.Owner : rental.Renter;
        var revieweeDto = new UserDto(reviewee.Id, reviewee.Name, reviewee.Email, reviewee.AvatarUrl, reviewee.Phone);

        var hasReviewed = await db.RentalReviews.AnyAsync(r =>
            r.RentalId == rentalId &&
            r.ReviewerId == userId);

        if (!IsReviewWindowOpen(rental.Status))
        {
            return Ok(new RentalReviewEligibilityDto(
                rentalId,
                false,
                hasReviewed,
                revieweeDto,
                "Review is available once payment is completed."));
        }

        if (hasReviewed)
        {
            return Ok(new RentalReviewEligibilityDto(
                rentalId,
                false,
                true,
                revieweeDto,
                "You have already reviewed this user for this rental."));
        }

        return Ok(new RentalReviewEligibilityDto(rentalId, true, false, revieweeDto, null));
    }

    private static bool IsReviewWindowOpen(RentalStatus status) =>
        status == RentalStatus.Completed ||
        status == RentalStatus.ReturnRequested ||
        status == RentalStatus.Returned;
}