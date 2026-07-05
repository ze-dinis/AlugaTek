namespace Alugatek.API.Storage;

public class StorageOptions
{
    public string Provider { get; set; } = "Local";
    public string? S3Bucket { get; set; }
    public string? S3Region { get; set; }
    public string? S3PublicBaseUrl { get; set; }
    public string? S3ServiceUrl { get; set; }
    public bool S3ForcePathStyle { get; set; }
    public string? AwsAccessKeyId { get; set; }
    public string? AwsSecretAccessKey { get; set; }
}
