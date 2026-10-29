using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using EduMind.Api.Data;
using EduMind.Api.Models;
using EduMind.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Controllers;

public sealed class SubmittedQuizAnswer
{
    public int QuestionId { get; set; }
    public string? SelectedOption { get; set; }
}

public sealed class SubmitQuizAttemptRequest
{
    public List<SubmittedQuizAnswer> Answers { get; set; } = new();
}

/// <summary>
/// Bài làm thuộc tài khoản đăng nhập. Production chỉ mở khi Feature được bật.
/// </summary>
[ApiController]
[Authorize]
[Route("api/attempts")]
public sealed class QuizAttemptsController : ControllerBase
{
    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private bool IsAdmin => User.IsInRole("Admin");
    private readonly EduMindDbContext _db;
    private readonly LearningApiAccess _learningAccess;

    public QuizAttemptsController(EduMindDbContext db, LearningApiAccess learningAccess)
    {
        _db = db;
        _learningAccess = learningAccess;
    }


    [HttpPost("/api/quizzes/{quizId:int}/attempts")]
    public async Task<IActionResult> Start(int quizId, CancellationToken ct)
    {
        if (!_learningAccess.Enabled) return StatusCode(403, new { message = "Learning API chua duoc bat tren may chu." });
        if (quizId <= 0) return BadRequest(new { message = "quizId không hợp lệ." });
        if (!await _db.Quizzes.AnyAsync(q => q.Id == quizId &&
            (q.OwnerUserId == CurrentUserId || (IsAdmin && q.OwnerUserId != null)), ct))
            return NotFound(new { message = "Không tìm thấy đề thi." });
        var questionCount = await _db.QuizQuestions.AsNoTracking().CountAsync(q => q.QuizId == quizId, ct);
        if (questionCount == 0)
        {
            bool exists = await _db.Quizzes.AnyAsync(q => q.Id == quizId, ct);
            if (exists) return Conflict(new { message = "Đề hiện không có câu hỏi." });
            return NotFound(new { message = "Không tìm thấy đề thi." });
        }
        var attempt = new QuizAttempt { QuizId = quizId, TotalQuestions = questionCount, OwnerUserId = CurrentUserId };
        _db.QuizAttempts.Add(attempt);
        await _db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Get), new { id = attempt.Id }, new
        {
            attemptId = attempt.Id, attempt.QuizId, attempt.StartedAtUtc,
            attempt.TotalQuestions, message = "Đã bắt đầu lượt làm bài."
        });
    }

    [HttpGet("/api/quizzes/{quizId:int}/attempts")]
    public async Task<IActionResult> History(int quizId, CancellationToken ct)
    {
        if (!_learningAccess.Enabled) return StatusCode(403, new { message = "Learning API chua duoc bat tren may chu." });
        if (!await _db.Quizzes.AnyAsync(q => q.Id == quizId &&
            (q.OwnerUserId == CurrentUserId || (IsAdmin && q.OwnerUserId != null)), ct))
            return NotFound(new { message = "Không tìm thấy đề thi." });
        var items = await _db.QuizAttempts.AsNoTracking().Where(a => a.QuizId == quizId && a.OwnerUserId == CurrentUserId)
            .OrderByDescending(a => a.StartedAtUtc).ThenByDescending(a => a.Id)
            .Take(30)
            .Select(a => new
            {
                a.Id, a.QuizId, a.StartedAtUtc, a.SubmittedAtUtc,
                a.TotalQuestions, a.CorrectCount, a.ScorePercent
            }).ToListAsync(ct);
        return Ok(items);
    }

    // Không trả correctOption, explanation hoặc isCorrect khi chưa nộp.
    [HttpGet("{id:int}")]
    public async Task<IActionResult> Get(int id, CancellationToken ct)
    {
        if (!_learningAccess.Enabled) return StatusCode(403, new { message = "Learning API chua duoc bat tren may chu." });
        var attempt = await _db.QuizAttempts.AsNoTracking()
            .Include(a => a.Quiz).ThenInclude(q => q!.Document)
            .FirstOrDefaultAsync(a => a.Id == id && a.OwnerUserId == CurrentUserId, ct);
        if (attempt is null || attempt.Quiz is null)
            return NotFound(new { message = "Không tìm thấy lượt làm bài." });
        var questions = await _db.QuizQuestions.AsNoTracking()
            .Where(q => q.QuizId == attempt.QuizId)
            .OrderBy(q => q.Position).ToListAsync(ct);
        bool submitted = attempt.SubmittedAtUtc.HasValue;
        var answers = submitted
            ? await _db.QuizAnswers.AsNoTracking().Where(a => a.QuizAttemptId == id)
                .ToDictionaryAsync(a => a.QuestionId, ct)
            : new Dictionary<int, QuizAnswer>();
        return Ok(new
        {
            attempt.Id, attempt.QuizId,
            quizTitle = attempt.Quiz.Title,
            documentId = attempt.Quiz.DocumentId,
            documentName = attempt.Quiz.Document?.OriginalFileName,
            attempt.StartedAtUtc, attempt.SubmittedAtUtc,
            attempt.TotalQuestions,
            attempt.CorrectCount, attempt.ScorePercent,
            questions = questions.Select(q =>
            {
                answers.TryGetValue(q.Id, out var answer);
                return new
                {
                    q.Id, q.Position, q.Content,
                    q.OptionA, q.OptionB, q.OptionC, q.OptionD,
                    // Sau nộp bài mới cung cấp lựa chọn, đáp án, lời giải và nguồn.
                    selectedOption = submitted ? answer?.SelectedOption : null,
                    correctOption = submitted ? q.CorrectOption : null,
                    isCorrect = submitted ? answer?.IsCorrect : null,
                    explanation = submitted ? q.Explanation : null,
                    sourcePageNumber = submitted ? q.SourcePageNumber : (int?)null,
                    sourceExcerpt = submitted ? q.SourceExcerpt : null
                };
            }).ToList()
        });
    }

    [HttpPost("{id:int}/submit")]
    public async Task<IActionResult> Submit(int id, [FromBody] SubmitQuizAttemptRequest request,
        CancellationToken ct)
    {
        if (!_learningAccess.Enabled) return StatusCode(403, new { message = "Learning API chua duoc bat tren may chu." });
        if (request?.Answers is null)
            return BadRequest(new { message = "Danh sách answers không hợp lệ." });
        if (request.Answers.Count > 100)
            return BadRequest(new { message = "Quá nhiều đáp án được gửi." });

        // Chỉ đọc danh sách đáp án từ request; đáp án đúng luôn nằm ở database.
        var attempt = await _db.QuizAttempts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id && a.OwnerUserId == CurrentUserId, ct);
        if (attempt is null) return NotFound(new { message = "Không tìm thấy lượt làm bài." });
        if (attempt.SubmittedAtUtc.HasValue)
            return Conflict(new { message = "Lượt làm bài này đã nộp. Không thể nộp lại." });

        var questions = await _db.QuizQuestions.AsNoTracking()
            .Where(q => q.QuizId == attempt.QuizId).OrderBy(q => q.Position).ToListAsync(ct);
        if (questions.Count == 0 || questions.Count != attempt.TotalQuestions)
            return Conflict(new { message = "Số câu hỏi của đề đã thay đổi. Không thể chấm lượt này." });
        var validIds = questions.Select(q => q.Id).ToHashSet();
        var selections = new Dictionary<int, string?>();
        foreach (var answer in request.Answers)
        {
            if (answer is null || !validIds.Contains(answer.QuestionId) || selections.ContainsKey(answer.QuestionId))
                return BadRequest(new { message = "Có câu hỏi không thuộc đề hoặc bị gửi lặp." });
            var option = answer.SelectedOption?.Trim().ToUpperInvariant();
            if (!string.IsNullOrEmpty(option) && option is not ("A" or "B" or "C" or "D"))
                return BadRequest(new { message = "Đáp án chỉ được là A, B, C, D hoặc bỏ trống." });
            selections.Add(answer.QuestionId, string.IsNullOrEmpty(option) ? null : option);
        }
        var marked = questions.Select(q =>
        {
            selections.TryGetValue(q.Id, out var choice);
            return new QuizAnswer
            {
                QuizAttemptId = id,
                QuestionId = q.Id,
                SelectedOption = choice,
                IsCorrect = choice is not null && choice == q.CorrectOption
            };
        }).ToList();
        int correct = marked.Count(x => x.IsCorrect);
        decimal percent = Math.Round(100m * correct / questions.Count, 2, MidpointRounding.AwayFromZero);
        DateTime now = DateTime.UtcNow;

        // Transaction + cập nhật có điều kiện: không thể ghi hai lần nếu bấm Nộp trùng.
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        // Dùng SQL được tham số hoá để hoạt động ổn định với provider MySql.EntityFrameworkCore.
        int updated = await _db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE `quiz_attempts`
            SET `SubmittedAtUtc` = {now}, `CorrectCount` = {correct}, `ScorePercent` = {percent}
            WHERE `Id` = {id} AND `OwnerUserId` = {CurrentUserId} AND `SubmittedAtUtc` IS NULL
            """, ct);
        if (updated != 1)
        {
            await transaction.RollbackAsync(ct);
            return Conflict(new { message = "Lượt này đã được nộp từ một yêu cầu khác." });
        }
        _db.QuizAnswers.AddRange(marked);
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Ok(new { attemptId = id, correctCount = correct, totalQuestions = questions.Count,
            scorePercent = percent, submittedAtUtc = now, message = "Đã nộp bài và lưu kết quả." });
    }
}
