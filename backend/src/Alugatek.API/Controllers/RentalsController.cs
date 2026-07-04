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
public class RentalsController(AppDbContext db) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<RentalDto>> Create(CreateRentalRequest request)
    {
        var renterId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var item = await db.TechItems
            .Include(i => i.Category).Include(i => i.Owner).Include(i => i.Reviews)
            .FirstOrDefaultAsync(i => i.Id == request.ItemId);

        if (item is null) return NotFound(new { message = "Item not found." });
        if (!item.IsAvailable) return BadRequest(new { message = "Item is not available." });
        if (item.OwnerId == renterId) return BadRequest(new { message = "You cannot rent your own item." });
        if (request.StartDate >= request.EndDate) return BadRequest(new { message = "Invalid date range." });
        if (request.StartDate < DateTime.UtcNow.Date) return BadRequest(new { message = "Start date cannot be in the past." });

        var days = (request.EndDate - request.StartDate).Days;
        var rental = new Rental
        {
            ItemId = request.ItemId,
            RenterId = renterId,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            TotalPrice = item.DailyRate * days
        };

        item.IsAvailable = false;
        db.Rentals.Add(rental);
        await db.SaveChangesAsync();

        var renter = await db.Users.FindAsync(renterId);
        return CreatedAtAction(nameof(GetById), new { id = rental.Id }, MapToDto(rental, item, renter!));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<RentalDto>> GetById(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId && rental.Item.OwnerId != userId) return Forbid();

        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpGet("my")]
    public async Task<ActionResult<IEnumerable<RentalDto>>> GetMyRentals()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rentals = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
            .Include(r => r.Renter)
            .Where(r => r.RenterId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return Ok(rentals.Select(r => MapToDto(r, r.Item, r.Renter)));
    }

    [HttpPatch("{id:guid}/cancel")]
    public async Task<ActionResult<RentalDto>> Cancel(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId) return Forbid();
        if (rental.Status != RentalStatus.Pending && rental.Status != RentalStatus.Active)
            return BadRequest(new { message = "Rental cannot be cancelled." });

        rental.Status = RentalStatus.Cancelled;
        rental.Item.IsAvailable = true;
        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    private static RentalDto MapToDto(Rental r, TechItem item, User renter)
    {
        var itemDto = new TechItemDto(
            item.Id, item.Title, item.Description, item.DailyRate, item.ImageUrl,
            item.IsAvailable, item.Category.Name,
            new UserDto(item.Owner.Id, item.Owner.Name, item.Owner.Email, item.Owner.AvatarUrl, item.Owner.Phone),
            item.Reviews.Count > 0 ? item.Reviews.Average(rev => rev.Rating) : null,
            item.CreatedAt);

        return new RentalDto(
            r.Id, itemDto,
            new UserDto(renter.Id, renter.Name, renter.Email, renter.AvatarUrl, renter.Phone),
            r.StartDate, r.EndDate, r.TotalPrice, r.Status.ToString(), r.CreatedAt);
    }
}
