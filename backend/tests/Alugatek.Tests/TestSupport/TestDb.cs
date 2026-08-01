using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Alugatek.Tests.TestSupport;

/// <summary>
/// Builds isolated in-memory <see cref="AppDbContext"/> instances so each test gets a clean database.
/// </summary>
public static class TestDb
{
    public static AppDbContext CreateContext(string? databaseName = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName ?? Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .EnableSensitiveDataLogging()
            .Options;

        var context = new AppDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    public static User AddUser(
        this AppDbContext db,
        string name = "Test User",
        string? email = null,
        string? password = "Password123!",
        bool emailVerified = true,
        string role = User.RoleUser)
    {
        var user = new User
        {
            Name = name,
            Email = email ?? $"{Guid.NewGuid():N}@example.com",
            EmailVerified = emailVerified,
            EmailVerifiedAt = emailVerified ? DateTime.UtcNow : null,
            PasswordHash = password is null ? null : BCrypt.Net.BCrypt.HashPassword(password),
            Role = role
        };

        db.Users.Add(user);
        db.SaveChanges();
        return user;
    }

    public static TechItem AddItem(
        this AppDbContext db,
        User owner,
        string title = "Canon EOS R5",
        decimal dailyRate = 20m,
        decimal caucao = 100m,
        bool isAvailable = true,
        bool isDeleted = false,
        int categoryId = 3,
        string district = "Lisboa")
    {
        var item = new TechItem
        {
            Title = title,
            Description = $"{title} description",
            District = district,
            DailyRate = dailyRate,
            Caucao = caucao,
            IsAvailable = isAvailable,
            IsDeleted = isDeleted,
            CategoryId = categoryId,
            OwnerId = owner.Id,
            ImageUrl = "/uploads/item.jpg"
        };

        db.TechItems.Add(item);
        db.SaveChanges();
        return item;
    }

    public static Rental AddRental(
        this AppDbContext db,
        TechItem item,
        User renter,
        RentalStatus status = RentalStatus.Pending,
        decimal totalPrice = 40m,
        DateTime? startDate = null,
        DateTime? endDate = null)
    {
        var rental = new Rental
        {
            ItemId = item.Id,
            RenterId = renter.Id,
            StartDate = startDate ?? DateTime.UtcNow.Date,
            EndDate = endDate ?? DateTime.UtcNow.Date.AddDays(2),
            TotalPrice = totalPrice,
            CaucaoAmount = item.Caucao,
            Status = status
        };

        db.Rentals.Add(rental);
        db.SaveChanges();
        return rental;
    }
}
