using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDistrictToTechItemsRequired : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "District",
                table: "TechItems",
                type: "text",
                maxLength: 100,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "District",
                table: "TechItems");
        }
    }
}
