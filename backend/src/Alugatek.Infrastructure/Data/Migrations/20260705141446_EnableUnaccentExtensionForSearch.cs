using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class EnableUnaccentExtensionForSearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS unaccent;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP EXTENSION IF EXISTS unaccent;");
        }
    }
}
