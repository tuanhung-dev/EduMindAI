using System.ComponentModel.DataAnnotations;
using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json;
using EduMind.Api.Data;
using EduMind.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Controllers;

/// <summary>
/// ADMIN-06: operational summaries only, without prompts, private messages, tokens,
/// passwords, connection strings or arbitrary outbound network requests.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin/monitoring")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public sealed class AdminMonitoringController : ControllerBase
{
    private readonly EduMindDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly AdminAiRequestMetrics _metrics;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<AdminMonitoringController> _logger;

    public AdminMonitoringController(EduMindDbContext db, IConfiguration configuration,
        AdminAiRequestMetrics metrics, IHttpClientFactory http,
        ILogger<AdminMonitoringController> logger)
    {
        _db = db;
        _configuration = configuration;
        _metrics = metrics;
        _http = http;
        _logger = logger;
    }

    private sealed record DayCount(DateTime Date, int Total);

    [HttpGet("overview")]
    public async Task<IActionResult> Overview([FromQuery, Range(1, 30)] int days = 7,
        CancellationToken ct = default)
    {
        var utcNow = DateTime.UtcNow;
        var from = utcNow.Date.AddDays(1 - days);
        try
        {
            // Keep these as DB-side aggregates. Do not read any chat text or PDF content.
            var statuses = await _db.Documents.AsNoTracking()
                .GroupBy(d => d.Status)
                .Select(g => new { Status = g.Key, Count = g.Count() })
                .ToListAsync(ct);
            var documentsTotal = statuses.Sum(s => s.Count);
            int Count(string status) => statuses.Where(s =>
                string.Equals(s.Status, status, StringComparison.OrdinalIgnoreCase))
                .Sum(s => s.Count);

            var pendingOld = await _db.Documents.AsNoTracking().CountAsync(d =>
                (d.Status == "Queued" || d.Status == "Processing") &&
                d.CreatedAtUtc < utcNow.AddHours(-1), ct);
            var orphan = await _db.Documents.AsNoTracking().CountAsync(d => d.OwnerUserId == null, ct);
            var chunks = await _db.DocumentChunks.AsNoTracking().CountAsync(ct);
            var sessions = await _db.AiChatSessions.AsNoTracking().CountAsync(ct);
            var answers = await _db.AiChatMessages.AsNoTracking().CountAsync(m => m.Role == "assistant", ct);
            var summaries = await _db.DocumentSummaries.AsNoTracking().CountAsync(ct);
            var quizzes = await _db.Quizzes.AsNoTracking().CountAsync(ct);
            var attempts = await _db.QuizAttempts.AsNoTracking().CountAsync(a => a.SubmittedAtUtc != null, ct);

            var dailyAnswers = await _db.AiChatMessages.AsNoTracking()
                .Where(m => m.Role == "assistant" && m.CreatedAtUtc >= from)
                .GroupBy(m => m.CreatedAtUtc.Date)
                .Select(g => new DayCount(g.Key, g.Count()))
                .ToListAsync(ct);
            var dailySummaries = await _db.DocumentSummaries.AsNoTracking()
                .Where(s => s.CreatedAtUtc >= from)
                .GroupBy(s => s.CreatedAtUtc.Date)
                .Select(g => new DayCount(g.Key, g.Count()))
                .ToListAsync(ct);
            var dailyQuizzes = await _db.Quizzes.AsNoTracking()
                .Where(q => q.CreatedAtUtc >= from)
                .GroupBy(q => q.CreatedAtUtc.Date)
                .Select(g => new DayCount(g.Key, g.Count()))
                .ToListAsync(ct);
            var dailyAttempts = await _db.QuizAttempts.AsNoTracking()
                .Where(a => a.SubmittedAtUtc != null && a.SubmittedAtUtc >= from)
                .GroupBy(a => a.SubmittedAtUtc!.Value.Date)
                .Select(g => new DayCount(g.Key, g.Count()))
                .ToListAsync(ct);

            int At(IReadOnlyList<DayCount> rows, DateTime day) => rows.FirstOrDefault(x => x.Date == day)?.Total ?? 0;
            var timeline = Enumerable.Range(0, days).Select(i => from.AddDays(i)).Select(date => new
            {
                date = date.ToString("yyyy-MM-dd"),
                chatAnswers = At(dailyAnswers, date),
                summaries = At(dailySummaries, date),
                quizzesCreated = At(dailyQuizzes, date),
                attemptsSubmitted = At(dailyAttempts, date)
            }).ToArray();

            // Metadata of up to 12 problematic documents; no owner identity or document contents.
            var issues = await _db.Documents.AsNoTracking()
                .Where(d => d.Status == "Failed" ||
                    ((d.Status == "Queued" || d.Status == "Processing") &&
                     d.CreatedAtUtc < utcNow.AddHours(-1)))
                .OrderBy(d => d.Status == "Failed" ? 0 : 1)
                .ThenBy(d => d.CreatedAtUtc)
                .Take(12)
                .Select(d => new { d.Id, d.OriginalFileName, d.Status, d.CreatedAtUtc })
                .ToListAsync(ct);

            var provider = (_configuration["AI:Provider"] ?? "OpenAI").Trim();
            var configuredModel = provider.Equals("Ollama", StringComparison.OrdinalIgnoreCase)
                ? _configuration["AI:Ollama:Model"] ?? "qwen3:4b-instruct"
                : provider.Equals("OpenAI", StringComparison.OrdinalIgnoreCase)
                    ? _configuration["OpenAI:Model"] ?? "gpt-4.1-mini"
                    : "Không xác định";

            return Ok(new
            {
                checkedAtUtc = utcNow,
                dbStatus = "online",
                provider,
                configuredModel,
                periodDays = days,
                documents = new
                {
                    total = documentsTotal,
                    ready = Count("Ready"),
                    queued = Count("Queued"),
                    processing = Count("Processing"),
                    failed = Count("Failed"),
                    other = documentsTotal - Count("Ready") - Count("Queued") - Count("Processing") - Count("Failed"),
                    olderThanOneHourPending = pendingOld,
                    missingOwner = orphan,
                    indexedChunks = chunks
                },
                activity = new { chatSessions = sessions, savedAssistantReplies = answers,
                    savedSummaries = summaries, generatedQuizzes = quizzes,
                    submittedAttempts = attempts },
                timeline,
                issues,
                runtime = _metrics.Snapshot(),
                methodology = new
                {
                    note = "Lượt chat/tóm tắt/đề thi dựa trên dữ liệu đã lưu trong MySQL. Bộ đếm request HTTP chỉ tính từ khi Backend khởi động; không phải tổng token hoặc hóa đơn.",
                    statusNote = "Trạng thái Ready/Queued/Processing/Failed là giá trị hiện tại trong DB. Mốc 1 giờ tính từ lúc tải lên, không phải thời điểm bắt đầu xử lý.",
                    streamingNote = "HTTP 200 của stream không chứng minh nội dung AI đã truyền hoàn tất. Bộ đếm HTTP không phải báo cáo mức sử dụng AI có thể tính phí."
                }
            });
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Admin monitoring database summary failed");
            return StatusCode(503, new { message = "Không truy xuất được dữ liệu giám sát. Kiểm tra MySQL và log Backend." });
        }
    }

    /// <summary>
    /// A free GET /api/tags probe ONLY for loopback Ollama. No chat, embeddings,
    /// OpenAI calls, keys or private configuration values are returned.
    /// </summary>
    [HttpGet("ai-status")]
    public async Task<IActionResult> AiStatus(CancellationToken ct)
    {
        var checkedAtUtc = DateTime.UtcNow;
        var provider = (_configuration["AI:Provider"] ?? "OpenAI").Trim();
        var model = provider.Equals("Ollama", StringComparison.OrdinalIgnoreCase)
            ? (_configuration["AI:Ollama:Model"] ?? "qwen3:4b-instruct").Trim()
            : (_configuration["OpenAI:Model"] ?? "gpt-4.1-mini").Trim();
        if (!provider.Equals("Ollama", StringComparison.OrdinalIgnoreCase))
        {
            bool isOpenAi = provider.Equals("OpenAI", StringComparison.OrdinalIgnoreCase);
            return Ok(new { checkedAtUtc, provider, configuredModel = model,
                status = isOpenAi ? "not_checked" : "invalid_configuration",
                modelAvailable = (bool?)null, installedModelCount = (int?)null, latencyMs = (long?)null,
                note = isOpenAi
                    ? "Không gửi request đến OpenAI. Cấu hình OpenAI chưa được kiểm tra và có thể phát sinh phí khi sử dụng."
                    : "AI:Provider chưa hợp lệ (chỉ chấp nhận Ollama hoặc OpenAI)." });
        }

        var baseUrl = (_configuration["AI:Ollama:BaseUrl"] ?? "http://127.0.0.1:11434").Trim().TrimEnd('/');
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttp || !uri.IsLoopback ||
            uri.AbsolutePath != "/" || uri.UserInfo.Length != 0 ||
            uri.Query.Length != 0 || uri.Fragment.Length != 0)
        {
            return Ok(new { checkedAtUtc, provider, configuredModel = model,
                status = "invalid_configuration", modelAvailable = (bool?)null,
                installedModelCount = (int?)null, latencyMs = (long?)null,
                note = "Ollama BaseUrl phải là HTTP loopback hợp lệ; kiểm tra cấu hình trên máy chủ." });
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(4));
        var stopwatch = Stopwatch.StartNew();
        try
        {
            using var response = await _http.CreateClient("AdminOllamaHealth")
                .GetAsync(baseUrl + "/api/tags", HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                return Ok(new { checkedAtUtc, provider, configuredModel = model, status = "offline",
                    modelAvailable = (bool?)null, installedModelCount = (int?)null,
                    latencyMs = (long?)stopwatch.ElapsedMilliseconds,
                    note = "Ollama có phản hồi lỗi HTTP; không có request sinh nội dung AI." });
            }
            await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var json = await JsonDocument.ParseAsync(stream, cancellationToken: timeout.Token);
            var names = new List<string>();
            if (json.RootElement.ValueKind == JsonValueKind.Object &&
                json.RootElement.TryGetProperty("models", out var models) && models.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in models.EnumerateArray())
                {
                    if (item.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String)
                        names.Add(name.GetString() ?? "");
                }
            }
            var exists = names.Any(name => string.Equals(name, model, StringComparison.OrdinalIgnoreCase));
            return Ok(new { checkedAtUtc, provider, configuredModel = model,
                status = exists ? "online" : "model_missing", modelAvailable = (bool?)exists,
                installedModelCount = (int?)names.Count,
                latencyMs = (long?)stopwatch.ElapsedMilliseconds,
                note = exists ? "Ollama phản hồi và tìm thấy model cấu hình. Chưa thử suy luận."
                    : "Ollama phản hồi nhưng chưa thấy model cấu hình trong danh sách; cần kiểm tra ollama list." });
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return Ok(new { checkedAtUtc, provider, configuredModel = model, status = "offline",
                modelAvailable = (bool?)null, installedModelCount = (int?)null,
                latencyMs = (long?)stopwatch.ElapsedMilliseconds,
                note = "Ollama không phản hồi trong vòng 4 giây." });
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or IOException or OperationCanceledException)
        {
            _logger.LogWarning("Ollama monitoring probe failed: {ErrorType}", ex.GetType().Name);
            return Ok(new { checkedAtUtc, provider, configuredModel = model, status = "offline",
                modelAvailable = (bool?)null, installedModelCount = (int?)null,
                latencyMs = (long?)stopwatch.ElapsedMilliseconds,
                note = "Không xác minh được trạng thái Ollama. Kiểm tra dịch vụ và cấu hình model." });
        }
    }
}
