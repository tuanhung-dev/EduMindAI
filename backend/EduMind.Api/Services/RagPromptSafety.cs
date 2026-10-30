using System.Text.Json;

namespace EduMind.Api.Services;

/// <summary>Serialization separates lower-trust PDF/Word/chat text from instructions.</summary>
public static class RagPromptSafety
{
    public sealed record Evidence(string Citation, string DocumentName, string Content);
    public static string BuildInput(string question, string conversation,
        IEnumerable<Evidence> evidence, int maxSources = 8,
        int maxHistoryChars = 5000, int maxEvidenceChars = 1800)
    {
        if (question.Length > 500) throw new ArgumentOutOfRangeException(nameof(question));
        return JsonSerializer.Serialize(new
        {
            question,
            historyForReferenceOnly = TruncateRecentHistory(conversation, maxHistoryChars),
            untrustedDocumentEvidence = evidence.Take(Math.Clamp(maxSources, 1, 10)).Select(x => new
            {
                citation = x.Citation,
                fileName = x.DocumentName[..Math.Min(x.DocumentName.Length, 255)],
                content = x.Content[..Math.Min(x.Content.Length, Math.Clamp(maxEvidenceChars, 100, 1800))]
            }).ToArray()
        });
    }
    // Keep the newest conversation turns when the budget is tight.
    private static string TruncateRecentHistory(string conversation, int maxHistoryChars)
    {
        int budget = Math.Clamp(maxHistoryChars, 0, 5000);
        if (budget == 0) return string.Empty;
        if (conversation.Length <= budget) return conversation;
        string tail = conversation[^budget..];
        int firstNewline = tail.IndexOf('\n');
        return firstNewline is >= 0 and < 180 ? tail[(firstNewline + 1)..] : tail;
    }
}
