using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace EduMind.Api.Services;

/// <summary>Deterministic guards; cannot prove LLM semantic correctness.</summary>
public static class QuizLearningRules
{
    private static readonly HashSet<string> Stop = new(StringComparer.Ordinal)
    { "la", "va", "cua", "cho", "trong", "theo", "voi", "khong", "nhung", "mot", "cac", "nay", "duoc", "nhu", "hay", "dau", "sau", "khi", "tai", "bao", "nhi", "nhieu", "gi", "nao", "dung", "sai", "ve", "the", "co", "de", "do", "roi", "dieu", "nguoi", "den", "thi", "ban" };

    public static string Normalize(string input)
    {
        var normalized = (input ?? "").ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormD);
        var b = new StringBuilder();
        foreach (var c in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            b.Append(char.IsLetterOrDigit(c) ? c : ' ');
        }
        return Regex.Replace(b.ToString(), @"\s+", " ").Trim();
    }

    public static bool HasDuplicatedOptions(IEnumerable<string> values) =>
        values.Select(Normalize).Distinct(StringComparer.Ordinal).Count() != 4;

    // Keyword check is a conservative sanity check, not a factual-entailment test.
    public static bool HasDocumentEvidence(string question, string explanation, string source)
    {
        var cited = Normalize(source);
        if (cited.Length < 30) return false;
        var questionTerms = Normalize(question).Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length >= 4 && !Stop.Contains(t)).Distinct();
        var explanatoryTerms = Normalize(explanation).Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length >= 4 && !Stop.Contains(t)).Distinct();
        return questionTerms.Concat(explanatoryTerms).Any(t =>
            cited.Contains(t, StringComparison.Ordinal));
    }
}
