namespace EduMind.Api.Models;

public sealed class Flashcard
{
    public int Id { get; set; }
    public int FlashcardDeckId { get; set; }
    public FlashcardDeck? Deck { get; set; }
    public int Position { get; set; }
    public string Front { get; set; } = string.Empty;
    public string Back { get; set; } = string.Empty;
    public int SourcePageNumber { get; set; }
    public int ReviewCount { get; set; }
    public int SuccessStreak { get; set; }
    public DateTime NextReviewAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastReviewedAtUtc { get; set; }
}
