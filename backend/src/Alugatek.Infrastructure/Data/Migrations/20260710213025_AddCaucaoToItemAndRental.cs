using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCaucaoToItemAndRental : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Caucao",
                table: "TechItems",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "CaucaoAmount",
                table: "Rentals",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "CaucaoPaymentIntentId",
                table: "Rentals",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CaucaoPaymentStatus",
                table: "Rentals",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Caucao",
                table: "TechItems");

            migrationBuilder.DropColumn(
                name: "CaucaoAmount",
                table: "Rentals");

            migrationBuilder.DropColumn(
                name: "CaucaoPaymentIntentId",
                table: "Rentals");

            migrationBuilder.DropColumn(
                name: "CaucaoPaymentStatus",
                table: "Rentals");
        }
    }
}
