using System;
using Microsoft.EntityFrameworkCore.Migrations;
using MySql.EntityFrameworkCore.Metadata;

#nullable disable

namespace EduMind.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupBLearning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "flashcard_review_events",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    OwnerUserId = table.Column<string>(type: "varchar(191)", maxLength: 191, nullable: false),
                    FlashcardId = table.Column<int>(type: "int", nullable: false),
                    Known = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    ReviewedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_flashcard_review_events", x => x.Id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "study_task_completions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    OwnerUserId = table.Column<string>(type: "varchar(191)", maxLength: 191, nullable: false),
                    StudyDate = table.Column<DateTime>(type: "date", nullable: false),
                    DocumentId = table.Column<int>(type: "int", nullable: false),
                    Kind = table.Column<string>(type: "varchar(24)", maxLength: 24, nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_study_task_completions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_study_task_completions_documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_flashcard_review_events_OwnerUserId_ReviewedAtUtc",
                table: "flashcard_review_events",
                columns: new[] { "OwnerUserId", "ReviewedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_study_task_completions_DocumentId",
                table: "study_task_completions",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_study_task_completions_OwnerUserId_StudyDate_DocumentId_Kind",
                table: "study_task_completions",
                columns: new[] { "OwnerUserId", "StudyDate", "DocumentId", "Kind" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "flashcard_review_events");

            migrationBuilder.DropTable(
                name: "study_task_completions");
        }
    }
}
