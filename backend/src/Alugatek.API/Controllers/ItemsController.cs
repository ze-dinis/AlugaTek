using System.Security.Claims;
using System.Globalization;
using System.Text;
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

    private static readonly Dictionary<string, string> PortugueseDistrictsByKey = new(StringComparer.Ordinal)
    {
        ["aveiro"] = "Aveiro",
        ["beja"] = "Beja",
        ["braga"] = "Braga",
        ["braganca"] = "Bragança",
        ["castelo branco"] = "Castelo Branco",
        ["coimbra"] = "Coimbra",
        ["evora"] = "Évora",
        ["faro"] = "Faro",
        ["guarda"] = "Guarda",
        ["leiria"] = "Leiria",
        ["lisboa"] = "Lisboa",
        ["portalegre"] = "Portalegre",
        ["porto"] = "Porto",
        ["santarem"] = "Santarém",
        ["setubal"] = "Setúbal",
        ["viana do castelo"] = "Viana do Castelo",
        ["vila real"] = "Vila Real",
        ["viseu"] = "Viseu",
        ["acores"] = "Açores",
        ["madeira"] = "Madeira"
    };

    private const long MaxPhotoSizeBytes = 5 * 1024 * 1024;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TechItemDto>>> GetAll(
        [FromQuery] int? categoryId,
        [FromQuery] string? search,
        [FromQuery] string? district,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var query = db.TechItems
            .Include(i => i.Category)
            .Include(i => i.Owner)
            .Include(i => i.Reviews)
            .AsQueryable();

        if (categoryId.HasValue)
            query = query.Where(i => i.CategoryId == categoryId);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var normalizedSearch = RemoveDiacritics(search.Trim());
            query = query.Where(i => EF.Functions.ILike(EF.Functions.Unaccent(i.Title), $"%{normalizedSearch}%"));
        }

        if (!string.IsNullOrWhiteSpace(district))
        {
            var requestedDistrict = district.Trim();
            var canonicalDistrict = TryGetCanonicalDistrict(requestedDistrict);

            query = canonicalDistrict is null
                ? query.Where(i => EF.Functions.ILike(i.District, requestedDistrict))
                : query.Where(i =>
                    EF.Functions.ILike(i.District, canonicalDistrict) ||
                    EF.Functions.ILike(i.District, ToLegacyDistrict(canonicalDistrict)));
        }

        var items = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var inProgressItemIds = await db.Rentals
            .Where(r => r.Status == RentalStatus.Active
                || r.Status == RentalStatus.Completed
                || r.Status == RentalStatus.ReturnRequested)
            .Select(r => r.ItemId)
            .Distinct()
            .ToListAsync();

        return Ok(items.Select(i => MapToDto(i, i.IsAvailable && !inProgressItemIds.Contains(i.Id))));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<TechItemDto>> GetById(Guid id)
    {
        var item = await db.TechItems
            .Include(i => i.Category)
            .Include(i => i.Owner)
            .Include(i => i.Reviews).ThenInclude(r => r.Author)
            .FirstOrDefaultAsync(i => i.Id == id);

        if (item is null)
            return NotFound();

        var hasConfirmedReservation = await db.Rentals
            .AnyAsync(r => r.ItemId == id
                && (r.Status == RentalStatus.Active
                    || r.Status == RentalStatus.Completed
                    || r.Status == RentalStatus.ReturnRequested));

        return Ok(MapToDto(item, item.IsAvailable && !hasConfirmedReservation));
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
            request.Caucao,
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
            request.Caucao,
            imageUrl,
            request.CategoryId);
    }

    private async Task<ActionResult<TechItemDto>> CreateItemAsync(
        string title,
        string description,
        string district,
        decimal dailyRate,
        decimal caucao,
        string? imageUrl,
        int categoryId)
    {
        var ownerId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (!await db.Categories.AnyAsync(c => c.Id == categoryId))
            return BadRequest(new { message = "Invalid category." });

        if (string.IsNullOrWhiteSpace(district))
            return BadRequest(new { message = "District is required." });

        var canonicalDistrict = TryGetCanonicalDistrict(district);
        if (canonicalDistrict is null)
            return BadRequest(new { message = "District must be a valid Portuguese district." });

        var item = new TechItem
        {
            Title = title,
            Description = description,
            District = canonicalDistrict,
            DailyRate = dailyRate,
            Caucao = caucao < 0 ? 0 : caucao,
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

        var canonicalDistrict = TryGetCanonicalDistrict(request.District);
        if (canonicalDistrict is null)
            return BadRequest(new { message = "District must be a valid Portuguese district." });

        item.Title = request.Title;
        item.Description = request.Description;
        item.District = canonicalDistrict;
        item.DailyRate = request.DailyRate;
        item.Caucao = request.Caucao < 0 ? 0 : request.Caucao;
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

        return Ok(items.Select(i => MapToDto(i)));
    }

    [HttpGet("categories")]
    public async Task<ActionResult<IEnumerable<object>>> GetCategories() =>
        Ok(await db.Categories.Select(c => new { c.Id, c.Name, c.IconUrl }).ToListAsync());

    private static TechItemDto MapToDto(TechItem i, bool? isAvailableOverride = null) => new(
        i.Id, i.Title, i.Description, i.District, i.DailyRate, i.Caucao, i.ImageUrl, isAvailableOverride ?? i.IsAvailable,
        i.Category.Name,
        new UserDto(i.Owner.Id, i.Owner.Name, i.Owner.Email, i.Owner.AvatarUrl, i.Owner.Phone),
        i.Reviews.Count > 0 ? i.Reviews.Average(r => r.Rating) : null,
        i.CreatedAt);

    private static string? TryGetCanonicalDistrict(string district)
    {
        var key = NormalizeDistrictKey(district);
        return PortugueseDistrictsByKey.TryGetValue(key, out var canonical) ? canonical : null;
    }

    private static string ToLegacyDistrict(string district) =>
        RemoveDiacritics(district).Normalize(NormalizationForm.FormC);

    private static string NormalizeDistrictKey(string district) =>
        RemoveDiacritics(district.Trim()).ToLowerInvariant();

    private static string RemoveDiacritics(string input)
    {
        var normalized = input.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var c in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(c);
            if (category != UnicodeCategory.NonSpacingMark)
            {
                builder.Append(c);
            }
        }

        return builder.ToString();
    }
}
