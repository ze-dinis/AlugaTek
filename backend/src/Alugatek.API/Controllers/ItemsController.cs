using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.API.Storage;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ItemsController(AppDbContext db, IItemImageStorage imageStorage) : ControllerBase
{
    private static readonly HashSet<string> AllowedImageContentTypes =
    ["image/jpeg", "image/png", "image/webp"];

    private static readonly HashSet<string> PortugueseDistricts =
    [
        "Aveiro", "Beja", "Braga", "Braganca", "Castelo Branco", "Coimbra", "Evora", "Faro",
        "Guarda", "Leiria", "Lisboa", "Portalegre", "Porto", "Santarem", "Setubal", "Viana do Castelo",
        "Vila Real", "Viseu", "Acores", "Madeira"
    ];

    private const long MaxPhotoSizeBytes = 5 * 1024 * 1024;

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
    [Consumes("application/json")]
    public async Task<ActionResult<TechItemDto>> Create(CreateItemRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ImageUrl))
            return BadRequest(new { message = "Image is required. Use /api/items/upload with a photo file." });

        return await CreateItemAsync(
            request.Title,
            request.Description,
            request.District,
            request.DailyRate,
            request.ImageUrl,
            request.CategoryId);
    }

    [Authorize]
    [HttpPost("upload")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<TechItemDto>> CreateWithPhoto([FromForm] CreateItemWithPhotoRequest request)
    {
        if (request.Photo is null)
            return BadRequest(new { message = "Photo is required." });

        if (request.Photo.Length == 0)
            return BadRequest(new { message = "Photo file is empty." });

        if (request.Photo.Length > MaxPhotoSizeBytes)
            return BadRequest(new { message = "Photo must be at most 5 MB." });

        if (!AllowedImageContentTypes.Contains(request.Photo.ContentType))
            return BadRequest(new { message = "Unsupported photo format. Use JPEG, PNG, or WEBP." });

        var imageUrl = await imageStorage.SaveAsync(request.Photo, HttpContext.RequestAborted);

        return await CreateItemAsync(
            request.Title,
            request.Description,
            request.District,
            request.DailyRate,
            imageUrl,
            request.CategoryId);
    }

    private async Task<ActionResult<TechItemDto>> CreateItemAsync(
        string title,
        string description,
        string district,
        decimal dailyRate,
        string? imageUrl,
        int categoryId)
    {
        var ownerId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (!await db.Categories.AnyAsync(c => c.Id == categoryId))
            return BadRequest(new { message = "Invalid category." });

        if (string.IsNullOrWhiteSpace(district))
            return BadRequest(new { message = "District is required." });

        var normalizedDistrict = district.Trim();
        if (!PortugueseDistricts.Contains(normalizedDistrict))
            return BadRequest(new { message = "District must be a valid Portuguese district." });

        var item = new TechItem
        {
            Title = title,
            Description = description,
            District = normalizedDistrict,
            DailyRate = dailyRate,
            ImageUrl = imageUrl,
            CategoryId = categoryId,
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

        if (string.IsNullOrWhiteSpace(request.District))
            return BadRequest(new { message = "District is required." });

        var normalizedDistrict = request.District.Trim();
        if (!PortugueseDistricts.Contains(normalizedDistrict))
            return BadRequest(new { message = "District must be a valid Portuguese district." });

        item.Title = request.Title;
        item.Description = request.Description;
        item.District = normalizedDistrict;
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

    [Authorize]
    [HttpGet("my")]
    public async Task<ActionResult<IEnumerable<TechItemDto>>> GetMyItems()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var items = await db.TechItems
            .Include(i => i.Category)
            .Include(i => i.Owner)
            .Include(i => i.Reviews)
            .Where(i => i.OwnerId == userId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();

        return Ok(items.Select(MapToDto));
    }

    [HttpGet("categories")]
    public async Task<ActionResult<IEnumerable<object>>> GetCategories() =>
        Ok(await db.Categories.Select(c => new { c.Id, c.Name, c.IconUrl }).ToListAsync());

    private static TechItemDto MapToDto(TechItem i) => new(
        i.Id, i.Title, i.Description, i.District, i.DailyRate, i.ImageUrl, i.IsAvailable,
        i.Category.Name,
        new UserDto(i.Owner.Id, i.Owner.Name, i.Owner.Email, i.Owner.AvatarUrl, i.Owner.Phone),
        i.Reviews.Count > 0 ? i.Reviews.Average(r => r.Rating) : null,
        i.CreatedAt);
}
