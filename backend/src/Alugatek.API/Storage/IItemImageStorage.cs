namespace Alugatek.API.Storage;

public interface IItemImageStorage
{
    Task<string> SaveAsync(IFormFile photo, CancellationToken cancellationToken = default);
}
