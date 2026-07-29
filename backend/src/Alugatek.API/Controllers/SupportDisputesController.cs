using System.Security.Claims;
using Alugatek.API.Services;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Stripe;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/support/disputes")]
[Authorize(Policy = "SupportAccess")]
public class SupportDisputesController(AppDbContext db, IPaymentService payments) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<SupportDisputeSummaryDto>>> GetInbox([FromQuery] string? status)
    {
        var rentals = await db.Rentals
            .Include(r => r.Item)
                .ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();

        var rentalIds = rentals.Select(r => r.Id).ToList();
        var latestMessages = await db.Messages
            .Where(m => m.RentalId != null && rentalIds.Contains(m.RentalId.Value))
            .GroupBy(m => m.RentalId!.Value)
            .Select(g => new
            {
                RentalId = g.Key,
                LastContent = g.OrderByDescending(m => m.CreatedAt).Select(m => m.Content).FirstOrDefault()
            })
            .ToDictionaryAsync(x => x.RentalId, x => x.LastContent ?? "Pedido de suporte");

        var items = rentals.Select(r =>
        {
            var mappedStatus = MapDisputeStatus(r.Status);
            latestMessages.TryGetValue(r.Id, out var reason);

            return new SupportDisputeSummaryDto(
                r.Id,
                r.Id,
                r.CreatedAt,
                mappedStatus,
                r.Renter.Name,
                r.Item.Owner.Name,
                reason ?? "Pedido de suporte",
                null);
        });

        if (!string.IsNullOrWhiteSpace(status))
            items = items.Where(i => string.Equals(i.Status, status, StringComparison.OrdinalIgnoreCase));

        return Ok(items.ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SupportDisputeDetailDto>> GetById(Guid id)
    {
        var rental = await db.Rentals
            .Include(r => r.Item)
                .ThenInclude(i => i.Owner)
            .Include(r => r.Renter)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null)
            return NotFound(new { message = "Dispute not found." });

        var messages = await db.Messages
            .Include(m => m.Sender)
            .Where(m => m.RentalId == id || m.ItemId == rental.ItemId)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();

        var reason = messages.LastOrDefault()?.Content ?? "Pedido de suporte";

        var detail = new SupportDisputeDetailDto(
            rental.Id,
            rental.Id,
            rental.CreatedAt,
            MapDisputeStatus(rental.Status),
            rental.Renter.Name,
            rental.Item.Owner.Name,
            reason,
            null,
            rental.RenterId,
            rental.Item.OwnerId,
            $"Disputa associada ao aluguer {rental.Id}.",
            messages
                .Select(m => new SupportDisputeMessageDto(
                    m.Id,
                    rental.Id,
                    m.SenderId,
                    m.Sender.Name,
                    MapSenderRole(m.Sender.Role),
                    m.Content,
                    m.CreatedAt))
                .ToList());

        return Ok(detail);
    }

    [HttpPost("{id:guid}/reply")]
    public async Task<IActionResult> Reply(Guid id, SupportReplyRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { message = "Reply content is required." });

        var supportId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var supportUser = await db.Users.FirstOrDefaultAsync(u => u.Id == supportId);
        if (supportUser is null)
            return Unauthorized();

        var rental = await db.Rentals
            .Include(r => r.Item)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (rental is null)
            return NotFound(new { message = "Dispute not found." });

        var targetUserId = await db.Messages
            .Where(m => m.RentalId == id && m.SenderId != supportId)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => m.SenderId)
            .FirstOrDefaultAsync();

        if (targetUserId == Guid.Empty)
            targetUserId = rental.RenterId;

        db.Messages.Add(new Message
        {
            SenderId = supportId,
            ReceiverId = targetUserId,
            Content = request.Content.Trim(),
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = id,
            MessageType = "SupportReply"
        });

        await db.SaveChangesAsync();
        return Ok();
    }

    [HttpPatch("{id:guid}/assign")]
    public async Task<IActionResult> Assign(Guid id, SupportAssignRequest request)
    {
        var rentalExists = await db.Rentals.AnyAsync(r => r.Id == id);
        if (!rentalExists)
            return NotFound(new { message = "Dispute not found." });

        var assignee = await db.Users.FirstOrDefaultAsync(u => u.Id == request.AssigneeUserId);
        if (assignee is null)
            return NotFound(new { message = "Assignee user not found." });

        if (assignee.Role is not Alugatek.Domain.Entities.User.RoleSupport and not Alugatek.Domain.Entities.User.RoleAdmin)
            return BadRequest(new { message = "Assignee must have Support/Admin role." });

        return Ok(new { id, assigneeUserId = assignee.Id, assigneeName = assignee.Name });
    }

    [HttpPatch("{id:guid}/resolve")]
    public async Task<IActionResult> Resolve(Guid id, SupportResolveRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.ResolutionNote))
            return BadRequest(new { message = "Resolution note is required." });

        var supportId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var rental = await db.Rentals
            .Include(r => r.Item)
            .FirstOrDefaultAsync(r => r.Id == id);
        if (rental is null)
            return NotFound(new { message = "Dispute not found." });

        if (request.ConcludeRental)
        {
            if (rental.Status is not RentalStatus.Completed and not RentalStatus.ReturnRequested and not RentalStatus.Returned)
                return BadRequest(new { message = "Rental cannot be concluded from its current status." });

            if (rental.Status != RentalStatus.Returned)
            {
                if (rental.CaucaoPaymentStatus == PaymentStatus.Held && rental.CaucaoPaymentIntentId is not null)
                {
                    try
                    {
                        // Release held deposit funds when support concludes the rental.
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
            }
        }

        db.Messages.Add(new Message
        {
            SenderId = supportId,
            ReceiverId = rental.RenterId,
            Content = request.ResolutionNote.Trim(),
            IsRead = false,
            ItemId = rental.ItemId,
            RentalId = id,
            MessageType = "SupportResolution"
        });

        await db.SaveChangesAsync();
        return Ok();
    }

    private static string MapDisputeStatus(RentalStatus status)
    {
        return status switch
        {
            RentalStatus.ReturnRequested => "Open",
            RentalStatus.Returned => "Resolved",
            RentalStatus.Cancelled => "Rejected",
            RentalStatus.Completed => "UnderReview",
            _ => "WaitingCustomer"
        };
    }

    private static string MapSenderRole(string userRole)
    {
        return userRole is Alugatek.Domain.Entities.User.RoleSupport or Alugatek.Domain.Entities.User.RoleAdmin ? "Support" : "Customer";
    }

    public record SupportDisputeSummaryDto(
        Guid Id,
        Guid RentalId,
        DateTime CreatedAt,
        string Status,
        string OpenedByName,
        string AgainstUserName,
        string Reason,
        string? AssignedToName);

    public record SupportDisputeMessageDto(
        Guid Id,
        Guid DisputeId,
        Guid SenderId,
        string SenderName,
        string SenderRole,
        string Content,
        DateTime CreatedAt);

    public record SupportDisputeDetailDto(
        Guid Id,
        Guid RentalId,
        DateTime CreatedAt,
        string Status,
        string OpenedByName,
        string AgainstUserName,
        string Reason,
        string? AssignedToName,
        Guid OpenedByUserId,
        Guid AgainstUserId,
        string Description,
        List<SupportDisputeMessageDto> Messages);

    public record SupportReplyRequest(string Content);
    public record SupportResolveRequest(string ResolutionNote, bool ConcludeRental);
    public record SupportAssignRequest(Guid AssigneeUserId);
}
