using System;
using Microsoft.EntityFrameworkCore.Migrations;
using MySql.EntityFrameworkCore.Metadata;

#nullable disable

namespace EduMind.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentSummaryHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "document_summaries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    DocumentId = table.Column<int>(type: "int", nullable: false),
                    OwnerUserId = table.Column<string>(type: "varchar(191)", maxLength: 191, nullable: false),
                    Level = table.Column<string>(type: "varchar(12)", maxLength: 12, nullable: false),
                    SummaryContent = table.Column<string>(type: "longtext", nullable: false),
                    TotalChunks = table.Column<int>(type: "int", nullable: false),
                    SampledChunks = table.Column<int>(type: "int", nullable: false),
                    IsPartial = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    PagesJson = table.Column<string>(type: "longtext", nullable: false),
                    SourcesJson = table.Column<string>(type: "longtext", nullable: false),
                    CoverageNote = table.Column<string>(type: "varchar(600)", maxLength: 600, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_document_summaries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_document_summaries_documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_document_summaries_DocumentId_OwnerUserId_CreatedAtUtc",
                table: "document_summaries",
                columns: new[] { "DocumentId", "OwnerUserId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "document_summaries");
        }
    }
}
