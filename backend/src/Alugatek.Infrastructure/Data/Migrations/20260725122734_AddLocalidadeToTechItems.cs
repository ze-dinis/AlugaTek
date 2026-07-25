using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddLocalidadeToTechItems : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Localidade",
                table: "TechItems",
                type: "text",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Localidade",
                table: "TechItems");
        }
    }
}
