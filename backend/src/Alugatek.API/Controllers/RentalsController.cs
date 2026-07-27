using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.API.Services;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class RentalsController(AppDbContext db, IPaymentService payments, IPushNotificationService pushNotifications, ILogger<RentalsController> logger) : ControllerBase
{
    private const decimal PlatformBaseCommission = 3.0m;
    private const decimal PlatformPercentageCommissionRate = 0.10m;

    [HttpPost]
    public async Task<ActionResult<RentalDto>> Create(CreateRentalRequest request)
    {
        var renterId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var item = await db.TechItems
            .Include(i => i.Category).Include(i => i.Owner)
            .FirstOrDefaultAsync(i => i.Id == request.ItemId && !i.IsDeleted);

        if (item is null) return NotFound(new { message = "Item not found." });
        if (!item.IsAvailable) return BadRequest(new { message = "Item is not available." });
        if (item.OwnerId == renterId) return BadRequest(new { message = "You cannot rent your own item." });

        var alreadyReservedByRenter = await db.Rentals
            .AnyAsync(r => r.ItemId == request.ItemId
                && r.RenterId == renterId
                && (r.Status == RentalStatus.Pending
                    || r.Status == RentalStatus.Active
                    || r.Status == RentalStatus.Completed
                    || r.Status == RentalStatus.ReturnRequested));

        if (alreadyReservedByRenter)
            return BadRequest(new { message = "You already have an active reservation for this item." });

        var hasConfirmedReservation = await db.Rentals
            .AnyAsync(r => r.ItemId == request.ItemId
                && (r.Status == RentalStatus.Active
                    || r.Status == RentalStatus.Completed
                    || r.Status == RentalStatus.ReturnRequested));

        if (hasConfirmedReservation)
            return BadRequest(new { message = "This item already has a confirmed reservation." });

        if (request.StartDate >= request.EndDate) return BadRequest(new { message = "Invalid date range." });
        if (request.StartDate < DateTime.UtcNow.Date) return BadRequest(new { message = "Start date cannot be in the past." });

        var days = (request.EndDate - request.StartDate).Days;
        if (days > 6) return BadRequest(new { message = "Maximum rental duration is 6 days." });

        var rental = new Rental
        {
            Id = Guid.NewGuid(),
            ItemId = request.ItemId,
            RenterId = renterId,
            StartDate = request.StartDate,
            EndDate = request.EndDate,
            TotalPrice = item.DailyRate * days,
            CaucaoAmount = item.Caucao
        };

        var rentRequestMessage = new Message
        {
            SenderId = renterId,
            ReceiverId = item.OwnerId,
            Content = $"Pedido de aluguer para {item.Title} por {days} {(days == 1 ? "dia" : "dias")}. O arrendatário terá 10 minutos para pagar.",
            IsRead = false,
            ItemId = item.Id,
            RentalId = rental.Id,
            MessageType = "RentalRequest"
        };

        db.Rentals.Add(rental);
        db.Messages.Add(rentRequestMessage);
        await db.SaveChangesAsync();

        var renter = await db.Users.FindAsync(renterId);

        var ownerTokens = await db.DevicePushTokens
            .Where(t => t.UserId == item.OwnerId && t.Platform == "android")
            .Select(t => t.Token)
            .Distinct()
            .ToListAsync();

        if (ownerTokens.Count > 0)
        {
            var invalidTokens = await pushNotifications.SendChatMessageAsync(
                ownerTokens,
                rentRequestMessage.Id,
                renterId,
                renter!.Name,
                item.Id,
                item.Title,
                rentRequestMessage.Content);

            if (invalidTokens.Count > 0)
            {
                var staleTokens = await db.DevicePushTokens
                    .Where(t => invalidTokens.Contains(t.Token))
                    .ToListAsync();

                if (staleTokens.Count > 0)
                {
                    db.DevicePushTokens.RemoveRange(staleTokens);
                    await db.SaveChangesAsync();
                }
            }
        }

        return CreatedAtAction(nameof(GetById), new { id = rental.Id }, MapToDto(rental, item, renter!));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<RentalDto>> GetById(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await ExpireOverdueUnpaidRentalsAsync();

        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId && rental.Item.OwnerId != userId) return Forbid();

        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpGet("my")]
    public async Task<ActionResult<IEnumerable<RentalDto>>> GetMyRentals()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        await ExpireOverdueUnpaidRentalsAsync();

        var rentals = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .Where(r => r.RenterId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        return Ok(rentals.Select(r => MapToDto(r, r.Item, r.Renter)));
    }

    [HttpPatch("{id:guid}/cancel")]
    public async Task<ActionResult<RentalDto>> Cancel(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId) return Forbid();
        if (rental.Status != RentalStatus.Pending && rental.Status != RentalStatus.Active)
            return BadRequest(new { message = "Rental cannot be cancelled." });

        if (rental.PaymentStatus == PaymentStatus.Captured && rental.PaymentIntentId is not null)
        {
            try
            {
                await payments.RefundAsync(rental.PaymentIntentId);
                rental.PaymentStatus = PaymentStatus.Released;
            }
            catch (StripeException ex)
            {
                return BadRequest(new { message = ex.StripeError?.Message ?? "Failed to refund the rental payment." });
            }
        }

        if (rental.CaucaoPaymentStatus == PaymentStatus.Held && rental.CaucaoPaymentIntentId is not null)
        {
            try
            {
                await payments.ReleaseHoldAsync(rental.CaucaoPaymentIntentId);
                rental.CaucaoPaymentStatus = PaymentStatus.Released;
            }
            catch (StripeException ex)
            {
                return BadRequest(new { message = ex.StripeError?.Message ?? "Failed to release the cau\u00e7\u00e3o hold." });
            }
        }

        if (rental.Status == RentalStatus.Active)
            rental.Item.IsAvailable = true;

        rental.Status = RentalStatus.Cancelled;
        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/confirm")]
    public async Task<ActionResult<RentalDto>> Confirm(Guid id, ConfirmRentalRequest? request)
    {
        string? normalizedPayoutDestination = null;
        if (!string.IsNullOrWhiteSpace(request?.PaymentDescription)
            && !PaymentDestinationValidator.TryNormalize(request.PaymentDescription, out normalizedPayoutDestination))
        {
            return BadRequest(new { message = "Invalid IBAN/MB WAY. Please provide a valid payout destination." });
        }

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.Item.OwnerId != userId) return Forbid();
        if (rental.Status != RentalStatus.Pending)
            return BadRequest(new { message = "Only pending rentals can be confirmed." });

        var hasAnotherConfirmedReservation = await db.Rentals
            .AnyAsync(r => r.ItemId == rental.ItemId
                && r.Id != rental.Id
                && (r.Status == RentalStatus.Active
                    || r.Status == RentalStatus.Completed
                    || r.Status == RentalStatus.ReturnRequested));

        if (hasAnotherConfirmedReservation)
            return BadRequest(new { message = "Another reservation for this item is already confirmed." });

        if (!string.IsNullOrWhiteSpace(normalizedPayoutDestination))
            rental.SellerPaymentDestination = normalizedPayoutDestination;

        rental.Status = RentalStatus.Active;
        rental.Item.IsAvailable = false;
        rental.PaymentDeadline = DateTime.UtcNow.AddMinutes(10);

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.RenterId,
            Content = $"O seu pedido de aluguer foi confirmado. Tem 10 minutos para pagar. Toque em Pagar para concluir.",
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = rental.Id,
            MessageType = "RentalConfirmed"
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/pay")]
    public async Task<ActionResult<RentalDto>> Pay(Guid id, PayRentalRequest request)
    {
        await ExpireOverdueUnpaidRentalsAsync();

        if (!string.IsNullOrWhiteSpace(request.PaymentDescription)
            && !PaymentDestinationValidator.TryNormalize(request.PaymentDescription, out _))
        {
            return BadRequest(new { message = "Invalid IBAN/MB WAY. Please provide a valid payout destination." });
        }

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId) return Forbid();
        if (rental.Status != RentalStatus.Active)
            return BadRequest(new { message = "Only active rentals can be paid." });
        if (rental.PaymentDeadline.HasValue && DateTime.UtcNow > rental.PaymentDeadline.Value)
        {
            rental.Status = RentalStatus.Cancelled;
            rental.Item.IsAvailable = true;

            db.Messages.Add(new Message
            {
                SenderId = rental.Item.OwnerId,
                ReceiverId = rental.RenterId,
                Content = "O prazo de 10 minutos para pagar expirou. O pedido foi cancelado.",
                IsRead = false,
                ItemId = rental.ItemId,
                RentalId = rental.Id,
                MessageType = "RentalPaymentExpired"
            });

            await db.SaveChangesAsync();
            return BadRequest(new { message = "O prazo de 24 horas para pagar expirou. O aluguer foi cancelado automaticamente." });
        }
        if (string.IsNullOrWhiteSpace(request.PaymentMethodId))
            return BadRequest(new { message = "A payment method is required." });

        // Create a Stripe customer with the card attached so the same card can be used
        // for both the rental charge and the caução hold.
        string customerId;
        try
        {
            customerId = await payments.CreateCustomerForPaymentAsync(request.PaymentMethodId, rental.Id.ToString());
        }
        catch (StripeException ex)
        {
            logger.LogError(ex,
                "Stripe customer setup failed for rental {RentalId}. Code: {Code}, Message: {Message}",
                rental.Id, ex.StripeError?.Code, ex.StripeError?.Message);
            return BadRequest(new { message = ex.StripeError?.Message ?? "Payment failed." });
        }

        var platformCommission = PlatformBaseCommission + (rental.TotalPrice * PlatformPercentageCommissionRate);
        var totalChargeAmount = rental.TotalPrice + platformCommission;
        var sellerPayoutDestination = ResolveSellerPayoutDestination(rental, request.PaymentDescription);
        if (sellerPayoutDestination is null)
            return BadRequest(new { message = "Seller payout destination is missing. Ask the seller to add a valid IBAN/MB WAY before payment." });

        var chargeDescription = BuildCaptureDescription(rental, sellerPayoutDestination, rental.TotalPrice);
        var holdDescription = BuildCaptureDescription(rental, sellerPayoutDestination, rental.CaucaoAmount);

        // 1. Charge the rental price + platform commission immediately.
        try
        {
            var priceIntentId = await payments.ChargeAsync(
                totalChargeAmount, "eur", request.PaymentMethodId, customerId, rental.Id.ToString(), chargeDescription);
            rental.PaymentIntentId = priceIntentId;
            rental.PaymentStatus = PaymentStatus.Captured;
        }
        catch (StripeException ex)
        {
            logger.LogError(ex,
                "Stripe charge failed for rental {RentalId}. Code: {Code}, Message: {Message}",
                rental.Id, ex.StripeError?.Code, ex.StripeError?.Message);
            return BadRequest(new { message = ex.StripeError?.Message ?? "Payment failed." });
        }

        // 2. Place a hold for the caução (if the item has one).
        if (rental.CaucaoAmount > 0)
        {
            try
            {
                var hold = await payments.PlaceHoldAsync(
                    rental.CaucaoAmount, "eur", request.PaymentMethodId, customerId, rental.Id.ToString(), holdDescription);
                rental.CaucaoPaymentIntentId = hold.PaymentIntentId;
                rental.CaucaoPaymentStatus = PaymentStatus.Held;
                rental.CaptureBefore = hold.CaptureBefore;
                rental.ExtendedAuthorizationStatus = hold.ExtendedAuthorizationStatus;
            }
            catch (StripeException ex)
            {
                // The rental price was already charged. Log the failure but do not block
                // the rental from proceeding — the owner can follow up manually.
                logger.LogError(ex,
                    "Stripe caução hold failed for rental {RentalId}. Code: {Code}, Message: {Message}",
                    rental.Id, ex.StripeError?.Code, ex.StripeError?.Message);
                rental.CaucaoPaymentStatus = PaymentStatus.Failed;
            }
        }

        // If payment happens after the originally requested start date,
        // shift the rental window forward so it starts on payment day.
        var paymentDay = DateTime.UtcNow.Date;
        var originalStartDay = rental.StartDate.Date;
        if (originalStartDay < paymentDay)
        {
            var rentalDurationDays = (rental.EndDate.Date - originalStartDay).Days;
            rental.StartDate = paymentDay;
            rental.EndDate = paymentDay.AddDays(rentalDurationDays);
        }

        rental.Item.IsAvailable = false;
        rental.Status = RentalStatus.Completed;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.Item.OwnerId,
            Content = $"O pagamento do aluguer foi concluído às {DateTime.UtcNow:HH:mm}."
                + (rental.CaucaoAmount > 0 ? $" Caução de {rental.CaucaoAmount:F2}€ retida no cartão do arrendatário." : string.Empty),
            IsRead = false,
            ItemId = rental.ItemId
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/renew")]
    public async Task<ActionResult<RentalDto>> Renew(Guid id, RenewRentalRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.PaymentDescription)
            && !PaymentDestinationValidator.TryNormalize(request.PaymentDescription, out _))
        {
            return BadRequest(new { message = "Invalid IBAN/MB WAY. Please provide a valid payout destination." });
        }

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (request.ExtraDays <= 0)
            return BadRequest(new { message = "Extra days must be greater than zero." });

        if (request.ExtraDays > 6)
            return BadRequest(new { message = "You can renew at most 6 days at a time." });

        if (string.IsNullOrWhiteSpace(request.PaymentMethodId))
            return BadRequest(new { message = "A payment method is required to renew." });

        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId) return Forbid();
        if (rental.Status != RentalStatus.Completed)
            return BadRequest(new { message = "Only rentals in progress can be renewed." });
        if (rental.EndDate <= DateTime.UtcNow)
            return BadRequest(new { message = "This rental has already expired and cannot be renewed." });

        var quote = BuildRenewQuote(rental.Item.DailyRate, request.ExtraDays);
        var sellerPayoutDestination = ResolveSellerPayoutDestination(rental, request.PaymentDescription);
        if (sellerPayoutDestination is null)
            return BadRequest(new { message = "Seller payout destination is missing. Ask the seller to add a valid IBAN/MB WAY before renewal payment." });

        var renewChargeDescription = BuildCaptureDescription(rental, sellerPayoutDestination, quote.AdditionalAmount);
        var renewHoldDescription = BuildCaptureDescription(rental, sellerPayoutDestination, rental.CaucaoAmount);
        var previousHoldIntentId = rental.CaucaoPaymentIntentId;
        var hadPreviousActiveHold = rental.CaucaoPaymentStatus == PaymentStatus.Held && !string.IsNullOrWhiteSpace(previousHoldIntentId);
        string? renewalChargeIntentId = null;
        PaymentHoldResult? newHold = null;

        try
        {
            var renewalCustomerId = await payments.CreateCustomerForPaymentAsync(
                request.PaymentMethodId,
                rental.Id.ToString());

            renewalChargeIntentId = await payments.ChargeAsync(
                quote.TotalCharge,
                "eur",
                request.PaymentMethodId,
                renewalCustomerId,
                rental.Id.ToString(),
                renewChargeDescription);

            if (rental.CaucaoAmount > 0)
            {
                newHold = await payments.PlaceHoldAsync(
                    rental.CaucaoAmount,
                    "eur",
                    request.PaymentMethodId,
                    renewalCustomerId,
                    rental.Id.ToString(),
                    renewHoldDescription);
            }

            if (hadPreviousActiveHold)
                await payments.ReleaseHoldAsync(previousHoldIntentId!);
        }
        catch (StripeException ex)
        {
            // Best-effort rollback: if a new hold was created but old hold release/renew failed,
            // release the new hold and refund the renewal charge.
            if (newHold is not null)
            {
                try
                {
                    await payments.ReleaseHoldAsync(newHold.PaymentIntentId);
                }
                catch (StripeException releaseEx)
                {
                    logger.LogError(releaseEx,
                        "Rollback failed while releasing new renewal hold for rental {RentalId}. Intent: {IntentId}",
                        rental.Id, newHold.PaymentIntentId);
                }
            }

            if (renewalChargeIntentId is not null)
            {
                try
                {
                    await payments.RefundAsync(renewalChargeIntentId);
                }
                catch (StripeException refundEx)
                {
                    logger.LogError(refundEx,
                        "Rollback failed while refunding renewal charge for rental {RentalId}. Intent: {IntentId}",
                        rental.Id, renewalChargeIntentId);
                }
            }

            logger.LogError(ex,
                "Stripe renewal charge failed for rental {RentalId}. Code: {Code}, Message: {Message}",
                rental.Id, ex.StripeError?.Code, ex.StripeError?.Message);
            return BadRequest(new { message = ex.StripeError?.Message ?? "Renewal failed while updating payment hold." });
        }

        if (newHold is not null)
        {
            rental.CaucaoPaymentIntentId = newHold.PaymentIntentId;
            rental.CaucaoPaymentStatus = PaymentStatus.Held;
            rental.CaptureBefore = newHold.CaptureBefore;
            rental.ExtendedAuthorizationStatus = newHold.ExtendedAuthorizationStatus;
        }

        rental.EndDate = rental.EndDate.AddDays(request.ExtraDays);
        rental.TotalPrice += quote.AdditionalAmount;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.Item.OwnerId,
            Content = $"O arrendatário renovou o aluguer por {request.ExtraDays} {(request.ExtraDays == 1 ? "dia" : "dias")}. Valor cobrado: {quote.TotalCharge:F2}€. Nova data de fim: {rental.EndDate:yyyy-MM-dd}.",
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = rental.Id,
            MessageType = "RentalRenewed"
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpGet("{id:guid}/renew-quote")]
    public async Task<ActionResult<RenewQuoteDto>> GetRenewQuote(Guid id, [FromQuery] int extraDays)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (extraDays <= 0)
            return BadRequest(new { message = "Extra days must be greater than zero." });

        if (extraDays > 6)
            return BadRequest(new { message = "You can renew at most 6 days at a time." });

        var rental = await db.Rentals
            .Include(r => r.Item)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId) return Forbid();
        if (rental.Status != RentalStatus.Completed)
            return BadRequest(new { message = "Only rentals in progress can be renewed." });
        if (rental.EndDate <= DateTime.UtcNow)
            return BadRequest(new { message = "This rental has already expired and cannot be renewed." });

        return Ok(BuildRenewQuote(rental.Item.DailyRate, extraDays));
    }

    [HttpPatch("{id:guid}/return")]
    public async Task<ActionResult<RentalDto>> Return(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId) return Forbid();
        if (rental.Status != RentalStatus.Completed)
            return BadRequest(new { message = "Only rentals in progress can be returned." });

        rental.Status = RentalStatus.ReturnRequested;

        var returnRequestMessage = new Message
        {
            SenderId = userId,
            ReceiverId = rental.Item.OwnerId,
            Content = "Pedido de devolução enviado. Confirme a devolução.",
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = rental.Id,
            MessageType = "ReturnRequest"
        };
        db.Messages.Add(returnRequestMessage);

        await db.SaveChangesAsync();

        var ownerTokens = await db.DevicePushTokens
            .Where(t => t.UserId == rental.Item.OwnerId && t.Platform == "android")
            .Select(t => t.Token)
            .Distinct()
            .ToListAsync();

        if (ownerTokens.Count > 0)
        {
            var invalidTokens = await pushNotifications.SendChatMessageAsync(
                ownerTokens,
                returnRequestMessage.Id,
                userId,
                rental.Renter.Name,
                rental.ItemId,
                rental.Item.Title,
                returnRequestMessage.Content);

            if (invalidTokens.Count > 0)
            {
                var staleTokens = await db.DevicePushTokens
                    .Where(t => invalidTokens.Contains(t.Token))
                    .ToListAsync();

                if (staleTokens.Count > 0)
                {
                    db.DevicePushTokens.RemoveRange(staleTokens);
                    await db.SaveChangesAsync();
                }
            }
        }

        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPost("{id:guid}/dispute")]
    public async Task<IActionResult> OpenDispute(Guid id, OpenDisputeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Reason) || string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(new { message = "Reason and description are required." });

        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId && rental.Item.OwnerId != userId) return Forbid();

        var receiverId = rental.RenterId == userId ? rental.Item.OwnerId : rental.RenterId;
        var disputeContent = $"[DISPUTA] Motivo: {request.Reason.Trim()}. Detalhes: {request.Description.Trim()}";

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = receiverId,
            Content = disputeContent,
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = rental.Id,
            MessageType = "DisputeOpened"
        });

        await db.SaveChangesAsync();
        return Ok(new { message = "Dispute opened successfully." });
    }

    [HttpPatch("{id:guid}/confirm-return")]
    public async Task<ActionResult<RentalDto>> ConfirmReturn(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.Item.OwnerId != userId) return Forbid();
        if (rental.Status != RentalStatus.ReturnRequested)
            return BadRequest(new { message = "Only requested returns can be confirmed." });

        if (rental.CaucaoPaymentStatus == PaymentStatus.Held && rental.CaucaoPaymentIntentId is not null)
        {
            try
            {
                // Release the caução hold — item returned in good condition.
                await payments.ReleaseHoldAsync(rental.CaucaoPaymentIntentId);
                rental.CaucaoPaymentStatus = PaymentStatus.Released;
            }
            catch (StripeException ex)
            {
                return BadRequest(new { message = ex.StripeError?.Message ?? "Failed to release the caução hold." });
            }
        }

        rental.Status = RentalStatus.Returned;
        rental.Item.IsAvailable = true;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.RenterId,
            Content = "A devolução do aluguer foi confirmada.",
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = rental.Id,
            MessageType = "ReturnConfirmed"
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/decline-return")]
    public async Task<ActionResult<RentalDto>> DeclineReturn(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.Item.OwnerId != userId) return Forbid();
        if (rental.Status != RentalStatus.ReturnRequested)
            return BadRequest(new { message = "Only requested returns can be declined." });

        rental.Status = RentalStatus.Completed;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.RenterId,
            Content = "A devolução do aluguer foi recusada.",
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = rental.Id,
            MessageType = "ReturnDeclined"
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/decline")]
    public async Task<ActionResult<RentalDto>> Decline(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.Item.OwnerId != userId) return Forbid();
        if (rental.Status != RentalStatus.Pending)
            return BadRequest(new { message = "Only pending rentals can be declined." });

        rental.Status = RentalStatus.Cancelled;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.RenterId,
            Content = "O seu pedido de aluguer foi cancelado.",
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = rental.Id,
            MessageType = "RentalDeclined"
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    private static RentalDto MapToDto(Rental r, TechItem item, User renter)
    {
        var imageUrls = string.IsNullOrWhiteSpace(item.ImageUrl)
            ? Array.Empty<string>()
            : [item.ImageUrl];

        var itemDto = new TechItemDto(
            item.Id, item.Title, item.Description, item.District, item.Localidade, item.DailyRate, item.Caucao, item.ImageUrl, imageUrls,
            item.IsAvailable, item.Category.Name,
            new UserDto(item.Owner.Id, item.Owner.Name, item.Owner.Email, item.Owner.AvatarUrl, item.Owner.Phone),
            item.CreatedAt);

        return new RentalDto(
            r.Id, itemDto,
            new UserDto(renter.Id, renter.Name, renter.Email, renter.AvatarUrl, renter.Phone),
            r.StartDate, r.EndDate, r.TotalPrice, r.CaucaoAmount, r.Status.ToString(), r.CreatedAt,
            r.PaymentStatus.ToString(), r.CaucaoPaymentStatus.ToString(), r.CaptureBefore, r.ExtendedAuthorizationStatus,
            r.PaymentDeadline);
    }

    private static RenewQuoteDto BuildRenewQuote(decimal dailyRate, int extraDays)
    {
        var additionalAmount = dailyRate * extraDays;
        var platformCommission = additionalAmount * PlatformPercentageCommissionRate;
        var totalCharge = additionalAmount + platformCommission;
        return new RenewQuoteDto(additionalAmount, platformCommission, totalCharge);
    }

    private static string? ResolveSellerPayoutDestination(Rental rental, string? requestPaymentDescription)
    {
        if (!string.IsNullOrWhiteSpace(rental.SellerPaymentDestination)
            && PaymentDestinationValidator.TryNormalize(rental.SellerPaymentDestination, out var normalizedFromRental))
        {
            return normalizedFromRental;
        }

        if (!string.IsNullOrWhiteSpace(requestPaymentDescription)
            && PaymentDestinationValidator.TryNormalize(requestPaymentDescription, out var normalizedFromRequest))
        {
            return normalizedFromRequest;
        }

        return null;
    }

    private static string BuildCaptureDescription(Rental rental, string sellerPayoutDestination, decimal valorATransferir)
    {
        var sellerEmail = rental.Item.Owner.Email.Trim().ToLowerInvariant();
        var buyerEmail = rental.Renter.Email.Trim().ToLowerInvariant();

        return $"rental={rental.Id}; seller_payout={sellerPayoutDestination}; seller_email={sellerEmail}; buyer_email={buyerEmail}; Valor a transferir: {valorATransferir:F2}€";
    }

    private async Task ExpireOverdueUnpaidRentalsAsync()
    {
        var now = DateTime.UtcNow;
        var overdueRentals = await db.Rentals
            .Include(r => r.Item)
            .Where(r => r.Status == RentalStatus.Active)
            .Where(r => r.PaymentStatus == PaymentStatus.None)
            .Where(r => r.PaymentDeadline != null && r.PaymentDeadline <= now)
            .ToListAsync();

        if (overdueRentals.Count == 0)
            return;

        var overdueRentalIds = overdueRentals.Select(r => r.Id).ToList();
        var notifiedRentalIds = await db.Messages
            .Where(m => m.RentalId != null && overdueRentalIds.Contains(m.RentalId.Value))
            .Where(m => m.MessageType == "RentalPaymentExpired")
            .Select(m => m.RentalId!.Value)
            .Distinct()
            .ToListAsync();

        foreach (var rental in overdueRentals)
        {
            rental.Status = RentalStatus.Cancelled;
            rental.Item.IsAvailable = true;

            if (!notifiedRentalIds.Contains(rental.Id))
            {
                db.Messages.Add(new Message
                {
                    SenderId = rental.Item.OwnerId,
                    ReceiverId = rental.RenterId,
                    Content = "O prazo de 24 horas para pagar expirou. O pedido foi cancelado.",
                    IsRead = false,
                    ItemId = rental.ItemId,
                    RentalId = rental.Id,
                    MessageType = "RentalPaymentExpired"
                });
            }

            logger.LogInformation(
                "Auto-cancelled overdue unpaid rental {RentalId} with deadline {PaymentDeadline}.",
                rental.Id,
                rental.PaymentDeadline);
        }

        await db.SaveChangesAsync();
    }
}
