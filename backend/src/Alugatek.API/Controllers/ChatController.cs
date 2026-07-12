using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.API.Services;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatController(AppDbContext db, IPushNotificationService pushNotifications) : ControllerBase
{
    [HttpGet("conversations")]
    public async Task<ActionResult<IEnumerable<ConversationDto>>> GetConversations()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var conversations = await db.Messages
            .Include(m => m.Sender)
            .Include(m => m.Receiver)
            .Where(m => m.ItemId != null && (m.SenderId == userId || m.ReceiverId == userId))
            .GroupBy(m => m.ItemId!.Value)
            .Select(g => new
            {
                ItemId = g.Key,
                LastMessage = g.OrderByDescending(m => m.CreatedAt).First(),
                UnreadCount = g.Count(m => m.ReceiverId == userId && !m.IsRead)
            })
            .ToListAsync();

        var itemIds = conversations.Select(c => c.ItemId).ToList();
        var items = await db.TechItems
            .Include(i => i.Owner)
            .Where(i => itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id);

        var result = new List<ConversationDto>();
        foreach (var conv in conversations)
        {
            if (!items.TryGetValue(conv.ItemId, out var item))
                continue;

            var lastMessage = conv.LastMessage;
            var otherUserId = lastMessage.SenderId == userId ? lastMessage.ReceiverId : lastMessage.SenderId;
            var otherUser = await db.Users.FindAsync(otherUserId);
            if (otherUser != null)
            {
                result.Add(new ConversationDto(
                    item.Id,
                    item.Title,
                    item.ImageUrl,
                    otherUser.Name,
                    otherUser.AvatarUrl,
                    conv.LastMessage.Content,
                    conv.LastMessage.CreatedAt,
                    conv.UnreadCount));
            }
        }

        return Ok(result.OrderByDescending(c => c.LastMessageTime));
    }

    [HttpGet("{itemId:guid}")]
    public async Task<ActionResult<IEnumerable<MessageDto>>> GetMessages(Guid itemId)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var item = await db.TechItems
            .Select(i => new { i.Id, i.OwnerId })
            .FirstOrDefaultAsync(i => i.Id == itemId);

        if (item is null)
            return NotFound(new { message = "Item not found." });

        var messages = await db.Messages
            .Include(m => m.Sender)
            .Include(m => m.Receiver)
            .Where(m =>
                (m.ItemId == itemId ||
                 (m.ItemId == null &&
                  ((m.SenderId == userId && m.ReceiverId == item.OwnerId) ||
                   (m.SenderId == item.OwnerId && m.ReceiverId == userId)))))
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();

        // Mark as read
        var unreadMessages = messages.Where(m => m.ReceiverId == userId && !m.IsRead).ToList();
        foreach (var msg in unreadMessages)
            msg.IsRead = true;
        if (unreadMessages.Count > 0)
            await db.SaveChangesAsync();

        return Ok(messages.Select(MapToDto));
    }

    [HttpPost]
    public async Task<ActionResult<MessageDto>> SendMessage(SendMessageRequest request)
    {
        var senderId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (string.IsNullOrWhiteSpace(request.Content))
            return BadRequest(new { message = "Message cannot be empty." });

        var item = await db.TechItems
            .Include(i => i.Owner)
            .FirstOrDefaultAsync(i => i.Id == request.ItemId);
        if (item is null)
            return NotFound(new { message = "Item not found." });

        Guid receiverId;
        if (senderId == item.OwnerId)
        {
            var latestRentalRecipient = await db.Rentals
                .Where(r => r.ItemId == request.ItemId)
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => (Guid?)r.RenterId)
                .FirstOrDefaultAsync();

            var lastCounterparty = await db.Messages
                .Where(m => m.ItemId == request.ItemId && m.SenderId != senderId)
                .OrderByDescending(m => m.CreatedAt)
                .Select(m => (Guid?)m.SenderId)
                .FirstOrDefaultAsync();

            if (latestRentalRecipient is null && lastCounterparty is null)
                return BadRequest(new { message = "No recipient available for this item conversation." });

            receiverId = latestRentalRecipient ?? lastCounterparty!.Value;
        }
        else
        {
            receiverId = item.OwnerId;
        }

        var message = new Message
        {
            SenderId = senderId,
            ReceiverId = receiverId,
            Content = request.Content,
            IsRead = false,
            ItemId = request.ItemId
        };

        db.Messages.Add(message);
        await db.SaveChangesAsync();
        await db.Entry(message).Reference(m => m.Sender).LoadAsync();
        await db.Entry(message).Reference(m => m.Receiver).LoadAsync();

        var receiverTokens = await db.DevicePushTokens
            .Where(t => t.UserId == receiverId && t.Platform == "android")
            .Select(t => t.Token)
            .ToListAsync();

        if (receiverTokens.Count > 0)
        {
            var invalidTokens = await pushNotifications.SendChatMessageAsync(
                receiverTokens,
                senderId,
                message.Sender.Name,
                message.Content);

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

        return CreatedAtAction(nameof(GetMessages), new { itemId = request.ItemId }, MapToDto(message));
    }

    private static MessageDto MapToDto(Message m) => new(
        m.Id,
        m.Content,
        new UserDto(m.Sender.Id, m.Sender.Name, m.Sender.Email, m.Sender.AvatarUrl, m.Sender.Phone),
        new UserDto(m.Receiver.Id, m.Receiver.Name, m.Receiver.Email, m.Receiver.AvatarUrl, m.Receiver.Phone),
        m.CreatedAt,
        m.IsRead,
        m.ItemId,
        m.RentalId,
        m.MessageType);
}
