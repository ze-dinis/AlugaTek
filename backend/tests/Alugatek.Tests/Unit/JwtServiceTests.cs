using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Alugatek.Domain.Entities;
using Alugatek.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace Alugatek.Tests.Unit;

public class JwtServiceTests
{
    private const string SigningKey = "alugatek-test-signing-key-that-is-long-enough-1234567890";
    private const string Issuer = "alugatek-tests";
    private const string Audience = "alugatek-clients";

    private static JwtService CreateService() =>
        new(new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Key"] = SigningKey,
                ["Jwt:Issuer"] = Issuer,
                ["Jwt:Audience"] = Audience
            })
            .Build());

    private static User CreateUser(string role = User.RoleUser) => new()
    {
        Id = Guid.NewGuid(),
        Name = "Ana Silva",
        Email = "ana@example.com",
        Role = role
    };

    [Fact]
    public void GenerateToken_EmbedsUserIdentityClaims()
    {
        var user = CreateUser();

        var token = new JwtSecurityTokenHandler().ReadJwtToken(CreateService().GenerateToken(user));

        Assert.Equal(user.Id.ToString(), token.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(user.Id.ToString(), token.Claims.Single(c => c.Type == ClaimTypes.NameIdentifier).Value);
        Assert.Equal(user.Email, token.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Equal(user.Name, token.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Name).Value);
    }

    [Theory]
    [InlineData(User.RoleUser)]
    [InlineData(User.RoleSupport)]
    [InlineData(User.RoleAdmin)]
    public void GenerateToken_EmbedsTheUserRole(string role)
    {
        var token = new JwtSecurityTokenHandler().ReadJwtToken(CreateService().GenerateToken(CreateUser(role)));

        Assert.Equal(role, token.Claims.Single(c => c.Type == ClaimTypes.Role).Value);
    }

    [Fact]
    public void GenerateToken_UsesConfiguredIssuerAudienceAndSevenDayExpiry()
    {
        var token = new JwtSecurityTokenHandler().ReadJwtToken(CreateService().GenerateToken(CreateUser()));

        Assert.Equal(Issuer, token.Issuer);
        Assert.Equal(Audience, Assert.Single(token.Audiences));
        Assert.InRange(token.ValidTo, DateTime.UtcNow.AddDays(7).AddMinutes(-2), DateTime.UtcNow.AddDays(7).AddMinutes(2));
    }

    [Fact]
    public void GenerateToken_ProducesTokenThatValidatesAgainstTheConfiguredKey()
    {
        var user = CreateUser();
        var jwt = CreateService().GenerateToken(user);

        var principal = new JwtSecurityTokenHandler().ValidateToken(jwt, new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = Issuer,
            ValidAudience = Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SigningKey))
        }, out _);

        Assert.Equal(user.Id.ToString(), principal.FindFirstValue(ClaimTypes.NameIdentifier));
    }

    [Fact]
    public void GenerateToken_RejectsValidationWithADifferentKey()
    {
        var jwt = CreateService().GenerateToken(CreateUser());

        Assert.ThrowsAny<SecurityTokenException>(() =>
            new JwtSecurityTokenHandler().ValidateToken(jwt, new TokenValidationParameters
            {
                ValidateIssuer = false,
                ValidateAudience = false,
                ValidateLifetime = false,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes("a-completely-different-signing-key-0987654321"))
            }, out _));
    }

    [Fact]
    public void GenerateToken_IssuesAUniqueJtiPerToken()
    {
        var service = CreateService();
        var user = CreateUser();
        var handler = new JwtSecurityTokenHandler();

        var first = handler.ReadJwtToken(service.GenerateToken(user));
        var second = handler.ReadJwtToken(service.GenerateToken(user));

        Assert.NotEqual(
            first.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Jti).Value,
            second.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Jti).Value);
    }
}
