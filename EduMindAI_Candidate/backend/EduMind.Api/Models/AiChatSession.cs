namespace EduMind.Api.Models;

public sealed class AiChatSession
{
    public int Id { get; set; }
    public string OwnerUserId { get; set; } = "";
    public int DocumentId { get; set; }
    public Document? Document { get; set; }
    public string Title { get; set; } = "Cuộc trò chuyện mới";
    public bool IsPinned { get; set; } = false;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<AiChatMessage> Messages { get; set; } = new();
}
