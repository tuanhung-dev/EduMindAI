using System.Text.RegularExpressions;

namespace EduMind.Api.Services;

public static class RagCitationValidator
{
    // Discards non-existent labels without inventing evidence or page numbers.
    private static readonly Regex Citation = new(@"\[(?:T\d+\s+)?(?:Trang|Phần)\s+\d+\]",
        RegexOptions.Compiled | RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static string StripUnknown(string answer, IEnumerable<string> allowed)
    {
        var valid = allowed.ToHashSet(StringComparer.OrdinalIgnoreCase);
        return Citation.Replace(answer, m => valid.Contains(m.Value) ? m.Value : "[nguồn chưa xác minh]");
    }
}
