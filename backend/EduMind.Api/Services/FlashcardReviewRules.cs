namespace EduMind.Api.Services;

/// <summary>
/// Transparent, bounded spaced-practice policy based on persisted streak and failures.
/// Does not claim to be the full SM-2 algorithm (no ease factor/quality grade stored).
/// </summary>
public static class FlashcardReviewRules
{
    public static (int Streak, DateTime NextUtc) Next(bool known, int previousStreak,
        int previousReviewCount, DateTime nowUtc)
    {
        if (!known) return (0, nowUtc.AddMinutes(10));
        var streak = Math.Clamp(previousStreak + 1, 1, 30);
        // A miss brings the card back soon; successful recall gradually extends the interval.
        // A mature card is capped at 60 days for a student project.
        var days = streak switch { 1 => 1, 2 => 3, 3 => 7, 4 => 14, 5 => 30, _ => 60 };
        // Repeated failures are represented by low streak (reset on miss).
        // Keep existing ReviewCount for reporting; don't invent historical grades.
        _ = previousReviewCount;
        return (streak, nowUtc.AddDays(days));
    }
}
