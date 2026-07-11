using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Stripe;

namespace Alugatek.API.Services;

public sealed class ExpiringHoldCaptureService(
    IServiceScopeFactory scopeFactory,
    ILogger<ExpiringHoldCaptureService> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan CaptureLeadTime = TimeSpan.FromMinutes(60);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CaptureExpiringHoldsAsync(stoppingToken);
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
}