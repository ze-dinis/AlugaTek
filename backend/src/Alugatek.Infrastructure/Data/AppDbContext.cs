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
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<DevicePushToken> DevicePushTokens => Set<DevicePushToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.Property(u => u.Email).HasColumnType("text");
            e.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<TechItem>(e =>
        {
            e.Property(i => i.District)
             .HasColumnType("text")
             .HasMaxLength(100)
             .IsRequired();
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

        modelBuilder.Entity<Message>(e =>
        {
            e.HasOne(m => m.Sender)
             .WithMany(u => u.SentMessages)
             .HasForeignKey(m => m.SenderId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(m => m.Receiver)
             .WithMany(u => u.ReceivedMessages)
             .HasForeignKey(m => m.ReceiverId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<DevicePushToken>(e =>
        {
            e.Property(t => t.Token)
             .HasColumnType("text")
             .IsRequired();

            e.Property(t => t.Platform)
             .HasColumnType("text")
             .HasMaxLength(20)
             .IsRequired();

            e.HasIndex(t => t.Token).IsUnique();

            e.HasOne(t => t.User)
             .WithMany(u => u.DevicePushTokens)
             .HasForeignKey(t => t.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // Seed categories
        modelBuilder.Entity<Category>().HasData(
            new Category { Id = 1, Name = "Smartphones" },
            new Category { Id = 2, Name = "Laptops" },
            new Category { Id = 3, Name = "Câmeras" },
            new Category { Id = 4, Name = "Áudio" },
            new Category { Id = 5, Name = "Tablets" },
            new Category { Id = 6, Name = "Gaming" }
        );
    }
}
