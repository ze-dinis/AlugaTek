using System.Security.Claims;
using Alugatek.API.DTOs;
using Alugatek.API.Services;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Data;
using Alugatek.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Alugatek.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    AppDbContext db,
    JwtService jwt,
    EmailVerificationService emailVerification,
    IOptions<EmailVerificationOptions> emailVerificationOptions,
    IWebHostEnvironment environment,
    ILogger<AuthController> logger) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<RegisterResponse>> Register(RegisterRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);
        var isNewUser = false;

        if (user is not null && user.EmailVerified)
            return Conflict(new { message = "Email já está em uso." });

        if (user is null)
        {
            user = new User
            {
                Name = request.Name,
                Email = normalizedEmail,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                EmailVerified = false
            };

            db.Users.Add(user);
            isNewUser = true;
        }
        else
        {
            // Reuse an existing pending account so users can retry registration.
            user.Name = request.Name;
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
            user.EmailVerified = false;
            user.EmailVerifiedAt = null;
        }

        await db.SaveChangesAsync();

        if (!emailVerificationOptions.Value.Enabled && environment.IsDevelopment())
        {
            // Dev/local fallback: when verification is disabled, immediately mark account as verified.
            user.EmailVerified = true;
            user.EmailVerifiedAt = DateTime.UtcNow;
            user.EmailVerificationTokenHash = null;
            user.EmailVerificationTokenExpiresAt = null;
            await db.SaveChangesAsync();

            return Ok(new RegisterResponse("Conta criada. Já pode iniciar sessão."));
        }

        var token = emailVerification.GenerateToken(user);
        await db.SaveChangesAsync();

        try
        {
            await emailVerification.SendVerificationEmailAsync(user, token);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogError(ex, "Email verification configuration is invalid while registering {Email}.", normalizedEmail);
            if (isNewUser)
            {
                db.Users.Remove(user);
                await db.SaveChangesAsync();
            }
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "A verificação de email não está configurada no servidor." });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Email verification delivery failed while registering {Email}.", normalizedEmail);
            if (isNewUser)
            {
                db.Users.Remove(user);
                await db.SaveChangesAsync();
            }
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Não foi possível enviar o email de verificação. Por favor, tente novamente." });
        }

        return Ok(new RegisterResponse("Conta criada. Verifique o seu email antes de iniciar sessão."));
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponse>> Login(LoginRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);
        if (user is null || user.PasswordHash is null ||
            !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return Unauthorized(new { message = "Credenciais inválidas." });

        if (!user.EmailVerified)
            return StatusCode(StatusCodes.Status403Forbidden, new { message = "Email não verificado. Verifique a sua caixa de entrada antes de iniciar sessão." });

        if (RefreshExpiredBan(user))
            await db.SaveChangesAsync();

        var banMessage = GetBanMessage(user);
        if (banMessage is not null)
            return StatusCode(StatusCodes.Status403Forbidden, new { message = banMessage });

        return Ok(await BuildAuthResponseAsync(user));
    }

    [HttpGet("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromQuery] string email, [FromQuery] string token)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);
        if (user is null)
            return BadRequest(new { message = "Link de verificação inválido." });

        if (!emailVerification.TryVerify(user, token))
            return BadRequest(new { message = "Token de verificação inválido ou expirado." });

        await db.SaveChangesAsync();
        return Ok(new { message = "Email verificado. Já pode iniciar sessão." });
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);
        if (user is null)
            return BadRequest(new { message = "Pedido de verificação inválido." });

        if (!emailVerification.TryVerify(user, request.Token))
            return BadRequest(new { message = "Token de verificação inválido ou expirado." });

        await db.SaveChangesAsync();
        return Ok(new { message = "Email verificado. Já pode iniciar sessão." });
    }

    [HttpPost("resend-verification")]
    public async Task<IActionResult> ResendVerificationEmail([FromBody] ResendVerificationEmailRequest request)
    {
        if (!emailVerificationOptions.Value.Enabled && environment.IsDevelopment())
            return Ok(new { message = "A verificação de email está desativada no servidor." });

        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);

        if (user is null || user.EmailVerified)
            return Ok(new { message = "Se a conta existir e não estiver verificada, foi enviado um novo email de verificação." });

        var token = emailVerification.GenerateToken(user);
        await db.SaveChangesAsync();
        try
        {
            await emailVerification.SendVerificationEmailAsync(user, token);
        }
        catch (InvalidOperationException ex)
        {
            logger.LogError(ex, "Email verification configuration is invalid while resending for {Email}.", normalizedEmail);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "A verificação de email não está configurada no servidor." });
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Email verification delivery failed while resending for {Email}.", normalizedEmail);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new { message = "Não foi possível enviar o email de verificação. Por favor, tente novamente." });
        }

        return Ok(new { message = "Se a conta existir e não estiver verificada, foi enviado um novo email de verificação." });
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
            return Unauthorized(new { message = "Token Google inválido." });

        var payload = await response.Content.ReadFromJsonAsync<GoogleTokenInfo>();
        if (payload is null) return Unauthorized();

        var normalizedEmail = payload.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedEmail))
            return Unauthorized(new { message = "A conta Google não forneceu um email." });

        var user = await db.Users.SingleOrDefaultAsync(u =>
            u.OAuthProvider == "Google" && u.OAuthSubject == payload.Sub);

        if (user is null)
        {
            // If the user already exists with the same email (e.g. password account),
            // link the existing account instead of violating the unique email index.
            user = await db.Users.SingleOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);

            if (user is null)
            {
                user = new User
                {
                    Name = payload.Name ?? normalizedEmail,
                    Email = normalizedEmail,
                    EmailVerified = true,
                    EmailVerifiedAt = DateTime.UtcNow,
                    OAuthProvider = "Google",
                    OAuthSubject = payload.Sub,
                    AvatarUrl = payload.Picture
                };
                db.Users.Add(user);
                await db.SaveChangesAsync();
            }
            else
            {
                user.EmailVerified = true;
                user.EmailVerifiedAt ??= DateTime.UtcNow;
                user.EmailVerificationTokenHash = null;
                user.EmailVerificationTokenExpiresAt = null;
                user.OAuthProvider = "Google";
                user.OAuthSubject = payload.Sub;
                if (!string.IsNullOrWhiteSpace(payload.Picture))
                    user.AvatarUrl = payload.Picture;

                await db.SaveChangesAsync();
            }
        }

        if (RefreshExpiredBan(user))
            await db.SaveChangesAsync();

        var banMessage = GetBanMessage(user);
        if (banMessage is not null)
            return StatusCode(StatusCodes.Status403Forbidden, new { message = banMessage });

        return Ok(await BuildAuthResponseAsync(user));
    }
    // Exchanges a valid refresh token for a new access token, rotating the refresh
    // token so a stolen one can only ever be used once.
    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponse>> Refresh([FromBody] RefreshTokenRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return Unauthorized(new { message = "Sessão expirada. Inicie sessão novamente." });

        var hash = JwtService.HashRefreshToken(request.RefreshToken);
        var stored = await db.RefreshTokens
            .Include(t => t.User)
            .SingleOrDefaultAsync(t => t.TokenHash == hash);

        if (stored is null)
            return Unauthorized(new { message = "Sessão expirada. Inicie sessão novamente." });

        // Replaying an already-rotated token means it leaked: kill every session for that user.
        if (stored.RevokedAt is not null)
        {
            logger.LogWarning("Refresh token reuse detected for user {UserId}.", stored.UserId);
            await RevokeAllTokensForUserAsync(stored.UserId);
            return Unauthorized(new { message = "Sessão expirada. Inicie sessão novamente." });
        }

        if (stored.ExpiresAt <= DateTime.UtcNow)
            return Unauthorized(new { message = "Sessão expirada. Inicie sessão novamente." });

        var user = stored.User;
        if (user is null)
            return Unauthorized(new { message = "Sessão expirada. Inicie sessão novamente." });

        if (RefreshExpiredBan(user))
            await db.SaveChangesAsync();

        var banMessage = GetBanMessage(user);
        if (banMessage is not null)
        {
            await RevokeAllTokensForUserAsync(user.Id);
            return StatusCode(StatusCodes.Status403Forbidden, new { message = banMessage });
        }

        var response = await BuildAuthResponseAsync(user);

        stored.RevokedAt = DateTime.UtcNow;
        stored.ReplacedByTokenHash = JwtService.HashRefreshToken(response.RefreshToken!);
        await db.SaveChangesAsync();

        return Ok(response);
    }

    // Best-effort sign out: revokes the refresh token so it cannot be reused.
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshTokenRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.RefreshToken))
        {
            var hash = JwtService.HashRefreshToken(request.RefreshToken);
            var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash);

            if (stored is not null && stored.RevokedAt is null)
            {
                stored.RevokedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
        }

        return Ok(new { message = "Sessão terminada." });
    }

    private async Task RevokeAllTokensForUserAsync(Guid userId)
    {
        var active = await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync();

        if (active.Count == 0)
            return;

        var now = DateTime.UtcNow;
        foreach (var token in active)
            token.RevokedAt = now;

        await db.SaveChangesAsync();
    }

    private async Task<AuthResponse> BuildAuthResponseAsync(User user)
    {
        var reviewQuery = db.RentalReviews.Where(r => r.RevieweeId == user.Id);
        var reviewCount = await reviewQuery.CountAsync();
        var averageRating = reviewCount > 0
            ? await reviewQuery.AverageAsync(r => (double?)r.Rating)
            : null;

        var refreshToken = JwtService.GenerateRefreshToken();
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = JwtService.HashRefreshToken(refreshToken),
            ExpiresAt = DateTime.UtcNow.Add(JwtService.RefreshTokenLifetime),
        });
        await db.SaveChangesAsync();

        return new AuthResponse(
            jwt.GenerateToken(user),
            new UserDto(user.Id, user.Name, user.Email, user.AvatarUrl, user.Phone, averageRating, reviewCount),
            refreshToken);
    }

    private static bool RefreshExpiredBan(User user)
    {
        if (!user.IsBanned || user.BannedUntil is null || user.BannedUntil > DateTime.UtcNow)
            return false;

        user.IsBanned = false;
        user.BannedAt = null;
        user.BannedUntil = null;
        user.BanReason = null;
        return true;
    }

    private static string? GetBanMessage(User user)
    {
        if (!user.IsBanned)
            return null;

        if (user.BannedUntil is not null)
            return $"Conta suspensa até {user.BannedUntil.Value:yyyy-MM-dd HH:mm} UTC.";

        return "Conta suspensa. Contacte o suporte.";
    }

    private record GoogleTokenInfo(string Sub, string Email, string? Name, string? Picture);
}
