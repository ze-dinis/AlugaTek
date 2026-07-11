using Alugatek.API.Services;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Stripe;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/stripe")]
public class StripeWebhookController(
    AppDbContext db,
    IOptions<StripeOptions> stripeOptions,
    ILogger<StripeWebhookController> logger) : ControllerBase
{
    /// <summary>
    /// Receives and processes Stripe webhook events.
    /// The endpoint must be public (no JWT auth) and must read the raw request body
    /// so Stripe's signature verification works correctly.
    /// </summary>
    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook()
    {
        var secret = stripeOptions.Value.WebhookSecret;
        if (string.IsNullOrWhiteSpace(secret))
        {
            logger.LogWarning("Stripe webhook secret is not configured; all webhook requests will be rejected.");
            return BadRequest(new {message = "Webhook not configured."});
        }

        string json;
        using (var reader = new StreamReader(HttpContext.Request.Body))
            json = await reader.ReadToEndAsync();

        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(
                json,
                Request.Headers["Stripe-Signature"],
                secret,
                throwOnApiVersionMismatch: false);
        }
        catch (StripeException ex)
        {
            logger.LogWarning("Webhook signature verification failed: {Message}", ex.Message);
            return BadRequest(new {message = "Invalid webhook signature."});
        }

        logger.LogInformation("Received Stripe webhook event: {Type} ({Id})", stripeEvent.Type, stripeEvent.Id);

        switch (stripeEvent.Type)
        {
            case EventTypes.PaymentIntentPaymentFailed:
                await HandlePaymentFailedAsync(stripeEvent);
                break;

            case EventTypes.PaymentIntentAmountCapturableUpdated:
                await HandleCapturableUpdatedAsync(stripeEvent);
                break;
        }

        return Ok();
    }

    // ------------------------------------------------------------------ handlers

    /// <summary>
    /// Fired when a PaymentIntent fails asynchronously (e.g. fraud review, 3DS failure).
    /// Resets the rental so the renter can retry payment.
    /// </summary>
    private async Task HandlePaymentFailedAsync(Event stripeEvent)
    {
        if (stripeEvent.Data.Object is not PaymentIntent intent) return;

        var rental = await db.Rentals
            .Include(r => r.Item)
            .FirstOrDefaultAsync(r => r.PaymentIntentId == intent.Id || r.CaucaoPaymentIntentId == intent.Id);

        if (rental is null)
        {
            logger.LogWarning("payment_intent.payment_failed: no rental found for intent {Id}.", intent.Id);
            return;
        }

        if (rental.CaucaoPaymentIntentId == intent.Id)
        {
            rental.CaucaoPaymentStatus = PaymentStatus.Failed;
            logger.LogInformation("Rental {RentalId} cau\u00e7\u00e3o hold marked as failed.", rental.Id);
        }
        else
        {
            rental.PaymentStatus = PaymentStatus.Failed;
            // Allow the renter to retry by reverting to Active.
            if (rental.Status == RentalStatus.Completed)
            {
                rental.Status = RentalStatus.Active;
                rental.Item.IsAvailable = true;
            }

            db.Messages.Add(new Message
            {
                SenderId = rental.RenterId,
                ReceiverId = rental.RenterId,   // self-notification
                Content = $"O pagamento do aluguer falhou. Por favor, tente novamente.",
                IsRead = false
            });
            logger.LogInformation("Rental {RentalId} payment marked as failed.", rental.Id);
        }

        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Fired when the capture window or capturable amount changes.
    /// Keeps the stored capture deadline in sync with Stripe.
    /// </summary>
    private async Task HandleCapturableUpdatedAsync(Event stripeEvent)
    {
        if (stripeEvent.Data.Object is not PaymentIntent intent) return;

        // This event only fires for manual-capture intents (the caução hold).
        var rental = await db.Rentals.FirstOrDefaultAsync(r => r.CaucaoPaymentIntentId == intent.Id);
        if (rental is null) return;

        var captureBefore = intent.LatestCharge?.PaymentMethodDetails?.Card?.CaptureBefore;
        if (captureBefore.HasValue)
        {
            rental.CaptureBefore = captureBefore.Value;
            await db.SaveChangesAsync();
            logger.LogInformation("Updated CaptureBefore for rental {RentalId} to {CaptureBefore}.", rental.Id, captureBefore.Value);
        }
    }
}
