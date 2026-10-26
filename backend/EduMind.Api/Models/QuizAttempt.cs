namespace EduMind.Api.Models;

/// <summary>Mỗi lần mở một đề để làm bài; dữ liệu demo local chưa gắn tài khoản.</summary>
public class QuizAttempt
{
    public int Id { get; set; }
    // Null chi xuat hien voi du lieu demo cu; khong tu dong gan cho user moi.
    public string? OwnerUserId { get; set; }
    public int QuizId { get; set; }
    public Quiz? Quiz { get; set; }
    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAtUtc { get; set; }
    public int TotalQuestions { get; set; }
    public int? CorrectCount { get; set; }
    public decimal? ScorePercent { get; set; }
    public List<QuizAnswer> Answers { get; set; } = new();
}
