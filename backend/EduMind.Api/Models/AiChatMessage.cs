namespace EduMind.Api.Models;

public sealed class AiChatMessage
{
    public long Id { get; set; }
    public int AiChatSessionId { get; set; }
    public AiChatSession? Session { get; set; }
    public string Role { get; set; } = "user";
    public string Content { get; set; } = "";
    public string SourcesJson { get; set; } = "[]";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
