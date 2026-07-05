using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatController(AppDbContext db) : ControllerBase
{
    [HttpGet("conversations")]
    public async Task<ActionResult<IEnumerable<ConversationDto>>> GetConversations()
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var conversations = await db.Messages
            .Where(m => m.SenderId == userId || m.ReceiverId == userId)
            .GroupBy(m => m.SenderId == userId ? m.ReceiverId : m.SenderId)
            .Select(g => new
            {
                OtherId = g.Key,
                LastMessage = g.OrderByDescending(m => m.CreatedAt).First(),
                UnreadCount = g.Count(m => m.ReceiverId == userId && !m.IsRead)
            })
            .ToListAsync();

        var result = new List<ConversationDto>();
        foreach (var conv in conversations)
        {
            var otherUser = await db.Users.FindAsync(conv.OtherId);
            if (otherUser != null)
            {
                result.Add(new ConversationDto(
                    conv.OtherId,
                    otherUser.Name,
                    otherUser.AvatarUrl,
                    conv.LastMessage.Content,
                    conv.LastMessage.CreatedAt,
                    conv.UnreadCount));
            }
        }

        return Ok(result.OrderByDescending(c => c.LastMessageTime));
    }

    [HttpGet("{otherId:guid}")]
    public async Task<ActionResult<IEnumerable<MessageDto>>> GetMessages(Guid otherId)
    {
        var userId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var messages = await db.Messages
            .Include(m => m.Sender)
            .Include(m => m.Receiver)
            .Where(m => (m.SenderId == userId && m.ReceiverId == otherId) ||
                        (m.SenderId == otherId && m.ReceiverId == userId))
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

        var receiver = await db.Users.FindAsync(request.ReceiverId);
        if (receiver is null)
            return NotFound(new { message = "Recipient not found." });

        var message = new Message
        {
            SenderId = senderId,
            ReceiverId = request.ReceiverId,
            Content = request.Content,
            IsRead = false
        };

        db.Messages.Add(message);
        await db.SaveChangesAsync();
        await db.Entry(message).Reference(m => m.Sender).LoadAsync();
        await db.Entry(message).Reference(m => m.Receiver).LoadAsync();

        return CreatedAtAction(nameof(GetMessages), new { otherId = request.ReceiverId }, MapToDto(message));
    }

    private static MessageDto MapToDto(Message m) => new(
        m.Id,
        m.Content,
        new UserDto(m.Sender.Id, m.Sender.Name, m.Sender.Email, m.Sender.AvatarUrl, m.Sender.Phone),
        new UserDto(m.Receiver.Id, m.Receiver.Name, m.Receiver.Email, m.Receiver.AvatarUrl, m.Receiver.Phone),
        m.CreatedAt,
        m.IsRead);
}
