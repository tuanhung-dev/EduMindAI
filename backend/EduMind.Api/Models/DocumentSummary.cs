namespace EduMind.Api.Models;

/// <summary>A user's saved Ollama-generated PDF summary (Step 21.2).</summary>
public sealed class DocumentSummary
{
    public int Id { get; set; }
    public int DocumentId { get; set; }
    public Document? Document { get; set; }
    public string OwnerUserId { get; set; } = string.Empty;
    public string Level { get; set; } = "short";
    public string SummaryContent { get; set; } = string.Empty;
    public int TotalChunks { get; set; }
    public int SampledChunks { get; set; }
    public bool IsPartial { get; set; }
    public string PagesJson { get; set; } = "[]";
    public string SourcesJson { get; set; } = "[]";
    public string CoverageNote { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
