using Alugatek.API.Controllers;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.Tests.Integration;

public class UsersControllerTests : IDisposable
{
    private readonly AppDbContext _db = TestDb.CreateContext();

    public void Dispose() => _db.Dispose();

    private UsersController CreateController() => new UsersController(_db).Anonymous();

    private User SeedRevieweeWithReviews(params int[] ratings)
    {
        var owner = _db.AddUser(name: "Owner");
        var reviewee = _db.AddUser(name: "Reviewee");
        var item = _db.AddItem(owner, title: "Canon EOS R5");
        var rental = _db.AddRental(item, reviewee, RentalStatus.Returned);

        for (var i = 0; i < ratings.Length; i++)
        {
            var reviewer = _db.AddUser(name: $"Reviewer {i}");
            _db.RentalReviews.Add(new RentalReview
            {
                RentalId = rental.Id,
                ReviewerId = reviewer.Id,
                RevieweeId = reviewee.Id,
                Rating = ratings[i],
                Comment = $"Comment {i}",
                CreatedAt = DateTime.UtcNow.AddMinutes(i)
            });
        }

        _db.SaveChanges();
        return reviewee;
    }

    [Fact]
    public async Task GetRentalRating_AveragesTheReceivedRatings()
    {
        var reviewee = SeedRevieweeWithReviews(5, 4, 3);

        var result = await CreateController().GetRentalRating(reviewee.Id);

        var dto = Assert.IsType<UserRentalRatingSummaryDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(3, dto.ReviewCount);
        Assert.Equal(4d, dto.AverageRating);
    }

    [Fact]
    public async Task GetRentalRating_ReturnsNullAverageWhenThereAreNoReviews()
    {
        var user = _db.AddUser();

        var result = await CreateController().GetRentalRating(user.Id);

        var dto = Assert.IsType<UserRentalRatingSummaryDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(0, dto.ReviewCount);
        Assert.Null(dto.AverageRating);
    }

    [Fact]
    public async Task GetRentalRating_ReturnsNotFoundForAnUnknownUser()
    {
        var result = await CreateController().GetRentalRating(Guid.NewGuid());

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetRentalReviews_ReturnsTheMostRecentReviewsFirstByDefault()
    {
        var reviewee = SeedRevieweeWithReviews(1, 2, 3);

        var reviews = await ReviewsAsync(reviewee.Id);

        Assert.Equal(new[] { "Comment 2", "Comment 1", "Comment 0" }, reviews.Select(r => r.Comment));
        Assert.All(reviews, r => Assert.Equal("Canon EOS R5", r.ItemTitle));
    }

    [Fact]
    public async Task GetRentalReviews_SortsByHighestRating()
    {
        var reviewee = SeedRevieweeWithReviews(1, 5, 3);

        var reviews = await ReviewsAsync(reviewee.Id, sort: "HIGHEST");

        Assert.Equal(new[] { 5, 3, 1 }, reviews.Select(r => r.Rating));
    }

    [Fact]
    public async Task GetRentalReviews_SortsByLowestRating()
    {
        var reviewee = SeedRevieweeWithReviews(1, 5, 3);

        var reviews = await ReviewsAsync(reviewee.Id, sort: "lowest");

        Assert.Equal(new[] { 1, 3, 5 }, reviews.Select(r => r.Rating));
    }

    [Fact]
    public async Task GetRentalReviews_AppliesLimitAndSkip()
    {
        var reviewee = SeedRevieweeWithReviews(1, 2, 3, 4);

        var reviews = await ReviewsAsync(reviewee.Id, limit: 2, skip: 1);

        Assert.Equal(new[] { "Comment 2", "Comment 1" }, reviews.Select(r => r.Comment));
    }

    [Fact]
    public async Task GetRentalReviews_CapsTheLimitAtOneHundred()
    {
        var reviewee = SeedRevieweeWithReviews(Enumerable.Repeat(5, 101).ToArray());

        var reviews = await ReviewsAsync(reviewee.Id, limit: 500);

        Assert.Equal(100, reviews.Count);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(-1, 0)]
    [InlineData(10, -1)]
    public async Task GetRentalReviews_RejectsInvalidPaging(int limit, int skip)
    {
        var reviewee = SeedRevieweeWithReviews(5);

        var result = await CreateController().GetRentalReviews(reviewee.Id, limit, skip);

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetRentalReviews_ReturnsNotFoundForAnUnknownUser()
    {
        var result = await CreateController().GetRentalReviews(Guid.NewGuid());

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    private async Task<IReadOnlyList<UserRentalReviewCommentDto>> ReviewsAsync(
        Guid userId,
        int? limit = null,
        int? skip = null,
        string? sort = null)
    {
        var result = await CreateController().GetRentalReviews(userId, limit, skip, sort);
        return Assert.IsAssignableFrom<IReadOnlyList<UserRentalReviewCommentDto>>(
            Assert.IsType<OkObjectResult>(result.Result).Value);
    }
}
