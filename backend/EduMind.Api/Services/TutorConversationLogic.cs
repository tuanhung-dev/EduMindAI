using System.Text.RegularExpressions;

namespace EduMind.Api.Services;

/// <summary>
/// Pure, deterministic rules for short follow-up questions and document citations.
/// No data is loaded here: the controller must first authorize the document and chat.
/// </summary>
public static class TutorConversationLogic
{
    // Only trigger on short referential questions. An independent new question must NOT
    // inherit an unrelated old topic simply because a chat exists.
    private static readonly Regex ReferencePattern = new(
        @"(?<![\p{L}\p{N}])(nó|đó|ấy|này|vậy|điều đó|cái đó|ở trên|vừa rồi|tiếp theo|nói rõ hơn|giải thích thêm|ví dụ khác|thêm ví dụ|so sánh chúng)(?![\p{L}\p{N}])",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex ShortEllipsisPattern = new(
        @"^\s*(tại sao|vì sao|như thế nào|làm sao|cho (tôi )?(một )?ví dụ|lấy (một )?ví dụ)\s*[?.!]*\s*$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex CitationPattern = new(
        @"\[(Trang|Phần)\s+(\d+)\]",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static bool IsFollowUp(string? question)
    {
        string value = question?.Trim() ?? string.Empty;
        return value.Length is > 0 and <= 140 &&
            (ReferencePattern.IsMatch(value) || ShortEllipsisPattern.IsMatch(value));
    }

    public static string BuildRetrievalQuery(string question, IReadOnlyList<string> previousUserQuestions)
    {
        string current = question.Trim();
        if (!IsFollowUp(current) || previousUserQuestions.Count == 0)
            return current;

        // Find the latest independent user question as the topic anchor. This supports
        // "Học sâu là gì?" -> "Ví dụ về nó" -> "Tại sao?" without losing "Học sâu".
        // Never build retrieval context from AI answers (they might be inaccurate).
        var recent = previousUserQuestions.Where(s => !string.IsNullOrWhiteSpace(s))
            .TakeLast(4).Select(s => s.Trim()).ToArray();
        if (recent.Length == 0) return current;
        string latest = recent[^1];
        string anchor = recent.LastOrDefault(s => !IsFollowUp(s)) ?? latest;
        if (string.Equals(anchor, current, StringComparison.OrdinalIgnoreCase))
            return current;

        // Bounds the query for local embeddings and avoids repeating the same question.
        var parts = new List<string> { anchor[..Math.Min(anchor.Length, 200)] };
        if (!string.Equals(latest, anchor, StringComparison.OrdinalIgnoreCase))
            parts.Add(latest[..Math.Min(latest.Length, 140)]);
        parts.Add(current);
        return string.Join("\n", parts);
    }

    public static string RemoveUnsupportedCitations(string answer, IEnumerable<int> allowedPages, bool isWord)
    {
        var allowed = allowedPages.ToHashSet();
        string unit = isWord ? "Phần" : "Trang";
        return CitationPattern.Replace(answer, match =>
        {
            if (!match.Groups[1].Value.Equals(unit, StringComparison.OrdinalIgnoreCase) ||
                !int.TryParse(match.Groups[2].Value, out int number) || !allowed.Contains(number))
                return "[nguồn chưa xác minh]";
            return $"[{unit} {number}]";
        });
    }
}
