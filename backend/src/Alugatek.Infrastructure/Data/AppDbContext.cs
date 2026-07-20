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
    public DbSet<UserReport> UserReports => Set<UserReport>();
    public DbSet<FavoriteItem> FavoriteItems => Set<FavoriteItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(e =>
        {
            e.Property(u => u.Email).HasColumnType("text");
            e.Property(u => u.EmailVerificationTokenHash).HasColumnType("text");
            e.Property(u => u.EmailVerificationTokenExpiresAt).HasColumnType("timestamp with time zone");
            e.Property(u => u.EmailVerifiedAt).HasColumnType("timestamp with time zone");
            e.Property(u => u.Role).HasColumnType("text").HasDefaultValue(User.RoleUser);
            e.Property(u => u.BanReason).HasColumnType("text");
            e.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<TechItem>(e =>
        {
            e.Property(i => i.District)
             .HasColumnType("text")
             .HasMaxLength(100)
             .IsRequired();
            e.Property(i => i.DailyRate).HasColumnType("decimal(18,2)");
            e.Property(i => i.ImageUrlsJson).HasColumnType("text");
            e.HasOne(i => i.Owner)
             .WithMany(u => u.ListedItems)
             .HasForeignKey(i => i.OwnerId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Rental>(e =>
        {
            e.Property(r => r.TotalPrice).HasColumnType("decimal(18,2)");
            e.Property(r => r.PaymentStatus).HasConversion<string>().HasColumnType("text");
            e.Property(r => r.PaymentIntentId).HasColumnType("text");
            e.Property(r => r.ExtendedAuthorizationStatus).HasColumnType("text");
                        e.Property(r => r.SellerPaymentDestination).HasColumnType("text");
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
            e.Property(m => m.Content).HasColumnType("text");
            e.Property(m => m.ImageUrlsJson).HasColumnType("text");
            e.HasIndex(m => m.ItemId);

            e.HasOne(m => m.Sender)
             .WithMany(u => u.SentMessages)
             .HasForeignKey(m => m.SenderId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(m => m.Receiver)
             .WithMany(u => u.ReceivedMessages)
             .HasForeignKey(m => m.ReceiverId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<UserReport>(e =>
        {
            e.Property(r => r.Reason).HasColumnType("text").IsRequired();

            e.HasOne(r => r.Reporter)
             .WithMany()
             .HasForeignKey(r => r.ReporterId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(r => r.ReportedUser)
             .WithMany()
             .HasForeignKey(r => r.ReportedUserId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(r => r.Item)
             .WithMany()
             .HasForeignKey(r => r.ItemId)
             .OnDelete(DeleteBehavior.Cascade);
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

        modelBuilder.Entity<FavoriteItem>(e =>
        {
            e.HasIndex(f => new { f.UserId, f.ItemId }).IsUnique();

            e.HasOne(f => f.User)
             .WithMany()
             .HasForeignKey(f => f.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(f => f.Item)
             .WithMany()
             .HasForeignKey(f => f.ItemId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // Seed categories
        modelBuilder.Entity<Category>().HasData(
            new Category { Id = 1, Name = "Smartphones" },
            new Category { Id = 2, Name = "Portáteis" },
            new Category { Id = 3, Name = "Câmaras" },
            new Category { Id = 4, Name = "Equipamentos de áudio" },
            new Category { Id = 5, Name = "Tablets" },
            new Category { Id = 6, Name = "Gaming" },
            new Category { Id = 7, Name = "Drones" },
            new Category { Id = 8, Name = "Wearables" },
            new Category { Id = 9, Name = "Projetores" },
            new Category { Id = 10, Name = "Monitores" },
            new Category { Id = 11, Name = "Impressoras" }
        );
    }
}
