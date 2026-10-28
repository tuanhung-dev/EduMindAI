using System;
using Microsoft.EntityFrameworkCore.Migrations;
using MySql.EntityFrameworkCore.Metadata;

#nullable disable

namespace EduMind.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAiChatHistoryStep29_2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ai_chat_sessions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    OwnerUserId = table.Column<string>(type: "varchar(191)", maxLength: 191, nullable: false),
                    DocumentId = table.Column<int>(type: "int", nullable: false),
                    Title = table.Column<string>(type: "varchar(180)", maxLength: 180, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_chat_sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ai_chat_sessions_documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "ai_chat_messages",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    AiChatSessionId = table.Column<int>(type: "int", nullable: false),
                    Role = table.Column<string>(type: "varchar(12)", maxLength: 12, nullable: false),
                    Content = table.Column<string>(type: "longtext", nullable: false),
                    SourcesJson = table.Column<string>(type: "longtext", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_chat_messages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ai_chat_messages_ai_chat_sessions_AiChatSessionId",
                        column: x => x.AiChatSessionId,
                        principalTable: "ai_chat_sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_ai_chat_messages_AiChatSessionId_Id",
                table: "ai_chat_messages",
                columns: new[] { "AiChatSessionId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_ai_chat_sessions_DocumentId",
                table: "ai_chat_sessions",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_ai_chat_sessions_OwnerUserId_DocumentId_UpdatedAtUtc",
                table: "ai_chat_sessions",
                columns: new[] { "OwnerUserId", "DocumentId", "UpdatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ai_chat_messages");

            migrationBuilder.DropTable(
                name: "ai_chat_sessions");
        }
    }
}
