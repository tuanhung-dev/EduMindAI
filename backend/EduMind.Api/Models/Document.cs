
namespace EduMind.Api.Models;

public class Document
{
    public int Id { get; set; }
    // Null chi xuat hien voi du lieu demo cu; khong tu dong gan cho user moi.
    public string? OwnerUserId { get; set; }

    // Môn học chứa tài liệu
    public int SubjectId { get; set; }
    public Subject? Subject { get; set; }

    // Tên file gốc người dùng tải lên
    public string OriginalFileName { get; set; } = string.Empty;

    // Tên file thực tế được lưu trên máy chủ
    public string StoredFileName { get; set; } = string.Empty;

    public string ContentType { get; set; } = "application/pdf";

    public long SizeBytes { get; set; }

    // Uploaded, Processing, Ready, Failed
    public string Status { get; set; } = "Uploaded";

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
