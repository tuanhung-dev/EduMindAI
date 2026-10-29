using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EduMind.Api.Migrations;

// Preserve existing chat history: all prior sessions get IsPinned = false.
public partial class AddAiChatSessionPinFlag : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<bool>(
            name: "IsPinned",
            table: "ai_chat_sessions",
            type: "tinyint(1)",
            nullable: false,
            defaultValue: false);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "IsPinned",
            table: "ai_chat_sessions");
    }
}
