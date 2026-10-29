using System.Text.Json;

namespace EduMind.Api.Services;

/// <summary>Serialization separates lower-trust PDF/Word/chat text from instructions.</summary>
public static class RagPromptSafety
{
    public sealed record Evidence(string Citation, string DocumentName, string Content);
    public static string BuildInput(string question, string conversation,
        IEnumerable<Evidence> evidence)
    {
        if (question.Length > 500) throw new ArgumentOutOfRangeException(nameof(question));
        return JsonSerializer.Serialize(new
        {
            question,
            historyForReferenceOnly = conversation[..Math.Min(conversation.Length, 5000)],
            untrustedDocumentEvidence = evidence.Take(8).Select(x => new
            {
                citation = x.Citation,
                fileName = x.DocumentName[..Math.Min(x.DocumentName.Length, 255)],
                content = x.Content[..Math.Min(x.Content.Length, 1800)]
            }).ToArray()
        });
    }
}
