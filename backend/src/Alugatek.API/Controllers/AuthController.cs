using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(AppDbContext db, JwtService jwt) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponse>> Register(RegisterRequest request)
    {
        if (await db.Users.AnyAsync(u => u.Email == request.Email))
            return Conflict(new { message = "Email already in use." });

        var user = new User
        {
            Name = request.Name,
            Email = request.Email,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password)
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return Ok(BuildAuthResponse(user));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email == request.Email);
        if (user is null || user.PasswordHash is null ||
            !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Invalid credentials." });

        return Ok(BuildAuthResponse(user));
    }

    // OAuth callback — frontend exchanges Google ID token for an app JWT
    [HttpPost("oauth/google")]
    public async Task<ActionResult<AuthResponse>> GoogleOAuth([FromBody] string idToken)
    {
        // Validate Google ID token using Google's tokeninfo endpoint
        using var http = new HttpClient();
        var response = await http.GetAsync(
            $"https://oauth2.googleapis.com/tokeninfo?id_token={idToken}");

        if (!response.IsSuccessStatusCode)
            return Unauthorized(new { message = "Invalid Google token." });

        var payload = await response.Content.ReadFromJsonAsync<GoogleTokenInfo>();
        if (payload is null) return Unauthorized();

        var user = await db.Users.SingleOrDefaultAsync(u =>
            u.OAuthProvider == "Google" && u.OAuthSubject == payload.Sub);

        if (user is null)
        {
            user = new User
            {
                Name = payload.Name ?? payload.Email,
                Email = payload.Email,
                OAuthProvider = "Google",
                OAuthSubject = payload.Sub,
                AvatarUrl = payload.Picture
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
        }

        return Ok(BuildAuthResponse(user));
    }

    private AuthResponse BuildAuthResponse(User user) =>
        new(jwt.GenerateToken(user),
            new UserDto(user.Id, user.Name, user.Email, user.AvatarUrl, user.Phone));

    private record GoogleTokenInfo(string Sub, string Email, string? Name, string? Picture);
}
