using Alugatek.API.Controllers;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Tests.TestSupport;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.Tests.Integration;

public class ReportsControllerTests : IDisposable
{
    private readonly AppDbContext _db = TestDb.CreateContext();

    public void Dispose() => _db.Dispose();

    private ReportsController CreateController(User user) => new ReportsController(_db).AuthenticateAs(user);

    [Fact]
    public async Task Create_StoresTheReport()
    {
        var owner = _db.AddUser();
        var reporter = _db.AddUser();
        var item = _db.AddItem(owner);

        var result = await CreateController(reporter)
            .Create(new CreateReportRequest(owner.Id, item.Id, "  Fraudulent listing  "));

        Assert.IsType<OkObjectResult>(result);
        var report = await _db.UserReports.SingleAsync();
        Assert.Equal(reporter.Id, report.ReporterId);
        Assert.Equal(owner.Id, report.ReportedUserId);
        Assert.Equal("Fraudulent listing", report.Reason);
    }

    [Fact]
    public async Task Create_RequiresAReason()
    {
        var owner = _db.AddUser();
        var reporter = _db.AddUser();
        var item = _db.AddItem(owner);

        var result = await CreateController(reporter).Create(new CreateReportRequest(owner.Id, item.Id, "   "));

        Assert.Equal("Reason is required.", Assert.IsType<BadRequestObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsSelfReports()
    {
        var owner = _db.AddUser();
        var item = _db.AddItem(owner);

        var result = await CreateController(owner).Create(new CreateReportRequest(owner.Id, item.Id, "Because"));

        Assert.Equal("You cannot report yourself.", Assert.IsType<BadRequestObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task Create_ReturnsNotFoundForAnUnknownItem()
    {
        var owner = _db.AddUser();
        var reporter = _db.AddUser();

        var result = await CreateController(reporter).Create(new CreateReportRequest(owner.Id, Guid.NewGuid(), "Because"));

        Assert.Equal("Item not found.", Assert.IsType<NotFoundObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task Create_ReturnsNotFoundForAnUnknownReportedUser()
    {
        var owner = _db.AddUser();
        var reporter = _db.AddUser();
        var item = _db.AddItem(owner);

        var result = await CreateController(reporter).Create(new CreateReportRequest(Guid.NewGuid(), item.Id, "Because"));

        Assert.Equal("Reported user not found.", Assert.IsType<NotFoundObjectResult>(result).GetMessage());
    }

    [Fact]
    public async Task Create_RejectsADuplicateReportForTheSameListing()
    {
        var owner = _db.AddUser();
        var reporter = _db.AddUser();
        var item = _db.AddItem(owner);
        var controller = CreateController(reporter);

        await controller.Create(new CreateReportRequest(owner.Id, item.Id, "Because"));
        var result = await controller.Create(new CreateReportRequest(owner.Id, item.Id, "Because again"));

        Assert.IsType<ConflictObjectResult>(result);
        Assert.Single(await _db.UserReports.ToListAsync());
    }

    [Fact]
    public async Task SupportReports_GetAll_ListsReportsNewestFirstWithContext()
    {
        var owner = _db.AddUser(name: "Owner");
        var reporter = _db.AddUser(name: "Reporter");
        var support = _db.AddUser(name: "Support", role: User.RoleSupport);
        var item = _db.AddItem(owner, title: "Canon EOS R5");

        _db.UserReports.AddRange(
            new UserReport
            {
                ReporterId = reporter.Id,
                ReportedUserId = owner.Id,
                ItemId = item.Id,
                Reason = "Older",
                CreatedAt = DateTime.UtcNow.AddHours(-1)
            },
            new UserReport
            {
                ReporterId = reporter.Id,
                ReportedUserId = owner.Id,
                ItemId = item.Id,
                Reason = "Newer",
                CreatedAt = DateTime.UtcNow
            });
        await _db.SaveChangesAsync();

        var result = await new SupportReportsController(_db).AuthenticateAs(support).GetAll();

        var reports = Assert.IsAssignableFrom<System.Collections.IEnumerable>(
            Assert.IsType<OkObjectResult>(result).Value).Cast<object>().ToList();

        Assert.Equal(2, reports.Count);
        Assert.Equal("Newer", ReadProperty(reports[0], "Reason"));
        Assert.Equal("Canon EOS R5", ReadProperty(reports[0], "ItemTitle"));
        Assert.Equal("Reporter", ReadProperty(reports[0], "ReporterName"));
    }

    private static object? ReadProperty(object source, string name) =>
        source.GetType().GetProperty(name)?.GetValue(source);
}
