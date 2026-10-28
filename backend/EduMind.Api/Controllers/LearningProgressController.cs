using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using EduMind.Api.Data;
using EduMind.Api.Models;
using EduMind.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Controllers;

/// <summary>
/// Báo cáo dựa trên lượt thi đã nộp của đúng tài khoản đăng nhập.
/// </summary>
[ApiController]
[Authorize]
[Route("api/learning/progress")]
public sealed class LearningProgressController : ControllerBase
{
    private readonly EduMindDbContext _db;
    private readonly LearningApiAccess _learningAccess;

    public LearningProgressController(EduMindDbContext db, LearningApiAccess learningAccess)
    {
        _db = db;
        _learningAccess = learningAccess;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int? documentId, CancellationToken ct)
    {
        if (!_learningAccess.Enabled)
            return StatusCode(403, new { message = "Learning API chua duoc bat tren may chu." });

        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)!;
        if (documentId.HasValue && documentId.Value <= 0)
            return BadRequest(new { message = "documentId phải là số nguyên dương." });

        if (documentId.HasValue && !await _db.Documents.AsNoTracking()
                .AnyAsync(d => d.Id == documentId.Value && d.OwnerUserId == userId, ct))
            return NotFound(new { message = "Không tìm thấy tài liệu đã chọn." });

        IQueryable<QuizAttempt> submitted = _db.QuizAttempts.AsNoTracking()
            .Where(a => a.SubmittedAtUtc != null && a.OwnerUserId == userId);
        if (documentId.HasValue)
            submitted = submitted.Where(a => a.Quiz != null && a.Quiz.DocumentId == documentId.Value);

        // Tổng hợp toàn bộ bài đã nộp ngay tại database, không tải tất cả bản ghi vào RAM.
        int attemptCount = await submitted.CountAsync(ct);
        decimal? averageScore = await submitted.AverageAsync(a => a.ScorePercent, ct);
        decimal? bestScore = await submitted.MaxAsync(a => a.ScorePercent, ct);
        int correctAnswers = await submitted.SumAsync(a => a.CorrectCount ?? 0, ct);
        int totalQuestions = await submitted.SumAsync(a => a.TotalQuestions, ct);
        decimal weightedAccuracy = totalQuestions == 0 ? 0 :
            Math.Round(100m * correctAnswers / totalQuestions, 2, MidpointRounding.AwayFromZero);

        // Các phép GROUP BY này chạy tại MySQL, không bị giới hạn theo 20 lượt gần nhất.
        var byDocumentRaw = await submitted
            .GroupBy(a => a.Quiz!.DocumentId)
            .Select(g => new
            {
                DocumentId = g.Key,
                CompletedAttempts = g.Count(),
                AverageScorePercent = g.Average(a => a.ScorePercent ?? 0m),
                BestScorePercent = g.Max(a => a.ScorePercent ?? 0m),
                LastSubmittedAtUtc = g.Max(a => a.SubmittedAtUtc)
            })
            .OrderByDescending(d => d.CompletedAttempts)
            .ThenBy(d => d.DocumentId)
            .ToListAsync(ct);

        var usedDocumentIds = byDocumentRaw.Select(d => d.DocumentId).ToArray();
        var docNames = await _db.Documents.AsNoTracking()
            .Where(d => usedDocumentIds.Contains(d.Id) && d.OwnerUserId == userId)
            .ToDictionaryAsync(d => d.Id, d => d.OriginalFileName, ct);
        var byDocument = byDocumentRaw.Select(d => new
        {
            d.DocumentId,
            DocumentName = docNames.GetValueOrDefault(d.DocumentId, $"PDF #{d.DocumentId}"),
            d.CompletedAttempts,
            AverageScorePercent = Math.Round(d.AverageScorePercent, 2),
            BestScorePercent = Math.Round(d.BestScorePercent, 2),
            d.LastSubmittedAtUtc
        }).ToList();

        var latest = await submitted.OrderByDescending(a => a.SubmittedAtUtc).ThenByDescending(a => a.Id)
            .Take(20)
            .Select(a => new
            {
                AttemptId = a.Id,
                a.QuizId,
                QuizTitle = a.Quiz!.Title,
                a.Quiz.DocumentId,
                DocumentName = a.Quiz.Document!.OriginalFileName,
                ScorePercent = a.ScorePercent ?? 0m,
                CorrectCount = a.CorrectCount ?? 0,
                a.TotalQuestions,
                SubmittedAtUtc = a.SubmittedAtUtc!.Value
            }).ToListAsync(ct);

        // Chỉ xét tối đa 100 lượt đã nộp gần nhất để tạo gợi ý theo trang nguồn.
        // Đây là heuristic thống kê câu sai, KHÔNG phải chẩn đoán học lực bằng AI.
        var last100AttemptIds = await submitted
            .OrderByDescending(a => a.SubmittedAtUtc).ThenByDescending(a => a.Id)
            .Select(a => a.Id).Take(100).ToListAsync(ct);
        var wrongAnswers = last100AttemptIds.Count == 0
            ? new List<WrongAnswerSource>()
            : await _db.QuizAnswers.AsNoTracking()
                .Where(a => !a.IsCorrect && last100AttemptIds.Contains(a.QuizAttemptId))
                .Select(a => new WrongAnswerSource
                {
                    DocumentId = a.Question!.Quiz!.DocumentId,
                    DocumentName = a.Question.Quiz.Document!.OriginalFileName,
                    SourcePageNumber = a.Question.SourcePageNumber,
                    SourceExcerpt = a.Question.SourceExcerpt
                })
                .ToListAsync(ct);

        var reviewPages = wrongAnswers
            .Where(a => a.SourcePageNumber > 0)
            .GroupBy(a => new { a.DocumentId, a.DocumentName, a.SourcePageNumber })
            .Select(group => new
            {
                group.Key.DocumentId,
                group.Key.DocumentName,
                PageNumber = group.Key.SourcePageNumber,
                IncorrectCount = group.Count(),
                SourceExcerpt = Truncate(group.Select(x => x.SourceExcerpt)
                    .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)) ?? string.Empty, 240)
            })
            .OrderByDescending(x => x.IncorrectCount)
            .ThenBy(x => x.DocumentId)
            .ThenBy(x => x.PageNumber)
            .Take(6)
            .ToList();

        return Ok(new
        {
            documentId,
            summary = new
            {
                CompletedAttempts = attemptCount,
                AverageScorePercent = Math.Round(averageScore ?? 0m, 2),
                BestScorePercent = Math.Round(bestScore ?? 0m, 2),
                CorrectAnswers = correctAnswers,
                TotalQuestions = totalQuestions,
                WeightedAccuracyPercent = weightedAccuracy,
                PracticedDocuments = byDocument.Count
            },
            byDocument,
            // Biểu đồ sắp từ cũ đến mới, danh sách lịch sử sắp mới đến cũ.
            scoreTrend = latest.AsEnumerable().Reverse().ToList(),
            recentAttempts = latest.Take(10).ToList(),
            reviewPages,
            methodology = new
            {
                ScoreTrendLimit = 20,
                ReviewAttemptLimit = 100,
                ReviewAttemptsConsidered = last100AttemptIds.Count,
                ReviewMeaning = "Số câu sai/bỏ trống theo trang PDF trong tối đa 100 lượt đã nộp gần nhất; không phải phân tích AI."
            }
        });
    }

    private static string Truncate(string text, int maxLength)
    {
        var cleaned = text.Trim();
        return cleaned.Length > maxLength ? cleaned[..maxLength].TrimEnd() + "…" : cleaned;
    }

    private sealed class WrongAnswerSource
    {
        public int DocumentId { get; set; }
        public string DocumentName { get; set; } = string.Empty;
        public int SourcePageNumber { get; set; }
        public string SourceExcerpt { get; set; } = string.Empty;
    }
}
