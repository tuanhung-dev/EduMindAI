namespace EduMind.Api.Models;

/// <summary>One completed task per (owner, local date, document, task type).</summary>
public sealed class StudyTaskCompletion
{
    public long Id { get; set; }
    public string OwnerUserId { get; set; } = string.Empty;
    public DateTime StudyDate { get; set; } // date at midnight, local calendar date (Kind=Unspecified)
    public int DocumentId { get; set; }
    public Document? Document { get; set; }
    public string Kind { get; set; } = string.Empty;
    public DateTime CompletedAtUtc { get; set; } = DateTime.UtcNow;
}
