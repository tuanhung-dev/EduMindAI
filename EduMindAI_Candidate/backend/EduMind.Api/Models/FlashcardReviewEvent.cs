namespace EduMind.Api.Models;

/// <summary>Only reviews after Group B installation are captured here.</summary>
public sealed class FlashcardReviewEvent
{
    public long Id { get; set; }
    public string OwnerUserId { get; set; } = string.Empty;
    public int FlashcardId { get; set; }
    // Snapshot identifier, deliberately not an FK: deleting a deck keeps activity history.
    public bool Known { get; set; }
    public DateTime ReviewedAtUtc { get; set; } = DateTime.UtcNow;
}
