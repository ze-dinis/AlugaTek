using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Stripe;

namespace Alugatek.API.Services;

public sealed class ExpiringHoldCaptureService(
    IServiceScopeFactory scopeFactory,
    ILogger<ExpiringHoldCaptureService> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan CaptureLeadTime = TimeSpan.FromMinutes(120);
    private const string RentalExpiringReminderMessageType = "RentalExpiringReminder24h";
    private const string RentalPaymentExpiredMessageType = "RentalPaymentExpired";

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CancelExpiredPaymentDeadlinesAsync(stoppingToken);
                await CaptureExpiringHoldsAsync(stoppingToken);
                await SendExpiringRentalRemindersAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Unexpected error while checking expiring caução holds.");
            }

            try
            {
                await timer.WaitForNextTickAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task CancelExpiredPaymentDeadlinesAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var now = DateTime.UtcNow;
        var expiredRentals = await db.Rentals
            .Include(r => r.Item)
            .Where(r => r.Status == RentalStatus.Active)
            .Where(r => r.PaymentStatus == PaymentStatus.None)
            .Where(r => r.PaymentDeadline != null && r.PaymentDeadline <= now)
            .ToListAsync(cancellationToken);

        if (expiredRentals.Count == 0)
            return;

        foreach (var rental in expiredRentals)
        {
            rental.Status = RentalStatus.Cancelled;
            rental.Item.IsAvailable = true;

            db.Messages.Add(new Message
            {
                SenderId = rental.Item.OwnerId,
                ReceiverId = rental.RenterId,
                Content = "O prazo de 10 minutos para pagar expirou. O pedido foi cancelado.",
                IsRead = false,
                RentalId = rental.Id,
                MessageType = RentalPaymentExpiredMessageType
            });

            logger.LogInformation(
                "Cancelled unpaid rental {RentalId} because payment deadline expired at {PaymentDeadline}.",
                rental.Id,
                rental.PaymentDeadline);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task CaptureExpiringHoldsAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var payments = scope.ServiceProvider.GetRequiredService<IPaymentService>();

        var captureDeadline = DateTime.UtcNow.Add(CaptureLeadTime);
        var rentals = await db.Rentals
            .Where(r => r.Status == RentalStatus.Completed)
            .Where(r => r.CaucaoPaymentStatus == PaymentStatus.Held)
            .Where(r => r.CaucaoPaymentIntentId != null)
            .Where(r => r.CaptureBefore != null && r.CaptureBefore <= captureDeadline)
            .OrderBy(r => r.CaptureBefore)
            .ToListAsync(cancellationToken);

        foreach (var rental in rentals)
        {
            try
            {
                await db.Entry(rental).ReloadAsync(cancellationToken);

                if (rental.Status != RentalStatus.Completed ||
                    rental.CaucaoPaymentStatus != PaymentStatus.Held ||
                    rental.CaucaoPaymentIntentId is null ||
                    rental.CaptureBefore is null ||
                    rental.CaptureBefore > DateTime.UtcNow.Add(CaptureLeadTime))
                {
                    continue;
                }

                await payments.CaptureHoldAsync(rental.CaucaoPaymentIntentId!, cancellationToken);
                rental.CaucaoPaymentStatus = PaymentStatus.Captured;

                logger.LogInformation(
                    "Auto-captured expiring caução hold for rental {RentalId} scheduled for {CaptureBefore}.",
                    rental.Id,
                    rental.CaptureBefore);
            }
            catch (StripeException ex)
            {
                rental.CaucaoPaymentStatus = PaymentStatus.Failed;
                logger.LogError(
                    ex,
                    "Failed to auto-capture expiring caução hold for rental {RentalId}. CaptureBefore: {CaptureBefore}, Code: {Code}, Message: {Message}",
                    rental.Id,
                    rental.CaptureBefore,
                    ex.StripeError?.Code,
                    ex.StripeError?.Message);
            }
        }

        if (rentals.Count > 0)
            await db.SaveChangesAsync(cancellationToken);
    }

    private async Task SendExpiringRentalRemindersAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var pushNotifications = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();

        var now = DateTime.UtcNow;
        var reminderWindowStart = now.AddHours(24).Subtract(PollInterval);
        var reminderWindowEnd = now.AddHours(24);

        var rentalsToNotify = await db.Rentals
            .Include(r => r.Item)
            .Where(r => r.Status == RentalStatus.Completed)
            .Where(r => r.EndDate > now)
            .Where(r => r.EndDate > reminderWindowStart && r.EndDate <= reminderWindowEnd)
            .ToListAsync(cancellationToken);

        if (rentalsToNotify.Count == 0)
            return;

        var rentalIds = rentalsToNotify.Select(r => r.Id).ToList();
        var alreadyNotified = await db.Messages
            .Where(m => m.RentalId != null && rentalIds.Contains(m.RentalId.Value))
            .Where(m => m.MessageType == RentalExpiringReminderMessageType)
            .Select(m => m.RentalId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        foreach (var rental in rentalsToNotify.Where(r => !alreadyNotified.Contains(r.Id)))
        {
            var receiverTokens = await db.DevicePushTokens
                .Where(t => t.UserId == rental.RenterId && t.Platform == "android")
                .Select(t => t.Token)
                .ToListAsync(cancellationToken);

            if (receiverTokens.Count > 0)
            {
                var invalidTokens = await pushNotifications.SendRentalExpiryReminderAsync(
                    receiverTokens,
                    rental.Id,
                    rental.Item.Title,
                    rental.EndDate,
                    cancellationToken);

                if (invalidTokens.Count > 0)
                {
                    var staleTokens = await db.DevicePushTokens
                        .Where(t => invalidTokens.Contains(t.Token))
                        .ToListAsync(cancellationToken);

                    if (staleTokens.Count > 0)
                        db.DevicePushTokens.RemoveRange(staleTokens);
                }
            }

            db.Messages.Add(new Message
            {
                SenderId = rental.Item.OwnerId,
                ReceiverId = rental.RenterId,
                Content = $"O seu aluguer de '{rental.Item.Title}' termina em 24h. Pode renovar o aluguer na secção dos seus alugueres.",
                IsRead = false,
                RentalId = rental.Id,
                MessageType = RentalExpiringReminderMessageType
            });
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}