using System.Security.Claims;
using System.Globalization;
using System.Text;
using System.Text.Json;
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
    private const int MaxPhotosCount = 5;

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
            query = query.Where(i =>
                EF.Functions.ILike(EF.Functions.Unaccent(i.Title), $"%{normalizedSearch}%") ||
                EF.Functions.ILike(EF.Functions.Unaccent(i.Description), $"%{normalizedSearch}%"));
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

        var favoriteItemIds = await GetFavoriteItemIdsAsync(items.Select(i => i.Id));

        return Ok(items.Select(i => MapToDto(i, i.IsAvailable && !inProgressItemIds.Contains(i.Id), favoriteItemIds.Contains(i.Id))));
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

        var favoriteItemIds = await GetFavoriteItemIdsAsync([id]);

        return Ok(MapToDto(item, item.IsAvailable && !hasConfirmedReservation, favoriteItemIds.Contains(id)));
    }

    [Authorize]
    [HttpPost]
    [Consumes("application/json")]
    public async Task<ActionResult<TechItemDto>> Create(CreateItemRequest request)
    {
        if (request.ImageUrls is { Count: > MaxPhotosCount })
            return BadRequest(new { message = $"You can upload up to {MaxPhotosCount} photos." });

        var imageUrls = request.ImageUrls?
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Select(url => url.Trim())
            .Distinct(StringComparer.Ordinal)
            .Take(MaxPhotosCount)
            .ToList() ?? [];

        if (imageUrls.Count == 0 && !string.IsNullOrWhiteSpace(request.ImageUrl))
            imageUrls.Add(request.ImageUrl.Trim());

        if (imageUrls.Count == 0)
            return BadRequest(new { message = "Image is required. Use /api/items/upload with a photo file." });

        return await CreateItemAsync(
            request.Title,
            request.Description,
            request.District,
            request.Localidade,
            request.DailyRate,
            request.Caucao,
            imageUrls,
            request.CategoryId);
    }

    [Authorize]
    [HttpPost("upload")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<TechItemDto>> CreateWithPhoto([FromForm] CreateItemWithPhotoRequest request)
    {
        var photos = new List<IFormFile>();
        if (request.Photo is not null)
            photos.Add(request.Photo);
        if (request.Photos is { Count: > 0 })
            photos.AddRange(request.Photos.Where(p => p is not null));

        if (photos.Count == 0)
            return BadRequest(new { message = "Photo is required." });

        if (photos.Count > MaxPhotosCount)
            return BadRequest(new { message = $"You can upload up to {MaxPhotosCount} photos." });

        foreach (var photo in photos)
        {
            if (photo.Length == 0)
                return BadRequest(new { message = "Photo file is empty." });

            if (photo.Length > MaxPhotoSizeBytes)
                return BadRequest(new { message = "Photo must be at most 5 MB." });

            if (!AllowedImageContentTypes.Contains(photo.ContentType))
                return BadRequest(new { message = "Unsupported photo format. Use JPEG, PNG, or WEBP." });
        }

        var imageUrls = new List<string>(photos.Count);
        foreach (var photo in photos)
        {
            imageUrls.Add(await imageStorage.SaveAsync(photo, HttpContext.RequestAborted));
        }

        return await CreateItemAsync(
            request.Title,
            request.Description,
            request.District,
            request.Localidade,
            request.DailyRate,
            request.Caucao,
            imageUrls,
            request.CategoryId);
    }

    [Authorize]
    [HttpPost("upload-image")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<object>> UploadImage([FromForm] IFormFile photo, CancellationToken cancellationToken)
    {
        if (photo is null || photo.Length == 0)
            return BadRequest(new { message = "Photo is required." });

        if (photo.Length > MaxPhotoSizeBytes)
            return BadRequest(new { message = "Photo must be at most 5 MB." });

        if (!AllowedImageContentTypes.Contains(photo.ContentType))
            return BadRequest(new { message = "Unsupported photo format. Use JPEG, PNG, or WEBP." });

        var imageUrl = await imageStorage.SaveAsync(photo, cancellationToken);
        return Ok(new { imageUrl });
    }

    [Authorize]
    [HttpPost("upload-images")]
    [Consumes("multipart/form-data")]
    public async Task<ActionResult<object>> UploadImages([FromForm] List<IFormFile> photos, CancellationToken cancellationToken)
    {
        if (photos is null || photos.Count == 0)
            return BadRequest(new { message = "At least one photo is required." });

        if (photos.Count > MaxPhotosCount)
            return BadRequest(new { message = $"You can upload up to {MaxPhotosCount} photos." });

        foreach (var photo in photos)
        {
            if (photo.Length == 0)
                return BadRequest(new { message = "Photo file is empty." });

            if (photo.Length > MaxPhotoSizeBytes)
                return BadRequest(new { message = "Photo must be at most 5 MB." });

            if (!AllowedImageContentTypes.Contains(photo.ContentType))
                return BadRequest(new { message = "Unsupported photo format. Use JPEG, PNG, or WEBP." });
        }

        var imageUrls = new List<string>(photos.Count);
        foreach (var photo in photos)
        {
            imageUrls.Add(await imageStorage.SaveAsync(photo, cancellationToken));
        }

        return Ok(new { imageUrls });
    }

    private async Task<ActionResult<TechItemDto>> CreateItemAsync(
        string title,
        string description,
        string district,
        string? localidade,
        decimal dailyRate,
        decimal caucao,
        IReadOnlyList<string> imageUrls,
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

        if (caucao <= 0)
            return BadRequest(new { message = "Caucao is required and must be greater than 0." });

        var item = new TechItem
        {
            Title = title,
            Description = description,
            District = canonicalDistrict,
            Localidade = NormalizeOptionalText(localidade),
            DailyRate = dailyRate,
            Caucao = caucao,
            ImageUrl = imageUrls.FirstOrDefault(),
            ImageUrlsJson = imageUrls.Count > 0 ? JsonSerializer.Serialize(imageUrls) : null,
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
        item.Localidade = NormalizeOptionalText(request.Localidade);
        item.DailyRate = request.DailyRate;
        item.Caucao = request.Caucao < 0 ? 0 : request.Caucao;
        if (request.ImageUrls is { Count: > MaxPhotosCount })
            return BadRequest(new { message = $"You can upload up to {MaxPhotosCount} photos." });

        var normalizedImageUrls = request.ImageUrls?
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Select(url => url.Trim())
            .Distinct(StringComparer.Ordinal)
            .Take(MaxPhotosCount)
            .ToList() ?? [];

        if (normalizedImageUrls.Count == 0 && !string.IsNullOrWhiteSpace(request.ImageUrl))
            normalizedImageUrls.Add(request.ImageUrl.Trim());

        item.ImageUrl = normalizedImageUrls.FirstOrDefault();
        item.ImageUrlsJson = normalizedImageUrls.Count > 0 ? JsonSerializer.Serialize(normalizedImageUrls) : null;
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

        var favoriteItemIds = await GetFavoriteItemIdsAsync(items.Select(i => i.Id));

        return Ok(items.Select(i => MapToDto(i, isFavorite: favoriteItemIds.Contains(i.Id))));
    }

    [HttpGet("categories")]
    public async Task<ActionResult<IEnumerable<object>>> GetCategories() =>
        Ok(await db.Categories.Select(c => new { c.Id, c.Name, c.IconUrl }).ToListAsync());

    [Authorize]
    [HttpGet("favorites")]
    public async Task<ActionResult<IEnumerable<TechItemDto>>> GetFavorites()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var favoriteItemIds = await db.FavoriteItems
            .Where(f => f.UserId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .Select(f => f.ItemId)
            .ToListAsync();

        var items = await db.TechItems
            .Include(i => i.Category)
            .Include(i => i.Owner)
            .Include(i => i.Reviews)
            .Where(i => favoriteItemIds.Contains(i.Id))
            .ToListAsync();

        var itemsById = items.ToDictionary(i => i.Id);
        var orderedItems = favoriteItemIds
            .Where(itemsById.ContainsKey)
            .Select(id => itemsById[id]);

        return Ok(orderedItems.Select(i => MapToDto(i, isFavorite: true)));
    }

    [Authorize]
    [HttpPost("{id:guid}/favorite")]
    public async Task<IActionResult> AddFavorite(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var itemExists = await db.TechItems.AnyAsync(i => i.Id == id);
        if (!itemExists)
            return NotFound();

        var alreadyFavorited = await db.FavoriteItems.AnyAsync(f => f.UserId == userId && f.ItemId == id);
        if (!alreadyFavorited)
        {
            db.FavoriteItems.Add(new FavoriteItem { UserId = userId, ItemId = id });
            await db.SaveChangesAsync();
        }

        return NoContent();
    }

    [Authorize]
    [HttpDelete("{id:guid}/favorite")]
    public async Task<IActionResult> RemoveFavorite(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var favorite = await db.FavoriteItems.FirstOrDefaultAsync(f => f.UserId == userId && f.ItemId == id);
        if (favorite is not null)
        {
            db.FavoriteItems.Remove(favorite);
            await db.SaveChangesAsync();
        }

        return NoContent();
    }

    private async Task<HashSet<Guid>> GetFavoriteItemIdsAsync(IEnumerable<Guid> itemIds)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userIdClaim is null)
            return [];

        var userId = Guid.Parse(userIdClaim);
        var idsToCheck = itemIds.Distinct().ToList();
        if (idsToCheck.Count == 0)
            return [];

        var favoriteIds = await db.FavoriteItems
            .Where(f => f.UserId == userId && idsToCheck.Contains(f.ItemId))
            .Select(f => f.ItemId)
            .ToListAsync();

        return favoriteIds.ToHashSet();
    }

    private static TechItemDto MapToDto(TechItem i, bool? isAvailableOverride = null, bool isFavorite = false)
    {
        var imageUrls = ParseImageUrls(i.ImageUrlsJson, i.ImageUrl);

        return new TechItemDto(
        i.Id, i.Title, i.Description, i.District, i.Localidade, i.DailyRate, i.Caucao, i.ImageUrl, imageUrls, isAvailableOverride ?? i.IsAvailable,
        i.Category.Name,
        new UserDto(i.Owner.Id, i.Owner.Name, i.Owner.Email, i.Owner.AvatarUrl, i.Owner.Phone),
        i.Reviews.Count > 0 ? i.Reviews.Average(r => r.Rating) : null,
        i.CreatedAt,
        isFavorite);
    }

    private static IReadOnlyList<string> ParseImageUrls(string? imageUrlsJson, string? imageUrl)
    {
        var result = new List<string>();

        if (!string.IsNullOrWhiteSpace(imageUrlsJson))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<List<string>>(imageUrlsJson);
                if (parsed is not null)
                {
                    result.AddRange(parsed.Where(url => !string.IsNullOrWhiteSpace(url)).Select(url => url.Trim()));
                }
            }
            catch
            {
                // Keep compatibility with older or malformed payloads by falling back to ImageUrl.
            }
        }

        if (result.Count == 0 && !string.IsNullOrWhiteSpace(imageUrl))
            result.Add(imageUrl.Trim());

        return result
            .Distinct(StringComparer.Ordinal)
            .Take(MaxPhotosCount)
            .ToList();
    }

    private static string? TryGetCanonicalDistrict(string district)
    {
        var key = NormalizeDistrictKey(district);
        return PortugueseDistrictsByKey.TryGetValue(key, out var canonical) ? canonical : null;
    }

    private static string ToLegacyDistrict(string district) =>
        RemoveDiacritics(district).Normalize(NormalizationForm.FormC);

    private static string NormalizeDistrictKey(string district) =>
        RemoveDiacritics(district.Trim()).ToLowerInvariant();

    private static string? NormalizeOptionalText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        return value.Trim();
    }

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
