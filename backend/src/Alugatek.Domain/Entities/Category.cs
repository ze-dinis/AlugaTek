namespace Alugatek.Domain.Entities;

public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? IconUrl { get; set; }

    public ICollection<TechItem> Items { get; set; } = [];
}
