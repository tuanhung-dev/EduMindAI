namespace EduMind.Api.Models;

/// <summary>Đáp án đã chấm tại Backend; null nếu người dùng bỏ trống.</summary>
public class QuizAnswer
{
    public int Id { get; set; }
    public int QuizAttemptId { get; set; }
    public QuizAttempt? QuizAttempt { get; set; }
    public int QuestionId { get; set; }
    public QuizQuestion? Question { get; set; }
    public string? SelectedOption { get; set; }
    public bool IsCorrect { get; set; }
}
