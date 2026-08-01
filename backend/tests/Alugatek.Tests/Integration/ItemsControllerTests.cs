using Alugatek.API.Controllers;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.Tests.Integration;

public class ItemsControllerTests : IDisposable
{
    private readonly AppDbContext _db = TestDb.CreateContext();
    private readonly FakeItemImageStorage _storage = new();

    public void Dispose() => _db.Dispose();

    private ItemsController CreateController(User? user = null)
    {
        var controller = new ItemsController(_db, _storage);
        return user is null ? controller.Anonymous() : controller.AuthenticateAs(user);
    }

    private static CreateItemRequest NewItemRequest(
        string district = "Lisboa",
        decimal caucao = 100m,
        IReadOnlyList<string>? imageUrls = null,
        string? imageUrl = "/uploads/a.jpg",
        int categoryId = 3) =>
        new("Canon EOS R5", "Full-frame camera", district, "Alvalade", 25m, caucao, imageUrl, imageUrls, categoryId);

    private static IReadOnlyList<TechItemDto> ItemsOf(ActionResult<IEnumerable<TechItemDto>> result) =>
        Assert.IsAssignableFrom<IEnumerable<TechItemDto>>(Assert.IsType<OkObjectResult>(result.Result).Value).ToList();

    [Fact]
    public async Task GetAll_ReturnsOnlyItemsThatAreNotSoftDeleted()
    {
        var owner = _db.AddUser();
        _db.AddItem(owner, title: "Visible");
        _db.AddItem(owner, title: "Deleted", isDeleted: true);

        var items = ItemsOf(await CreateController().GetAll(null, null, null));

        Assert.Equal("Visible", Assert.Single(items).Title);
    }

    [Fact]
    public async Task GetAll_FiltersByCategory()
    {
        var owner = _db.AddUser();
        _db.AddItem(owner, title: "Camera", categoryId: 3);
        _db.AddItem(owner, title: "Laptop", categoryId: 2);

        var items = ItemsOf(await CreateController().GetAll(2, null, null));

        Assert.Equal("Laptop", Assert.Single(items).Title);
    }

    [Fact]
    public async Task GetAll_PagesResultsNewestFirst()
    {
        var owner = _db.AddUser();
        for (var i = 0; i < 3; i++)
        {
            var item = _db.AddItem(owner, title: $"Item {i}");
            item.CreatedAt = DateTime.UtcNow.AddMinutes(i);
        }
        await _db.SaveChangesAsync();

        var firstPage = ItemsOf(await CreateController().GetAll(null, null, null, page: 1, pageSize: 2));
        var secondPage = ItemsOf(await CreateController().GetAll(null, null, null, page: 2, pageSize: 2));

        Assert.Equal(new[] { "Item 2", "Item 1" }, firstPage.Select(i => i.Title));
        Assert.Equal("Item 0", Assert.Single(secondPage).Title);
    }

    [Fact]
    public async Task GetAll_MarksItemsWithAConfirmedReservationAsUnavailable()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var reserved = _db.AddItem(owner, title: "Reserved");
        _db.AddItem(owner, title: "Free");
        _db.AddRental(reserved, renter, RentalStatus.Active);

        var items = ItemsOf(await CreateController().GetAll(null, null, null));

        Assert.False(items.Single(i => i.Title == "Reserved").IsAvailable);
        Assert.True(items.Single(i => i.Title == "Free").IsAvailable);
    }

    [Fact]
    public async Task GetAll_FlagsFavoritesForTheAuthenticatedUser()
    {
        var owner = _db.AddUser();
        var viewer = _db.AddUser();
        var favorite = _db.AddItem(owner, title: "Favorite");
        _db.AddItem(owner, title: "Plain");
        _db.FavoriteItems.Add(new FavoriteItem { UserId = viewer.Id, ItemId = favorite.Id });
        await _db.SaveChangesAsync();

        var items = ItemsOf(await CreateController(viewer).GetAll(null, null, null));

        Assert.True(items.Single(i => i.Title == "Favorite").IsFavorite);
        Assert.False(items.Single(i => i.Title == "Plain").IsFavorite);
    }

    [Fact]
    public async Task GetById_ReturnsNotFoundForAMissingOrDeletedItem()
    {
        var owner = _db.AddUser();
        var deleted = _db.AddItem(owner, isDeleted: true);

        Assert.IsType<NotFoundResult>((await CreateController().GetById(Guid.NewGuid())).Result);
        Assert.IsType<NotFoundResult>((await CreateController().GetById(deleted.Id)).Result);
    }

    [Fact]
    public async Task GetById_BlocksDeletionWhenAReservationIsConfirmed()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        _db.AddRental(item, renter, RentalStatus.Completed);

        var result = await CreateController(owner).GetById(item.Id);

        var dto = Assert.IsType<TechItemDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.False(dto.CanDelete);
        Assert.False(dto.IsAvailable);
    }

    [Fact]
    public async Task Create_PersistsTheItemForTheAuthenticatedOwner()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).Create(NewItemRequest());

        var created = Assert.IsType<CreatedAtActionResult>(result.Result);
        var dto = Assert.IsType<TechItemDto>(created.Value);
        Assert.Equal("Lisboa", dto.District);
        Assert.Equal(owner.Id, dto.Owner.Id);

        var stored = await _db.TechItems.SingleAsync();
        Assert.Equal(owner.Id, stored.OwnerId);
        Assert.Equal("Alvalade", stored.Localidade);
    }

    [Theory]
    [InlineData("lisboa", "Lisboa")]
    [InlineData("  BRAGA ", "Braga")]
    [InlineData("evora", "Évora")]
    [InlineData("Évora", "Évora")]
    public async Task Create_NormalizesTheDistrictToItsCanonicalName(string input, string expected)
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).Create(NewItemRequest(district: input));

        var dto = Assert.IsType<TechItemDto>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
        Assert.Equal(expected, dto.District);
    }

    [Fact]
    public async Task Create_RejectsAnUnknownDistrict()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).Create(NewItemRequest(district: "Barcelona"));

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("District must be a valid Portuguese district.", badRequest.GetMessage());
    }

    [Fact]
    public async Task Create_RejectsANonPositiveCaucao()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).Create(NewItemRequest(caucao: 0m));

        Assert.Equal(
            "Caucao is required and must be greater than 0.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsAnUnknownCategory()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).Create(NewItemRequest(categoryId: 9999));

        Assert.Equal("Invalid category.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RequiresAtLeastOneImage()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).Create(NewItemRequest(imageUrl: null, imageUrls: []));

        Assert.Equal(
            "Image is required. Use /api/items/upload with a photo file.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsMoreThanFiveImages()
    {
        var owner = _db.AddUser();
        var images = Enumerable.Range(1, 6).Select(i => $"/uploads/{i}.jpg").ToList();

        var result = await CreateController(owner).Create(NewItemRequest(imageUrls: images));

        Assert.Equal(
            "You can upload up to 5 photos.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_DeduplicatesImageUrls()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner)
            .Create(NewItemRequest(imageUrls: ["/uploads/a.jpg", "/uploads/a.jpg", "/uploads/b.jpg"]));

        var dto = Assert.IsType<TechItemDto>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
        Assert.Equal(new[] { "/uploads/a.jpg", "/uploads/b.jpg" }, dto.ImageUrls);
    }

    [Fact]
    public async Task Update_ByTheOwner_ChangesTheItem()
    {
        var owner = _db.AddUser();
        var item = _db.AddItem(owner);

        var result = await CreateController(owner).Update(item.Id, new UpdateItemRequest(
            "Sony A7", "Updated", "porto", null, 30m, 150m, "/uploads/new.jpg", null, false));

        var dto = Assert.IsType<TechItemDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal("Sony A7", dto.Title);
        Assert.Equal("Porto", dto.District);
        Assert.False(dto.IsAvailable);
        Assert.Null((await _db.TechItems.SingleAsync()).Localidade);
    }

    [Fact]
    public async Task Update_ByANonOwner_IsForbidden()
    {
        var owner = _db.AddUser();
        var stranger = _db.AddUser();
        var item = _db.AddItem(owner);

        var result = await CreateController(stranger).Update(item.Id, new UpdateItemRequest(
            "Hijacked", "Nope", "Lisboa", null, 1m, 1m, "/uploads/a.jpg", null, true));

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task Update_ClampsANegativeCaucaoToZero()
    {
        var owner = _db.AddUser();
        var item = _db.AddItem(owner);

        await CreateController(owner).Update(item.Id, new UpdateItemRequest(
            "Canon", "Desc", "Lisboa", null, 10m, -50m, "/uploads/a.jpg", null, true));

        Assert.Equal(0m, (await _db.TechItems.SingleAsync()).Caucao);
    }

    [Fact]
    public async Task Delete_SoftDeletesTheItem()
    {
        var owner = _db.AddUser();
        var item = _db.AddItem(owner);

        var result = await CreateController(owner).Delete(item.Id);

        Assert.IsType<NoContentResult>(result);
        var stored = await _db.TechItems.SingleAsync();
        Assert.True(stored.IsDeleted);
        Assert.False(stored.IsAvailable);
    }

    [Fact]
    public async Task Delete_IsBlockedWhileARentalIsOngoing()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var item = _db.AddItem(owner);
        _db.AddRental(item, renter, RentalStatus.Completed);

        var result = await CreateController(owner).Delete(item.Id);

        Assert.Equal(
            "You cannot delete an item while a rental is ongoing.",
            Assert.IsType<BadRequestObjectResult>(result).GetMessage());
        Assert.False((await _db.TechItems.SingleAsync()).IsDeleted);
    }

    [Fact]
    public async Task Delete_ByANonOwner_IsForbidden()
    {
        var owner = _db.AddUser();
        var stranger = _db.AddUser();
        var item = _db.AddItem(owner);

        Assert.IsType<ForbidResult>(await CreateController(stranger).Delete(item.Id));
    }

    [Fact]
    public async Task GetMyItems_ReturnsOnlyTheCallersItems()
    {
        var owner = _db.AddUser();
        var other = _db.AddUser();
        _db.AddItem(owner, title: "Mine");
        _db.AddItem(other, title: "Theirs");

        var items = ItemsOf(await CreateController(owner).GetMyItems());

        Assert.Equal("Mine", Assert.Single(items).Title);
    }

    [Fact]
    public async Task GetCategories_ReturnsTheSeededCategories()
    {
        var result = await CreateController().GetCategories();

        var categories = Assert.IsAssignableFrom<IEnumerable<object>>(
            Assert.IsType<OkObjectResult>(result.Result).Value);

        Assert.Equal(11, categories.Count());
    }

    [Fact]
    public async Task AddFavorite_IsIdempotent()
    {
        var owner = _db.AddUser();
        var viewer = _db.AddUser();
        var item = _db.AddItem(owner);
        var controller = CreateController(viewer);

        Assert.IsType<NoContentResult>(await controller.AddFavorite(item.Id));
        Assert.IsType<NoContentResult>(await controller.AddFavorite(item.Id));

        Assert.Single(await _db.FavoriteItems.ToListAsync());
    }

    [Fact]
    public async Task AddFavorite_ReturnsNotFoundForAnUnknownItem()
    {
        var viewer = _db.AddUser();

        Assert.IsType<NotFoundResult>(await CreateController(viewer).AddFavorite(Guid.NewGuid()));
    }

    [Fact]
    public async Task RemoveFavorite_RemovesTheEntryAndToleratesMissingOnes()
    {
        var owner = _db.AddUser();
        var viewer = _db.AddUser();
        var item = _db.AddItem(owner);
        var controller = CreateController(viewer);
        await controller.AddFavorite(item.Id);

        Assert.IsType<NoContentResult>(await controller.RemoveFavorite(item.Id));
        Assert.IsType<NoContentResult>(await controller.RemoveFavorite(item.Id));

        Assert.Empty(await _db.FavoriteItems.ToListAsync());
    }

    [Fact]
    public async Task GetFavorites_ReturnsFavoritesNewestFirst()
    {
        var owner = _db.AddUser();
        var viewer = _db.AddUser();
        var first = _db.AddItem(owner, title: "First");
        var second = _db.AddItem(owner, title: "Second");

        _db.FavoriteItems.AddRange(
            new FavoriteItem { UserId = viewer.Id, ItemId = first.Id, CreatedAt = DateTime.UtcNow.AddMinutes(-5) },
            new FavoriteItem { UserId = viewer.Id, ItemId = second.Id, CreatedAt = DateTime.UtcNow });
        await _db.SaveChangesAsync();

        var items = ItemsOf(await CreateController(viewer).GetFavorites());

        Assert.Equal(new[] { "Second", "First" }, items.Select(i => i.Title));
        Assert.All(items, i => Assert.True(i.IsFavorite));
    }

    [Fact]
    public async Task UploadImage_RejectsUnsupportedContentTypes()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).UploadImage(FakeFile("evil.gif", "image/gif"), default);

        Assert.Equal(
            "Unsupported photo format. Use JPEG, PNG, or WEBP.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task UploadImage_RejectsEmptyFiles()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).UploadImage(FakeFile("empty.jpg", "image/jpeg", length: 0), default);

        Assert.Equal("Photo is required.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task UploadImage_RejectsFilesLargerThanFiveMegabytes()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner)
            .UploadImage(FakeFile("big.jpg", "image/jpeg", length: (5 * 1024 * 1024) + 1), default);

        Assert.Equal("Photo must be at most 5 MB.", Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task UploadImage_StoresTheFileAndReturnsItsUrl()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).UploadImage(FakeFile("photo.jpg", "image/jpeg"), default);

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal("photo.jpg", Assert.Single(_storage.SavedFileNames));
    }

    [Fact]
    public async Task UploadImages_RejectsMoreThanFivePhotos()
    {
        var owner = _db.AddUser();
        var photos = Enumerable.Range(1, 6).Select(i => FakeFile($"p{i}.jpg", "image/jpeg")).ToList();

        var result = await CreateController(owner).UploadImages(photos, default);

        Assert.Equal(
            "You can upload up to 5 photos.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
        Assert.Empty(_storage.SavedFileNames);
    }

    [Fact]
    public async Task UploadImages_RequiresAtLeastOnePhoto()
    {
        var owner = _db.AddUser();

        var result = await CreateController(owner).UploadImages([], default);

        Assert.Equal(
            "At least one photo is required.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    private static IFormFile FakeFile(string fileName, string contentType, long length = 1024)
    {
        var content = new byte[Math.Min(length, 16)];
        return new FormFile(new MemoryStream(content), 0, length, "photos", fileName)
        {
            Headers = new HeaderDictionary(),
            ContentType = contentType
        };
    }
}
