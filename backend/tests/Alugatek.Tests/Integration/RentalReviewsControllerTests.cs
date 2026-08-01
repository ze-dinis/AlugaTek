using Alugatek.API.Controllers;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.Tests.Integration;

public class RentalReviewsControllerTests : IDisposable
{
    private readonly AppDbContext _db = TestDb.CreateContext();

    public void Dispose() => _db.Dispose();

    private RentalReviewsController CreateController(User user) =>
        new RentalReviewsController(_db).AuthenticateAs(user);

    [Fact]
    public async Task Create_LetsTheRenterReviewTheOwner()
    {
        var owner = _db.AddUser(name: "Owner");
        var renter = _db.AddUser(name: "Renter");
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);

        var result = await CreateController(renter)
            .Create(new CreateRentalUserReviewRequest(rental.Id, 5, "  Great experience  "));

        var dto = Assert.IsType<RentalUserReviewDto>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
        Assert.Equal(renter.Id, dto.Reviewer.Id);
        Assert.Equal(owner.Id, dto.Reviewee.Id);
        Assert.Equal("Great experience", dto.Comment);
        Assert.Equal(owner.Id, (await _db.RentalReviews.SingleAsync()).RevieweeId);
    }

    [Fact]
    public async Task Create_LetsTheOwnerReviewTheRenter()
    {
        var owner = _db.AddUser(name: "Owner");
        var renter = _db.AddUser(name: "Renter");
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Returned);

        var result = await CreateController(owner).Create(new CreateRentalUserReviewRequest(rental.Id, 4, "Fine"));

        var dto = Assert.IsType<RentalUserReviewDto>(Assert.IsType<CreatedAtActionResult>(result.Result).Value);
        Assert.Equal(owner.Id, dto.Reviewer.Id);
        Assert.Equal(renter.Id, dto.Reviewee.Id);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(6)]
    [InlineData(-1)]
    public async Task Create_RejectsAnOutOfRangeRating(int rating)
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);

        var result = await CreateController(renter).Create(new CreateRentalUserReviewRequest(rental.Id, rating, "Text"));

        Assert.Equal(
            "Rating must be between 1 and 5.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_ReturnsNotFoundForAnUnknownRental()
    {
        var result = await CreateController(_db.AddUser())
            .Create(new CreateRentalUserReviewRequest(Guid.NewGuid(), 5, "Text"));

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task Create_ByAnUninvolvedUser_IsForbidden()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var stranger = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);

        var result = await CreateController(stranger).Create(new CreateRentalUserReviewRequest(rental.Id, 5, "Text"));

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Theory]
    [InlineData(RentalStatus.Pending)]
    [InlineData(RentalStatus.Active)]
    [InlineData(RentalStatus.Cancelled)]
    public async Task Create_IsBlockedBeforePaymentCompletes(RentalStatus status)
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, status);

        var result = await CreateController(renter).Create(new CreateRentalUserReviewRequest(rental.Id, 5, "Text"));

        Assert.Equal(
            "Reviews are only available after payment is completed.",
            Assert.IsType<BadRequestObjectResult>(result.Result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsASecondReviewFromTheSameUser()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);
        var controller = CreateController(renter);

        await controller.Create(new CreateRentalUserReviewRequest(rental.Id, 5, "First"));
        var result = await controller.Create(new CreateRentalUserReviewRequest(rental.Id, 1, "Second"));

        Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Single(await _db.RentalReviews.ToListAsync());
    }

    [Fact]
    public async Task GetEligibility_AllowsAFirstReviewOnACompletedRental()
    {
        var owner = _db.AddUser(name: "Owner");
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);

        var result = await CreateController(renter).GetEligibility(rental.Id);

        var dto = Assert.IsType<RentalReviewEligibilityDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.True(dto.CanReview);
        Assert.False(dto.HasReviewed);
        Assert.Equal(owner.Id, dto.Reviewee!.Id);
        Assert.Null(dto.Reason);
    }

    [Fact]
    public async Task GetEligibility_ReportsAnAlreadySubmittedReview()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);
        var controller = CreateController(renter);
        await controller.Create(new CreateRentalUserReviewRequest(rental.Id, 5, "Nice"));

        var result = await controller.GetEligibility(rental.Id);

        var dto = Assert.IsType<RentalReviewEligibilityDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.False(dto.CanReview);
        Assert.True(dto.HasReviewed);
    }

    [Fact]
    public async Task GetEligibility_ExplainsWhyAPendingRentalCannotBeReviewed()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Pending);

        var result = await CreateController(renter).GetEligibility(rental.Id);

        var dto = Assert.IsType<RentalReviewEligibilityDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.False(dto.CanReview);
        Assert.Equal("Review is available once payment is completed.", dto.Reason);
    }

    [Fact]
    public async Task GetEligibility_ByAnUninvolvedUser_IsForbidden()
    {
        var owner = _db.AddUser();
        var renter = _db.AddUser();
        var stranger = _db.AddUser();
        var rental = _db.AddRental(_db.AddItem(owner), renter, RentalStatus.Completed);

        Assert.IsType<ForbidResult>((await CreateController(stranger).GetEligibility(rental.Id)).Result);
    }
}
