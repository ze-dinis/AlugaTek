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
public class ItemsController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<TechItemDto>>> GetAll(
        [FromQuery] int? categoryId,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var query = db.TechItems
            .Include(i => i.Category)
            .Include(i => i.Owner)
            .Include(i => i.Reviews)
            .Where(i => i.IsAvailable)
            .AsQueryable();

        if (categoryId.HasValue)
            query = query.Where(i => i.CategoryId == categoryId);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(i => i.Title.ToLower().Contains(search.ToLower()));

        var items = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(items.Select(MapToDto));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TechItemDto>> GetById(Guid id)
    {
        var item = await db.TechItems
            .Include(i => i.Category)
            .Include(i => i.Owner)
            .Include(i => i.Reviews).ThenInclude(r => r.Author)
            .FirstOrDefaultAsync(i => i.Id == id);

        return item is null ? NotFound() : Ok(MapToDto(item));
    }

    [Authorize]
    [HttpPost]
    public async Task<ActionResult<TechItemDto>> Create(CreateItemRequest request)
    {
        var ownerId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (!await db.Categories.AnyAsync(c => c.Id == request.CategoryId))
            return BadRequest(new { message = "Invalid category." });

        var item = new TechItem
        {
            Title = request.Title,
            Description = request.Description,
            DailyRate = request.DailyRate,
            ImageUrl = request.ImageUrl,
            CategoryId = request.CategoryId,
            OwnerId = ownerId
        };

        db.TechItems.Add(item);
        await db.SaveChangesAsync();
        await db.Entry(item).Reference(i => i.Category).LoadAsync();
        await db.Entry(item).Reference(i => i.Owner).LoadAsync();

        return CreatedAtAction(nameof(GetById), new { id = item.Id }, MapToDto(item));
    }

    [Authorize]
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<TechItemDto>> Update(Guid id, UpdateItemRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var item = await db.TechItems
            .Include(i => i.Category).Include(i => i.Owner).Include(i => i.Reviews)
            .FirstOrDefaultAsync(i => i.Id == id);

        if (item is null) return NotFound();
        if (item.OwnerId != userId) return Forbid();

        item.Title = request.Title;
        item.Description = request.Description;
        item.DailyRate = request.DailyRate;
        item.ImageUrl = request.ImageUrl;
        item.IsAvailable = request.IsAvailable;

        await db.SaveChangesAsync();
        return Ok(MapToDto(item));
    }

    [Authorize]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var item = await db.TechItems.FindAsync(id);

        if (item is null) return NotFound();
        if (item.OwnerId != userId) return Forbid();

        db.TechItems.Remove(item);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("categories")]
    public async Task<ActionResult<IEnumerable<object>>> GetCategories() =>
        Ok(await db.Categories.Select(c => new { c.Id, c.Name, c.IconUrl }).ToListAsync());

    private static TechItemDto MapToDto(TechItem i) => new(
        i.Id, i.Title, i.Description, i.DailyRate, i.ImageUrl, i.IsAvailable,
        i.Category.Name,
        new UserDto(i.Owner.Id, i.Owner.Name, i.Owner.Email, i.Owner.AvatarUrl, i.Owner.Phone),
        i.Reviews.Count > 0 ? i.Reviews.Average(r => r.Rating) : null,
        i.CreatedAt);
}
