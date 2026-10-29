namespace EduMind.Api.Models;

// Each deck is private to the student who generated it.
public sealed class FlashcardDeck
{
    public int Id { get; set; }
    public string OwnerUserId { get; set; } = string.Empty;
    public int DocumentId { get; set; }
    public Document? Document { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Topic { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<Flashcard> Cards { get; set; } = new();
}
