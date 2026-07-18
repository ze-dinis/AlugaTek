namespace Alugatek.API.DTOs;

using Microsoft.AspNetCore.Http;

// Auth
public record RegisterRequest(string Name, string Email, string Password);
public record RegisterResponse(string Message);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string Token, UserDto User);
public record VerifyEmailRequest(string Email, string Token);
public record ResendVerificationEmailRequest(string Email);
public record SupportAuthResponse(string Token, string Name, string Role);

// User
public record UserDto(Guid Id, string Name, string Email, string? AvatarUrl, string? Phone);

// TechItem
public record CreateItemRequest(
    string Title,
    string Description,
    string District,
    decimal DailyRate,
    decimal Caucao,
    string? ImageUrl,
    int CategoryId);

public class CreateItemWithPhotoRequest
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string District { get; set; } = string.Empty;
    public decimal DailyRate { get; set; }
    public decimal Caucao { get; set; } = 0;
    public string? ImageUrl { get; set; }
    public int CategoryId { get; set; }
    public IFormFile? Photo { get; set; }
}

public record UpdateItemRequest(
    string Title,
    string Description,
    string District,
    decimal DailyRate,
    decimal Caucao,
    string? ImageUrl,
    bool IsAvailable);

public record TechItemDto(
    Guid Id,
    string Title,
    string Description,
    string District,
    decimal DailyRate,
    decimal Caucao,
    string? ImageUrl,
    bool IsAvailable,
    string CategoryName,
    UserDto Owner,
    double? AverageRating,
    DateTime CreatedAt);

// Rental
public record CreateRentalRequest(Guid ItemId, DateTime StartDate, DateTime EndDate);
public record ConfirmRentalRequest(string? PaymentDescription);

// Payment — the client confirms a card on the Stripe SDK and sends the resulting
// PaymentMethod id so the server can place an extended authorization hold.
public record PayRentalRequest(string PaymentMethodId, string? PaymentDescription);

public record RenewRentalRequest(int ExtraDays, string PaymentMethodId, string? PaymentDescription);
public record OpenDisputeRequest(string Reason, string Description);

public record RenewQuoteDto(decimal AdditionalAmount, decimal PlatformCommission, decimal TotalCharge);

public record RentalDto(
    Guid Id,
    TechItemDto Item,
    UserDto Renter,
    DateTime StartDate,
    DateTime EndDate,
    decimal TotalPrice,
    decimal CaucaoAmount,
    string Status,
    DateTime CreatedAt,
    string PaymentStatus,
    string CaucaoPaymentStatus,
    DateTime? CaptureBefore,
    string? ExtendedAuthorizationStatus,
    DateTime? PaymentDeadline);

// Review
public record CreateReviewRequest(Guid ItemId, int Rating, string Comment);

public record ReviewDto(
    Guid Id,
    int Rating,
    string Comment,
    UserDto Author,
    DateTime CreatedAt);

// Message
public record SendMessageRequest(Guid ItemId, string Content, Guid? ReceiverId);

public record MessageDto(
    Guid Id,
    string Content,
    UserDto Sender,
    UserDto Receiver,
    DateTime CreatedAt,
    bool IsRead,
    Guid? ItemId,
    Guid? RentalId,
    string MessageType);

public record ConversationDto(
    Guid ItemId,
    string ItemTitle,
    string? ItemImageUrl,
    Guid OtherUserId,
    string OtherName,
    string? OtherAvatarUrl,
    string LastMessage,
    DateTime LastMessageTime,
    int UnreadCount);

// Push notifications
public record RegisterDeviceTokenRequest(string Token, string Platform);
public record UnregisterDeviceTokenRequest(string Token);

// Support moderation
public record BanUserRequest(string Reason, int? DurationDays);
public record BanUserByEmailRequest(string Email, string Reason, int? DurationDays);

// User reports
public record CreateReportRequest(Guid ReportedUserId, Guid ItemId, string Reason);

