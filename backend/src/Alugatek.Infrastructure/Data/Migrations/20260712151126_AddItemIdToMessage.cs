using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddItemIdToMessage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ItemId",
                table: "Messages",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql(@"UPDATE ""Messages"" m
SET ""ItemId"" = r.""ItemId""
FROM ""Rentals"" r
WHERE m.""RentalId"" = r.""Id"";");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ItemId",
                table: "Messages",
                column: "ItemId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Messages_ItemId",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "ItemId",
                table: "Messages");
        }
    }
}
