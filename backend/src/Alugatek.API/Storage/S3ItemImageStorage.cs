using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace Alugatek.API.Storage;

public class S3ItemImageStorage(IAmazonS3 s3, IOptions<StorageOptions> options) : IItemImageStorage
{
    private readonly StorageOptions _options = options.Value;

    public async Task<string> SaveAsync(IFormFile photo, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.S3Bucket))
            throw new InvalidOperationException("Storage:S3Bucket must be configured when using S3 storage.");

        var extension = Path.GetExtension(photo.FileName);
        var key = $"uploads/items/{Guid.NewGuid()}{extension}";

        await using var stream = photo.OpenReadStream();

        var putRequest = new PutObjectRequest
        {
            BucketName = _options.S3Bucket,
            Key = key,
            InputStream = stream,
            ContentType = photo.ContentType
        };

        await s3.PutObjectAsync(putRequest, cancellationToken);

        if (!string.IsNullOrWhiteSpace(_options.S3PublicBaseUrl))
            return $"{_options.S3PublicBaseUrl.TrimEnd('/')}/{key}";

        return $"https://{_options.S3Bucket}.s3.{_options.S3Region}.amazonaws.com/{key}";
    }
}
