namespace Alugatek.API.Storage;

public class LocalItemImageStorage(IWebHostEnvironment env) : IItemImageStorage
{
    public async Task<string> SaveAsync(IFormFile photo, CancellationToken cancellationToken = default)
    {
        var webRootPath = env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot");
        Directory.CreateDirectory(webRootPath);

        var uploadDir = Path.Combine(webRootPath, "uploads", "items");
        Directory.CreateDirectory(uploadDir);

        var extension = Path.GetExtension(photo.FileName);
        var fileName = $"{Guid.NewGuid()}{extension}";
        var filePath = Path.Combine(uploadDir, fileName);

        await using var stream = System.IO.File.Create(filePath);
        await photo.CopyToAsync(stream, cancellationToken);

        return $"/uploads/items/{fileName}";
    }
}
