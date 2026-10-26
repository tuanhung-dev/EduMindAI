
namespace EduMind.Api.Models;

public class DocumentChunk
{
    public int Id { get; set; }

    // ID tai lieu PDF
    public int DocumentId { get; set; }

    public Document? Document { get; set; }

    // Trang chua doan van ban
    public int PageNumber { get; set; }

    // Vi tri doan trong tai lieu
    public int ChunkIndex { get; set; }

    // Noi dung van ban
    public string Content { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }
        = DateTime.UtcNow;
}
