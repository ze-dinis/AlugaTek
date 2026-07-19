using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddImageUrlsJsonToTechItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ImageUrlsJson",
                table: "TechItems",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ImageUrlsJson",
                table: "TechItems");
        }
    }
}
