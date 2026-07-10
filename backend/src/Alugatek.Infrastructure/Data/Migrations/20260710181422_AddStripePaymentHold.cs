using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddStripePaymentHold : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "StripeConnectAccountId",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CaptureBefore",
                table: "Rentals",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExtendedAuthorizationStatus",
                table: "Rentals",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentIntentId",
                table: "Rentals",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaymentStatus",
                table: "Rentals",
                type: "text",
                nullable: false,
                defaultValue: "None");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "StripeConnectAccountId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CaptureBefore",
                table: "Rentals");

            migrationBuilder.DropColumn(
                name: "ExtendedAuthorizationStatus",
                table: "Rentals");

            migrationBuilder.DropColumn(
                name: "PaymentIntentId",
                table: "Rentals");

            migrationBuilder.DropColumn(
                name: "PaymentStatus",
                table: "Rentals");
        }
    }
}
