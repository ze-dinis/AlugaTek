using System.Text;
using Alugatek.API.Storage;
using Alugatek.API.Services;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Alugatek.Infrastructure.Data;
using Alugatek.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.FileProviders;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var connectionString = ResolveConnectionString(builder.Configuration);

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// JWT auth
var jwtKey = builder.Configuration["Jwt:Key"]!;
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SupportAccess", policy =>
        policy.RequireRole(Alugatek.Domain.Entities.User.RoleSupport, Alugatek.Domain.Entities.User.RoleAdmin));

    options.AddPolicy("AdminOnly", policy =>
        policy.RequireRole(Alugatek.Domain.Entities.User.RoleAdmin));
});
builder.Services.AddScoped<JwtService>();
builder.Services.AddControllers();
builder.Services.Configure<PushNotificationOptions>(builder.Configuration.GetSection("PushNotifications"));
builder.Services.AddSingleton<IPushNotificationService, FirebasePushNotificationService>();
builder.Services.Configure<EmailVerificationOptions>(builder.Configuration.GetSection("EmailVerification"));
builder.Services.AddScoped<EmailVerificationService>();

builder.Services.Configure<StripeOptions>(builder.Configuration.GetSection("Stripe"));
builder.Services.AddScoped<IPaymentService, StripePaymentService>();
builder.Services.AddHostedService<ExpiringHoldCaptureService>();

builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.AddScoped<LocalItemImageStorage>();
builder.Services.AddScoped<S3ItemImageStorage>();
builder.Services.AddScoped<IItemImageStorage>(sp =>
{
    var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value;
    IItemImageStorage inner = string.Equals(options.Provider, "S3", StringComparison.OrdinalIgnoreCase)
        ? sp.GetRequiredService<S3ItemImageStorage>()
        : sp.GetRequiredService<LocalItemImageStorage>();

    return new CompressingItemImageStorage(inner);
});

builder.Services.AddSingleton<IAmazonS3>(sp =>
{
    var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value;
    var regionName = string.IsNullOrWhiteSpace(options.S3Region) ? "eu-west-1" : options.S3Region;
    var region = RegionEndpoint.GetBySystemName(regionName);
    var config = new AmazonS3Config
    {
        RegionEndpoint = region,
        ForcePathStyle = options.S3ForcePathStyle
    };

    if (!string.IsNullOrWhiteSpace(options.S3ServiceUrl))
    {
        config.ServiceURL = options.S3ServiceUrl;
        config.AuthenticationRegion = region.SystemName;
    }

    if (!string.IsNullOrWhiteSpace(options.AwsAccessKeyId) &&
        !string.IsNullOrWhiteSpace(options.AwsSecretAccessKey))
    {
        var credentials = new BasicAWSCredentials(options.AwsAccessKeyId, options.AwsSecretAccessKey);
        return new AmazonS3Client(credentials, config);
    }

    return new AmazonS3Client(config);
});

// CORS — allow the mobile app / web client
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Alugatek API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Description = "Enter: Bearer {token}",
        Name = "Authorization",
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            []
        }
    });
});

var app = builder.Build();

// Auto-migrate on startup
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var migrationLogger = scope.ServiceProvider
        .GetRequiredService<ILoggerFactory>()
        .CreateLogger("StartupMigration");

    const int maxMigrationAttempts = 12;
    for (var attempt = 1; attempt <= maxMigrationAttempts; attempt++)
    {
        try
        {
            dbContext.Database.Migrate();
            migrationLogger.LogInformation("Database migration completed on attempt {Attempt}.", attempt);
            break;
        }
        catch (Exception ex) when (attempt < maxMigrationAttempts)
        {
            migrationLogger.LogWarning(
                ex,
                "Database migration attempt {Attempt}/{MaxAttempts} failed. Retrying in 5 seconds.",
                attempt,
                maxMigrationAttempts);

            await Task.Delay(TimeSpan.FromSeconds(5));
        }
    }
}

// Eagerly initialize push notifications so its status is logged at startup.
_ = app.Services.GetRequiredService<Alugatek.API.Services.IPushNotificationService>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var webRootPath = app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot");
Directory.CreateDirectory(webRootPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(webRootPath)
});
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

static string ResolveConnectionString(IConfiguration configuration)
{
    var databaseUrl = Environment.GetEnvironmentVariable("DATABASE_URL");
    if (!string.IsNullOrWhiteSpace(databaseUrl))
    {
        return BuildConnectionStringFromDatabaseUrl(databaseUrl);
    }

    var pgHost = Environment.GetEnvironmentVariable("PGHOST");
    if (!string.IsNullOrWhiteSpace(pgHost))
    {
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = pgHost,
            Port = ParseIntOrDefault(Environment.GetEnvironmentVariable("PGPORT"), 5432),
            Database = Environment.GetEnvironmentVariable("PGDATABASE") ?? "postgres",
            Username = Environment.GetEnvironmentVariable("PGUSER") ?? "postgres",
            Password = Environment.GetEnvironmentVariable("PGPASSWORD") ?? string.Empty,
        };

        var sslMode = Environment.GetEnvironmentVariable("PGSSLMODE");
        if (!string.IsNullOrWhiteSpace(sslMode) && Enum.TryParse<SslMode>(sslMode, true, out var parsedSslMode))
        {
            builder.SslMode = parsedSslMode;
        }

        return builder.ConnectionString;
    }

    return configuration.GetConnectionString("DefaultConnection")
           ?? throw new InvalidOperationException("No database connection string configured.");
}

static string BuildConnectionStringFromDatabaseUrl(string databaseUrl)
{
    var uri = new Uri(databaseUrl);
    var userInfo = uri.UserInfo.Split(':', 2);

    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Database = uri.AbsolutePath.Trim('/'),
        Username = Uri.UnescapeDataString(userInfo[0]),
        Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty,
    };

    var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
    var sslMode = query["sslmode"];
    if (!string.IsNullOrWhiteSpace(sslMode) && Enum.TryParse<SslMode>(sslMode, true, out var parsedSslMode))
    {
        builder.SslMode = parsedSslMode;
    }

    return builder.ConnectionString;
}

static int ParseIntOrDefault(string? value, int fallback)
{
    return int.TryParse(value, out var parsed) ? parsed : fallback;
}

