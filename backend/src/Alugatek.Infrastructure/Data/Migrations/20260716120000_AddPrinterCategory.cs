using Alugatek.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260716120000_AddPrinterCategory")]
    public partial class AddPrinterCategory : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                INSERT INTO ""Categories"" (""Id"", ""IconUrl"", ""Name"")
                VALUES (11, NULL, 'Impressoras')
                ON CONFLICT (""Id"") DO UPDATE
                SET ""Name"" = EXCLUDED.""Name"", ""IconUrl"" = EXCLUDED.""IconUrl"";
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM \"Categories\" WHERE \"Id\" = 11;");
        }
    }
}