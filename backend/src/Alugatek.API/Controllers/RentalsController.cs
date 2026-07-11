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
public class RentalsController(AppDbContext db, IPaymentService payments, ILogger<RentalsController> logger) : ControllerBase
{
    private const decimal PlatformBaseCommission = 3.0m;
    private const decimal PlatformPercentageCommissionRate = 0.10m;

    [HttpPost]
    public async Task<ActionResult<RentalDto>> Create(CreateRentalRequest request)
    {
        var renterId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var item = await db.TechItems
            .Include(i => i.Category).Include(i => i.Owner).Include(i => i.Reviews)
            .FirstOrDefaultAsync(i => i.Id == request.ItemId);

        if (item is null) return NotFound(new { message = "Item not found." });
        if (!item.IsAvailable) return BadRequest(new { message = "Item is not available." });
        if (item.OwnerId == renterId) return BadRequest(new { message = "You cannot rent your own item." });
        if (request.StartDate >= request.EndDate) return BadRequest(new { message = "Invalid date range." });
        if (request.StartDate < DateTime.UtcNow.Date) return BadRequest(new { message = "Start date cannot be in the past." });

        var days = (request.EndDate - request.StartDate).Days;
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
            Content = $"Pedido de aluguer para {item.Title} por {days} {(days == 1 ? "dia" : "dias")}.",
            IsRead = false,
            RentalId = rental.Id,
            MessageType = "RentalRequest"
        };

        item.IsAvailable = false;
        db.Rentals.Add(rental);
        db.Messages.Add(rentRequestMessage);
        await db.SaveChangesAsync();

        var renter = await db.Users.FindAsync(renterId);
        return CreatedAtAction(nameof(GetById), new { id = rental.Id }, MapToDto(rental, item, renter!));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<RentalDto>> GetById(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
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
        var rentals = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
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
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
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

        rental.Status = RentalStatus.Cancelled;
        rental.Item.IsAvailable = true;
        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/confirm")]
    public async Task<ActionResult<RentalDto>> Confirm(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.Item.OwnerId != userId) return Forbid();
        if (rental.Status != RentalStatus.Pending)
            return BadRequest(new { message = "Only pending rentals can be confirmed." });

        rental.Status = RentalStatus.Active;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.RenterId,
            Content = $"O seu pedido de aluguer foi confirmado. Toque em Pagar para concluir.",
            IsRead = false,
            RentalId = rental.Id,
            MessageType = "RentalConfirmed"
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/pay")]
    public async Task<ActionResult<RentalDto>> Pay(Guid id, PayRentalRequest request)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId) return Forbid();
        if (rental.Status != RentalStatus.Active)
            return BadRequest(new { message = "Only active rentals can be paid." });
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

        // 1. Charge the rental price + platform commission immediately.
        try
        {
            var priceIntentId = await payments.ChargeAsync(
                totalChargeAmount, "eur", request.PaymentMethodId, customerId, rental.Id.ToString());
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
                    rental.CaucaoAmount, "eur", request.PaymentMethodId, customerId, rental.Id.ToString());
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

        rental.Status = RentalStatus.Completed;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.Item.OwnerId,
            Content = $"O pagamento do aluguer foi concluído às {DateTime.UtcNow:HH:mm}."
                + $" Comissão da plataforma: {platformCommission:F2}€."
                + (rental.CaucaoAmount > 0 ? $" Caução de {rental.CaucaoAmount:F2}€ retida no cartão do arrendatário." : string.Empty),
            IsRead = false
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/return")]
    public async Task<ActionResult<RentalDto>> Return(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.RenterId != userId) return Forbid();
        if (rental.Status != RentalStatus.Completed)
            return BadRequest(new { message = "Only rentals in progress can be returned." });

        rental.Status = RentalStatus.ReturnRequested;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.Item.OwnerId,
            Content = "Pedido de devolução enviado. Confirme a devolução.",
            IsRead = false,
            RentalId = rental.Id,
            MessageType = "ReturnRequest"
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    [HttpPatch("{id:guid}/confirm-return")]
    public async Task<ActionResult<RentalDto>> ConfirmReturn(Guid id)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item).ThenInclude(i => i.Category)
            .Include(r => r.Item).ThenInclude(i => i.Owner)
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
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
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
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
            .Include(r => r.Item).ThenInclude(i => i.Reviews)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null) return NotFound();
        if (rental.Item.OwnerId != userId) return Forbid();
        if (rental.Status != RentalStatus.Pending)
            return BadRequest(new { message = "Only pending rentals can be declined." });

        rental.Status = RentalStatus.Cancelled;
        rental.Item.IsAvailable = true;

        db.Messages.Add(new Message
        {
            SenderId = userId,
            ReceiverId = rental.RenterId,
            Content = "O seu pedido de aluguer foi cancelado.",
            IsRead = false,
            RentalId = rental.Id,
            MessageType = "RentalDeclined"
        });

        await db.SaveChangesAsync();
        return Ok(MapToDto(rental, rental.Item, rental.Renter));
    }

    private static RentalDto MapToDto(Rental r, TechItem item, User renter)
    {
        var itemDto = new TechItemDto(
            item.Id, item.Title, item.Description, item.District, item.DailyRate, item.Caucao, item.ImageUrl,
            item.IsAvailable, item.Category.Name,
            new UserDto(item.Owner.Id, item.Owner.Name, item.Owner.Email, item.Owner.AvatarUrl, item.Owner.Phone),
            item.Reviews.Count > 0 ? item.Reviews.Average(rev => rev.Rating) : null,
            item.CreatedAt);

        return new RentalDto(
            r.Id, itemDto,
            new UserDto(renter.Id, renter.Name, renter.Email, renter.AvatarUrl, renter.Phone),
            r.StartDate, r.EndDate, r.TotalPrice, r.CaucaoAmount, r.Status.ToString(), r.CreatedAt,
            r.PaymentStatus.ToString(), r.CaucaoPaymentStatus.ToString(), r.CaptureBefore, r.ExtendedAuthorizationStatus);
    }
}
