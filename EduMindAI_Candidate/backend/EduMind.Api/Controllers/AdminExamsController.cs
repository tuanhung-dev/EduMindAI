using EduMind.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Controllers;

/// <summary>
/// ADMIN-05: tra cứu đề thi và kết quả trên toàn hệ thống.
/// Các endpoint này CHỈ dành cho Admin; câu trả lời/đáp án đúng
/// của bài chưa nộp tuyệt đối không được trả về.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin/exams")]
public sealed class AdminExamsController : ControllerBase
{
    private readonly EduMindDbContext _db;
    private readonly ILogger<AdminExamsController> _logger;

    public AdminExamsController(EduMindDbContext db, ILogger<AdminExamsController> logger)
    {
        _db = db;
        _logger = logger;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> Overview(CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var start = today.AddDays(-6);
        var totalQuizzes = await _db.Quizzes.CountAsync(ct);
        var partialQuizzes = await _db.Quizzes.CountAsync(x => x.IsPartialSource, ct);
        var totalAttempts = await _db.QuizAttempts.CountAsync(ct);
        var completedAttempts = await _db.QuizAttempts.CountAsync(x => x.SubmittedAtUtc != null, ct);
        var lowScoreAttempts = await _db.QuizAttempts.CountAsync(
            x => x.SubmittedAtUtc != null && x.ScorePercent != null && x.ScorePercent < 50m, ct);
        var averageScore = await _db.QuizAttempts
            .Where(x => x.SubmittedAtUtc != null && x.ScorePercent != null)
            .AverageAsync(x => x.ScorePercent, ct) ?? 0m;

        var recent = await _db.QuizAttempts.AsNoTracking()
            .Where(x => x.SubmittedAtUtc != null && x.SubmittedAtUtc >= start)
            .Select(x => x.SubmittedAtUtc!.Value)
            .ToListAsync(ct);
        var activity = Enumerable.Range(0, 7).Select(offset =>
        {
            var date = start.AddDays(offset);
            return new { date = date.ToString("yyyy-MM-dd"), completedAttempts = recent.Count(x => x.Date == date) };
        }).ToArray();

        return Ok(new
        {
            totalQuizzes,
            partialQuizzes,
            totalAttempts,
            completedAttempts,
            openAttempts = totalAttempts - completedAttempts,
            lowScoreAttempts,
            averageScore,
            recentActivity = activity,
            note = "Toàn bộ dữ liệu hệ thống; điểm chỉ tính trên các lượt đã nộp."
        });
    }

    [HttpGet("quizzes")]
    public async Task<IActionResult> Quizzes(
        [FromQuery] string? search, [FromQuery] string? difficulty,
        [FromQuery] int? documentId, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15, CancellationToken ct = default)
    {
        if (!ValidPage(page, pageSize)) return BadRequest(new { message = "page >= 1, pageSize từ 1 đến 50." });
        if (search?.Length > 120) return BadRequest(new { message = "Từ khóa tối đa 120 ký tự." });
        if (documentId is <= 0) return BadRequest(new { message = "documentId không hợp lệ." });
        if (!string.IsNullOrWhiteSpace(difficulty) && difficulty is not ("easy" or "medium" or "hard"))
            return BadRequest(new { message = "Độ khó không hợp lệ." });

        var query = _db.Quizzes.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var value = search.Trim();
            query = query.Where(q => q.Title.Contains(value) || q.Document!.OriginalFileName.Contains(value) ||
                _db.Users.Any(u => u.Id == q.OwnerUserId && u.Email != null && u.Email.Contains(value)));
        }
        if (!string.IsNullOrWhiteSpace(difficulty)) query = query.Where(q => q.Difficulty == difficulty);
        if (documentId.HasValue) query = query.Where(q => q.DocumentId == documentId.Value);

        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(q => q.CreatedAtUtc).ThenByDescending(q => q.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(q => new
            {
                q.Id, q.DocumentId, documentName = q.Document!.OriginalFileName,
                q.Title, q.Difficulty, q.IsPartialSource, q.CreatedAtUtc, q.OwnerUserId,
                ownerEmail = _db.Users.Where(u => u.Id == q.OwnerUserId).Select(u => u.Email).FirstOrDefault(),
                questionCount = q.Questions.Count,
                attemptCount = _db.QuizAttempts.Count(a => a.QuizId == q.Id),
                submittedCount = _db.QuizAttempts.Count(a => a.QuizId == q.Id && a.SubmittedAtUtc != null)
            }).ToListAsync(ct);
        return Ok(new { items, total, page, pageSize, totalPages = Pages(total, pageSize) });
    }

    [HttpGet("quizzes/{id:int}")]
    public async Task<IActionResult> QuizDetails(int id, CancellationToken ct)
    {
        if (id <= 0) return BadRequest(new { message = "ID không hợp lệ." });
        var details = await _db.Quizzes.AsNoTracking()
            .Where(q => q.Id == id)
            .Select(q => new
            {
                q.Id, q.DocumentId, documentName = q.Document!.OriginalFileName,
                q.Title, q.Difficulty, q.IsPartialSource, q.CreatedAtUtc, q.OwnerUserId,
                ownerEmail = _db.Users.Where(u => u.Id == q.OwnerUserId).Select(u => u.Email).FirstOrDefault(),
                attemptCount = _db.QuizAttempts.Count(a => a.QuizId == q.Id),
                // Tuyệt đối không trả CorrectOption / Explanation của đề chưa làm.
                questions = q.Questions.OrderBy(x => x.Position).Select(x => new
                {
                    x.Id, x.Position, x.Content, x.OptionA, x.OptionB, x.OptionC, x.OptionD,
                    x.SourcePageNumber
                }).ToList()
            }).FirstOrDefaultAsync(ct);
        return details is null ? NotFound(new { message = "Không tìm thấy đề thi." }) : Ok(details);
    }

    [HttpGet("attempts")]
    public async Task<IActionResult> Attempts(
        [FromQuery] string? search, [FromQuery] int? quizId,
        [FromQuery] string? state, [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15, CancellationToken ct = default)
    {
        if (!ValidPage(page, pageSize)) return BadRequest(new { message = "page >= 1, pageSize từ 1 đến 50." });
        if (search?.Length > 120) return BadRequest(new { message = "Từ khóa tối đa 120 ký tự." });
        if (quizId is <= 0) return BadRequest(new { message = "quizId không hợp lệ." });
        if (!string.IsNullOrEmpty(state) && state is not ("submitted" or "open"))
            return BadRequest(new { message = "Trạng thái không hợp lệ." });

        var query = _db.QuizAttempts.AsNoTracking().AsQueryable();
        if (quizId.HasValue) query = query.Where(a => a.QuizId == quizId.Value);
        if (state == "submitted") query = query.Where(a => a.SubmittedAtUtc != null);
        if (state == "open") query = query.Where(a => a.SubmittedAtUtc == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var value = search.Trim();
            query = query.Where(a => a.Quiz!.Title.Contains(value) ||
                _db.Users.Any(u => u.Id == a.OwnerUserId && u.Email != null && u.Email.Contains(value)));
        }
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(a => a.StartedAtUtc).ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(a => new
            {
                a.Id, a.QuizId, quizTitle = a.Quiz!.Title, documentId = a.Quiz.DocumentId,
                a.OwnerUserId,
                ownerEmail = _db.Users.Where(u => u.Id == a.OwnerUserId).Select(u => u.Email).FirstOrDefault(),
                a.StartedAtUtc, a.SubmittedAtUtc, a.TotalQuestions, a.CorrectCount, a.ScorePercent
            }).ToListAsync(ct);
        return Ok(new { items, total, page, pageSize, totalPages = Pages(total, pageSize) });
    }

    [HttpGet("attempts/{id:int}")]
    public async Task<IActionResult> AttemptDetails(int id, CancellationToken ct)
    {
        if (id <= 0) return BadRequest(new { message = "ID không hợp lệ." });
        var attempt = await _db.QuizAttempts.AsNoTracking()
            .Where(a => a.Id == id)
            .Select(a => new
            {
                a.Id, a.QuizId, quizTitle = a.Quiz!.Title,
                documentId = a.Quiz.DocumentId, documentName = a.Quiz.Document!.OriginalFileName,
                a.OwnerUserId,
                ownerEmail = _db.Users.Where(u => u.Id == a.OwnerUserId).Select(u => u.Email).FirstOrDefault(),
                a.StartedAtUtc, a.SubmittedAtUtc, a.TotalQuestions, a.CorrectCount, a.ScorePercent
            }).FirstOrDefaultAsync(ct);
        if (attempt is null) return NotFound(new { message = "Không tìm thấy lượt làm bài." });

        // Quyền Admin không đồng nghĩa được xem trước đáp án của bài chưa nộp.
        if (attempt.SubmittedAtUtc is null)
            return Ok(new { attempt.Id, attempt.QuizId, attempt.quizTitle,
                attempt.documentId, attempt.documentName, attempt.OwnerUserId, attempt.ownerEmail,
                attempt.StartedAtUtc, attempt.SubmittedAtUtc, attempt.TotalQuestions,
                attempt.CorrectCount, attempt.ScorePercent, questions = Array.Empty<object>() });

        var questions = await _db.QuizQuestions.AsNoTracking()
            .Where(q => q.QuizId == attempt.QuizId).OrderBy(q => q.Position)
            .Select(q => new
            {
                q.Id, q.Position, q.Content, q.OptionA, q.OptionB, q.OptionC, q.OptionD,
                q.CorrectOption, q.Explanation, q.SourcePageNumber, q.SourceExcerpt,
                selectedOption = _db.QuizAnswers.Where(a => a.QuizAttemptId == id && a.QuestionId == q.Id)
                    .Select(a => a.SelectedOption).FirstOrDefault(),
                isCorrect = _db.QuizAnswers.Where(a => a.QuizAttemptId == id && a.QuestionId == q.Id)
                    .Select(a => (bool?)a.IsCorrect).FirstOrDefault()
            }).ToListAsync(ct);
        return Ok(new { attempt.Id, attempt.QuizId, attempt.quizTitle,
            attempt.documentId, attempt.documentName, attempt.OwnerUserId, attempt.ownerEmail,
            attempt.StartedAtUtc, attempt.SubmittedAtUtc, attempt.TotalQuestions,
            attempt.CorrectCount, attempt.ScorePercent, questions });
    }

    // Chỉ xóa đề chưa từng có lượt làm: không phá hủy lịch sử / kết quả học viên.
    [HttpDelete("quizzes/{id:int}")]
    public async Task<IActionResult> DeleteUnusedQuiz(int id, CancellationToken ct)
    {
        if (id <= 0) return BadRequest(new { message = "ID không hợp lệ." });
        var quiz = await _db.Quizzes.FirstOrDefaultAsync(q => q.Id == id, ct);
        if (quiz is null) return NotFound(new { message = "Không tìm thấy đề thi." });
        if (await _db.QuizAttempts.AnyAsync(a => a.QuizId == id, ct))
            return Conflict(new { message = "Đề đã có lượt làm, không được xóa để bảo toàn lịch sử học viên." });

        _db.Quizzes.Remove(quiz);
        try
        {
            await _db.SaveChangesAsync(ct);
            _logger.LogWarning("Admin {AdminId} deleted unused quiz {QuizId}",
                User.Identity?.Name ?? "unknown", id);
            return Ok(new { message = "Đã xóa đề chưa có lượt làm.", id });
        }
        catch (DbUpdateException e)
        {
            _logger.LogWarning(e, "Cannot delete quiz {QuizId} due to related records", id);
            return Conflict(new { message = "Không xóa được đề vì đã phát sinh dữ liệu liên kết." });
        }
    }

    private static bool ValidPage(int page, int pageSize) => page >= 1 && pageSize is >= 1 and <= 50;
    private static int Pages(int total, int pageSize) => (int)Math.Ceiling(total / (double)pageSize);
}
