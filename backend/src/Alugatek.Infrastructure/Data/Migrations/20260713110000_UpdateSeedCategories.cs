using Alugatek.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Alugatek.Infrastructure.Data.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260713110000_UpdateSeedCategories")]
    public partial class UpdateSeedCategories : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE \"Categories\" SET \"Name\" = 'Portáteis' WHERE \"Id\" = 2;");
            migrationBuilder.Sql("UPDATE \"Categories\" SET \"Name\" = 'Câmaras' WHERE \"Id\" = 3;");
            migrationBuilder.Sql("UPDATE \"Categories\" SET \"Name\" = 'Equipamentos de áudio' WHERE \"Id\" = 4;");

            migrationBuilder.Sql(@"
                INSERT INTO ""Categories"" (""Id"", ""IconUrl"", ""Name"") VALUES
                (7, NULL, 'Drones'),
                (8, NULL, 'Wearables'),
                (9, NULL, 'Projetores'),
                (10, NULL, 'Monitores')
                ON CONFLICT (""Id"") DO UPDATE
                SET ""Name"" = EXCLUDED.""Name"", ""IconUrl"" = EXCLUDED.""IconUrl"";
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM \"Categories\" WHERE \"Id\" IN (7, 8, 9, 10);");
            migrationBuilder.Sql("UPDATE \"Categories\" SET \"Name\" = 'Laptops' WHERE \"Id\" = 2;");
            migrationBuilder.Sql("UPDATE \"Categories\" SET \"Name\" = 'Câmeras' WHERE \"Id\" = 3;");
            migrationBuilder.Sql("UPDATE \"Categories\" SET \"Name\" = 'Áudio' WHERE \"Id\" = 4;");
        }
    }
}
