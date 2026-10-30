namespace EduMind.Api.Models;

/// <summary>Đáp án đúng chỉ lưu ở Backend; API xem đề không trả trường này.</summary>
public class QuizQuestion
{
    public int Id { get; set; }
    public int QuizId { get; set; }
    public Quiz? Quiz { get; set; }
    public int Position { get; set; }
    public string Content { get; set; } = string.Empty;
    public string OptionA { get; set; } = string.Empty;
    public string OptionB { get; set; } = string.Empty;
    public string OptionC { get; set; } = string.Empty;
    public string OptionD { get; set; } = string.Empty;
    public string CorrectOption { get; set; } = string.Empty;
    public string Explanation { get; set; } = string.Empty;
    // Bản chụp nguồn: chunks có thể bị thay thế khi lập chỉ mục lại PDF.
    public int SourceChunkId { get; set; }
    public int SourcePageNumber { get; set; }
    public string SourceExcerpt { get; set; } = string.Empty;
}
