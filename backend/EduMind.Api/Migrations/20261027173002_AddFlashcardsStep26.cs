using System;
using Microsoft.EntityFrameworkCore.Migrations;
using MySql.EntityFrameworkCore.Metadata;

#nullable disable

namespace EduMind.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFlashcardsStep26 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "flashcard_decks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    OwnerUserId = table.Column<string>(type: "varchar(191)", maxLength: 191, nullable: false),
                    DocumentId = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "varchar(200)", maxLength: 200, nullable: false),
                    Topic = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_flashcard_decks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_flashcard_decks_documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "flashcards",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    FlashcardDeckId = table.Column<int>(type: "int", nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false),
                    Front = table.Column<string>(type: "varchar(600)", maxLength: 600, nullable: false),
                    Back = table.Column<string>(type: "varchar(1600)", maxLength: 1600, nullable: false),
                    SourcePageNumber = table.Column<int>(type: "int", nullable: false),
                    ReviewCount = table.Column<int>(type: "int", nullable: false),
                    SuccessStreak = table.Column<int>(type: "int", nullable: false),
                    NextReviewAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    LastReviewedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_flashcards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_flashcards_flashcard_decks_FlashcardDeckId",
                        column: x => x.FlashcardDeckId,
                        principalTable: "flashcard_decks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_flashcard_decks_DocumentId",
                table: "flashcard_decks",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_flashcard_decks_OwnerUserId_CreatedAtUtc",
                table: "flashcard_decks",
                columns: new[] { "OwnerUserId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_flashcards_FlashcardDeckId_Position",
                table: "flashcards",
                columns: new[] { "FlashcardDeckId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_flashcards_NextReviewAtUtc",
                table: "flashcards",
                column: "NextReviewAtUtc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "flashcards");

            migrationBuilder.DropTable(
                name: "flashcard_decks");
        }
    }
}
