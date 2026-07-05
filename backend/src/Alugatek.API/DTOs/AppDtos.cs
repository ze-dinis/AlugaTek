namespace Alugatek.API.DTOs;

using Microsoft.AspNetCore.Http;

// Auth
public record RegisterRequest(string Name, string Email, string Password);
public record LoginRequest(string Email, string Password);
public record AuthResponse(string Token, UserDto User);

// User
public record UserDto(Guid Id, string Name, string Email, string? AvatarUrl, string? Phone);

// TechItem
public record CreateItemRequest(
    string Title,
    string Description,
    decimal DailyRate,
    string? ImageUrl,
    int CategoryId);

public class CreateItemWithPhotoRequest
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal DailyRate { get; set; }
    public string? ImageUrl { get; set; }
    public int CategoryId { get; set; }
    public IFormFile? Photo { get; set; }
}

public record UpdateItemRequest(
    string Title,
    string Description,
    decimal DailyRate,
    string? ImageUrl,
    bool IsAvailable);

public record TechItemDto(
    Guid Id,
    string Title,
    string Description,
    decimal DailyRate,
    string? ImageUrl,
    bool IsAvailable,
    string CategoryName,
    UserDto Owner,
    double? AverageRating,
    DateTime CreatedAt);

// Rental
public record CreateRentalRequest(Guid ItemId, DateTime StartDate, DateTime EndDate);

public record RentalDto(
    Guid Id,
    TechItemDto Item,
    UserDto Renter,
    DateTime StartDate,
    DateTime EndDate,
    decimal TotalPrice,
    string Status,
    DateTime CreatedAt);

// Review
public record CreateReviewRequest(Guid ItemId, int Rating, string Comment);

public record ReviewDto(
    Guid Id,
    int Rating,
    string Comment,
    UserDto Author,
    DateTime CreatedAt);
