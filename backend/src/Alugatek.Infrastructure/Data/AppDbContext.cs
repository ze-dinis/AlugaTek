using Alugatek.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.Infrastructure.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<TechItem> TechItems => Set<TechItem>();
    public DbSet<Rental> Rentals => Set<Rental>();
    public DbSet<Review> Reviews => Set<Review>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.Property(u => u.Email).HasColumnType("citext");
            e.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<TechItem>(e =>
        {
            e.Property(i => i.DailyRate).HasColumnType("decimal(18,2)");
            e.HasOne(i => i.Owner)
             .WithMany(u => u.ListedItems)
             .HasForeignKey(i => i.OwnerId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Rental>(e =>
        {
            e.Property(r => r.TotalPrice).HasColumnType("decimal(18,2)");
            e.HasOne(r => r.Renter)
             .WithMany(u => u.Rentals)
             .HasForeignKey(r => r.RenterId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Review>(e =>
        {
            e.HasOne(r => r.Author)
             .WithMany(u => u.Reviews)
             .HasForeignKey(r => r.AuthorId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        // Seed categories
        modelBuilder.Entity<Category>().HasData(
            new Category { Id = 1, Name = "Smartphones" },
            new Category { Id = 2, Name = "Laptops" },
            new Category { Id = 3, Name = "Cameras" },
            new Category { Id = 4, Name = "Audio" },
            new Category { Id = 5, Name = "Tablets" },
            new Category { Id = 6, Name = "Gaming" }
        );
    }
}
