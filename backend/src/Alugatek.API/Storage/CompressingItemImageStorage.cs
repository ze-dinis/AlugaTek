using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;

namespace Alugatek.API.Storage;

public sealed class CompressingItemImageStorage(IItemImageStorage inner) : IItemImageStorage
{
    private const int MaxDimension = 1200;
    private const int JpegQuality = 70;

    public async Task<string> SaveAsync(IFormFile photo, CancellationToken cancellationToken = default)
    {
        using var image = await Image.LoadAsync(photo.OpenReadStream(), cancellationToken);

        if (image.Width > MaxDimension || image.Height > MaxDimension)
            image.Mutate(x => x.Resize(new ResizeOptions
            {
                Size = new Size(MaxDimension, MaxDimension),
                Mode = ResizeMode.Max
            }));

        await using var ms = new MemoryStream();
        await image.SaveAsJpegAsync(ms, new JpegEncoder { Quality = JpegQuality }, cancellationToken);
        ms.Position = 0;

        var compressed = new FormFile(ms, 0, ms.Length, photo.Name, Path.ChangeExtension(photo.FileName, ".jpg"))
        {
            Headers = photo.Headers,
            ContentType = "image/jpeg"
        };

        return await inner.SaveAsync(compressed, cancellationToken);
    }
}
