namespace EduMind.Api.Models;

/// <summary>Đề được tạo từ một PDF và lưu trước khi làm bài (Bước 14).</summary>
public class Quiz
{
    public int Id { get; set; }
    // Null chi xuat hien voi du lieu demo cu; khong tu dong gan cho user moi.
    public string? OwnerUserId { get; set; }
    public int DocumentId { get; set; }
    public Document? Document { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Difficulty { get; set; } = "medium";
    public bool IsPartialSource { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public List<QuizQuestion> Questions { get; set; } = new();
}
