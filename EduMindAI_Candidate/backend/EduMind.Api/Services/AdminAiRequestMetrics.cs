using System.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace EduMind.Api.Services;

/// <summary>
/// Lightweight, process-local HTTP outcome counters for four AI generation endpoints.
/// NEVER stores user IDs, prompts, answers, tokens, secrets or request bodies.
/// Counters reset when the backend restarts; status 200 of an SSE stream is not proof
/// that the AI stream completed successfully.
/// </summary>
public sealed class AdminAiRequestMetrics
{
    private readonly object _gate = new();
    private readonly Dictionary<string, Counts> _byKind = new(StringComparer.Ordinal);
    private readonly Queue<RecentFailure> _recentFailures = new();
    public DateTime StartedAtUtc { get; } = DateTime.UtcNow;

    private sealed class Counts
    {
        public long Requests;
        public long Success;
        public long Failed;
        public long TotalDurationMs;
    }

    public sealed record CategorySnapshot(string Kind, long Requests, long Success,
        long Failed, long AverageDurationMs);
    public sealed record RecentFailure(string Kind, int Status, DateTime AtUtc);
    public sealed record MetricsSnapshot(DateTime StartedAtUtc, long Requests,
        long Success, long Failed, long AverageDurationMs,
        CategorySnapshot[] ByCategory, RecentFailure[] RecentFailures);

    public static string? DetectKind(HttpRequest request)
    {
        if (!HttpMethods.IsPost(request.Method)) return null;
        var path = request.Path.Value?.TrimEnd('/').ToLowerInvariant() ?? "";
        if (path is "/api/ai/ask" or "/api/ai/ask/stream") return "chat";
        if (path == "/api/quizzes/generate") return "quiz-generation";
        // /api/documents/{id}/summarize
        var parts = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 4 && parts[0] == "api" && parts[1] == "documents" &&
            int.TryParse(parts[2], out _) && parts[3] == "summarize") return "summarization";
        return null;
    }

    public async Task CollectAsync(HttpContext context, RequestDelegate next)
    {
        var kind = DetectKind(context.Request);
        if (kind is null) { await next(context); return; }

        var watch = Stopwatch.StartNew();
        var status = 500;
        try
        {
            await next(context);
            status = context.Response.StatusCode;
        }
        finally
        {
            watch.Stop();
            Record(kind, status, watch.ElapsedMilliseconds);
        }
    }

    private void Record(string kind, int status, long elapsedMs)
    {
        lock (_gate)
        {
            if (!_byKind.TryGetValue(kind, out var bucket))
            {
                bucket = new Counts();
                _byKind[kind] = bucket;
            }
            bucket.Requests++;
            bucket.TotalDurationMs += Math.Max(0, elapsedMs);
            if (status is >= 200 and < 400) bucket.Success++;
            else
            {
                bucket.Failed++;
                _recentFailures.Enqueue(new RecentFailure(kind, status, DateTime.UtcNow));
                while (_recentFailures.Count > 15) _recentFailures.Dequeue();
            }
        }
    }

    public MetricsSnapshot Snapshot()
    {
        lock (_gate)
        {
            long requests = _byKind.Values.Sum(x => x.Requests);
            return new MetricsSnapshot(StartedAtUtc, requests,
                _byKind.Values.Sum(x => x.Success),
                _byKind.Values.Sum(x => x.Failed),
                requests == 0 ? 0 : _byKind.Values.Sum(x => x.TotalDurationMs) / requests,
                _byKind.OrderBy(x => x.Key).Select(x => new CategorySnapshot(
                    x.Key, x.Value.Requests, x.Value.Success, x.Value.Failed,
                    x.Value.Requests == 0 ? 0 : x.Value.TotalDurationMs / x.Value.Requests)).ToArray(),
                _recentFailures.Reverse().ToArray());
        }
    }
}
