using System.Text;
using Alugatek.API.Storage;
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

var builder = WebApplication.CreateBuilder(args);

// Database
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

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

builder.Services.AddAuthorization();
builder.Services.AddScoped<JwtService>();
builder.Services.AddControllers();

builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
builder.Services.AddScoped<LocalItemImageStorage>();
builder.Services.AddScoped<S3ItemImageStorage>();
builder.Services.AddScoped<IItemImageStorage>(sp =>
{
    var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value;
    if (string.Equals(options.Provider, "S3", StringComparison.OrdinalIgnoreCase))
        return sp.GetRequiredService<S3ItemImageStorage>();

    return sp.GetRequiredService<LocalItemImageStorage>();
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
    dbContext.Database.Migrate();
}

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

