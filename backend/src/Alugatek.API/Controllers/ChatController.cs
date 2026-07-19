using System.Security.Claims;
using System.Text.Json;
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
    private const int MaxMessageImages = 5;

    [HttpGet("conversations")]
    public async Task<ActionResult<IEnumerable<ConversationDto>>> GetConversations()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var conversations = await db.Messages
            .Where(m => m.ItemId != null && (m.SenderId == userId || m.ReceiverId == userId))
            .GroupBy(m => new
            {
                ItemId = m.ItemId!.Value,
                OtherUserId = m.SenderId == userId ? m.ReceiverId : m.SenderId,
            })
            .Select(g => new
            {
                ItemId = g.Key.ItemId,
                OtherUserId = g.Key.OtherUserId,
                LastMessage = g.OrderByDescending(m => m.CreatedAt).First(),
                UnreadCount = g.Count(m => m.ReceiverId == userId && !m.IsRead)
            })
            .ToListAsync();

        var itemIds = conversations.Select(c => c.ItemId).ToList();
        var otherUserIds = conversations.Select(c => c.OtherUserId).Distinct().ToList();

        var items = await db.TechItems
            .Include(i => i.Owner)
            .Where(i => itemIds.Contains(i.Id))
            .ToDictionaryAsync(i => i.Id);

        var users = await db.Users
            .Where(u => otherUserIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id);

        var result = new List<ConversationDto>();
        foreach (var conv in conversations)
        {
            if (!items.TryGetValue(conv.ItemId, out var item))
                continue;

            if (users.TryGetValue(conv.OtherUserId, out var otherUser))
            {
                result.Add(new ConversationDto(
                    item.Id,
                    item.Title,
                    item.ImageUrl,
                    otherUser.Id,
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
    public async Task<ActionResult<IEnumerable<MessageDto>>> GetMessages(Guid itemId, [FromQuery] Guid otherUserId)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var item = await db.TechItems
            .Select(i => new { i.Id, i.OwnerId })
            .FirstOrDefaultAsync(i => i.Id == itemId);

        if (item is null)
            return NotFound(new { message = "Item not found." });

        if (otherUserId == userId)
            return BadRequest(new { message = "Invalid conversation user." });

        var messages = await db.Messages
            .Include(m => m.Sender)
            .Include(m => m.Receiver)
            .Where(m =>
                ((m.SenderId == userId && m.ReceiverId == otherUserId) ||
                 (m.SenderId == otherUserId && m.ReceiverId == userId)) &&
                (m.ItemId == itemId ||
                 (m.ItemId == null &&
                  m.RentalId != null &&
                  db.Rentals.Any(r => r.Id == m.RentalId && r.ItemId == itemId))))
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

        var normalizedImageUrls = NormalizeImageUrls(request.ImageUrls);

        if (string.IsNullOrWhiteSpace(request.Content) && normalizedImageUrls.Count == 0)
            return BadRequest(new { message = "Message cannot be empty." });

        var item = await db.TechItems
            .Include(i => i.Owner)
            .FirstOrDefaultAsync(i => i.Id == request.ItemId);
        if (item is null)
            return NotFound(new { message = "Item not found." });

        Guid receiverId;
        if (senderId == item.OwnerId)
        {
            if (request.ReceiverId is Guid explicitReceiverId)
            {
                if (explicitReceiverId == senderId)
                    return BadRequest(new { message = "Invalid recipient." });

                receiverId = explicitReceiverId;
            }
            else
            {
                var lastCounterparty = await db.Messages
                    .Where(m => m.ItemId == request.ItemId && m.ReceiverId == senderId && m.SenderId != senderId)
                    .OrderByDescending(m => m.CreatedAt)
                    .Select(m => (Guid?)m.SenderId)
                    .FirstOrDefaultAsync();

                var latestRentalRecipient = await db.Rentals
                    .Where(r => r.ItemId == request.ItemId)
                    .OrderByDescending(r => r.CreatedAt)
                    .Select(r => (Guid?)r.RenterId)
                    .FirstOrDefaultAsync();

                if (latestRentalRecipient is null && lastCounterparty is null)
                    return BadRequest(new { message = "No recipient available for this item conversation." });

                receiverId = lastCounterparty ?? latestRentalRecipient!.Value;
            }
        }
        else
        {
            receiverId = item.OwnerId;
        }

        var message = new Message
        {
            SenderId = senderId,
            ReceiverId = receiverId,
            Content = string.IsNullOrWhiteSpace(request.Content)
                ? "📷 Foto"
                : request.Content.Trim(),
            ImageUrlsJson = normalizedImageUrls.Count > 0 ? JsonSerializer.Serialize(normalizedImageUrls) : null,
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
                request.ItemId,
                item.Title,
                message.Content,
                message.ImageUrlsJson is null ? Array.Empty<string>() : normalizedImageUrls);

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
        ParseImageUrls(m.ImageUrlsJson),
        new UserDto(m.Sender.Id, m.Sender.Name, m.Sender.Email, m.Sender.AvatarUrl, m.Sender.Phone),
        new UserDto(m.Receiver.Id, m.Receiver.Name, m.Receiver.Email, m.Receiver.AvatarUrl, m.Receiver.Phone),
        m.CreatedAt,
        m.IsRead,
        m.ItemId,
        m.RentalId,
        m.MessageType);

    private static IReadOnlyList<string> NormalizeImageUrls(IReadOnlyList<string>? imageUrls)
    {
        if (imageUrls is null || imageUrls.Count == 0)
            return [];

        return imageUrls
            .Where(url => !string.IsNullOrWhiteSpace(url))
            .Select(url => url.Trim())
            .Distinct(StringComparer.Ordinal)
            .Take(MaxMessageImages)
            .ToList();
    }

    private static IReadOnlyList<string> ParseImageUrls(string? imageUrlsJson)
    {
        if (string.IsNullOrWhiteSpace(imageUrlsJson))
            return [];

        try
        {
            return JsonSerializer.Deserialize<List<string>>(imageUrlsJson)?
                .Where(url => !string.IsNullOrWhiteSpace(url))
                .Select(url => url.Trim())
                .Distinct(StringComparer.Ordinal)
                .Take(MaxMessageImages)
                .ToList() ?? [];
        }
        catch
        {
            return [];
        }
    }
}
