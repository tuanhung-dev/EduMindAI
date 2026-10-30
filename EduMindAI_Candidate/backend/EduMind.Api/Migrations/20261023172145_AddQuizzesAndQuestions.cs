using System;
using Microsoft.EntityFrameworkCore.Migrations;
using MySql.EntityFrameworkCore.Metadata;

#nullable disable

namespace EduMind.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddQuizzesAndQuestions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "quizzes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    DocumentId = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "varchar(180)", maxLength: 180, nullable: false),
                    Difficulty = table.Column<string>(type: "varchar(12)", maxLength: 12, nullable: false),
                    IsPartialSource = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_quizzes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_quizzes_documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "quiz_questions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    QuizId = table.Column<int>(type: "int", nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false),
                    Content = table.Column<string>(type: "varchar(1500)", maxLength: 1500, nullable: false),
                    OptionA = table.Column<string>(type: "varchar(600)", maxLength: 600, nullable: false),
                    OptionB = table.Column<string>(type: "varchar(600)", maxLength: 600, nullable: false),
                    OptionC = table.Column<string>(type: "varchar(600)", maxLength: 600, nullable: false),
                    OptionD = table.Column<string>(type: "varchar(600)", maxLength: 600, nullable: false),
                    CorrectOption = table.Column<string>(type: "varchar(1)", maxLength: 1, nullable: false),
                    Explanation = table.Column<string>(type: "varchar(2000)", maxLength: 2000, nullable: false),
                    SourceChunkId = table.Column<int>(type: "int", nullable: false),
                    SourcePageNumber = table.Column<int>(type: "int", nullable: false),
                    SourceExcerpt = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_quiz_questions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_quiz_questions_quizzes_QuizId",
                        column: x => x.QuizId,
                        principalTable: "quizzes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_quiz_questions_QuizId_Position",
                table: "quiz_questions",
                columns: new[] { "QuizId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_quizzes_DocumentId_CreatedAtUtc",
                table: "quizzes",
                columns: new[] { "DocumentId", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "quiz_questions");

            migrationBuilder.DropTable(
                name: "quizzes");
        }
    }
}
