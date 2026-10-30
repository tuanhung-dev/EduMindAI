using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Net.Http.Json;
using System.Text.Json;

namespace EduMind.Api.Services;

/// <summary>AI text generation for EduMind AI. Default remains OpenAI unless AI:Provider=Ollama.</summary>
public sealed class AiTextService
{
    private readonly HttpClient _client;
    private readonly IConfiguration _config;
    private readonly ILogger<AiTextService> _logger;

    // Shared tutor budget for standard and streaming answers. Does not affect quiz/summary calls.
    public int TutorMaxOutputTokens => Math.Clamp(
        _config.GetValue<int?>("AI:Tutor:MaxOutputTokens") ?? 2200, 512, 4096);

    // Respect the same context setting for non-streaming and streaming Ollama calls.
    private int OllamaContextTokens => Math.Clamp(
        _config.GetValue<int?>("AI:Ollama:NumCtx") ?? 4096, 2048, 32768);

    public AiTextService(HttpClient client, IConfiguration config, ILogger<AiTextService> logger)
    {
        _client = client;
        _config = config;
        _logger = logger;
        // A local model may need several minutes to load and generate. Set before
        // the first request on this typed HttpClient instance (no Program.cs edit).
        var timeoutSeconds = Math.Clamp(config.GetValue<int?>("AI:Ollama:TimeoutSeconds") ?? 900, 60, 1800);
        _client.Timeout = TimeSpan.FromSeconds(timeoutSeconds);
    }

    public async Task<string> GenerateAsync(
        string instructions,
        string input,
        int maxOutputTokens,
        CancellationToken cancellationToken,
        object? jsonSchema = null)
    {
        var provider = _config["AI:Provider"]?.Trim() ?? "OpenAI";
        try
        {
            if (provider.Equals("Ollama", StringComparison.OrdinalIgnoreCase))
                return await GenerateWithOllamaAsync(instructions, input, maxOutputTokens, jsonSchema, cancellationToken);

            if (provider.Equals("OpenAI", StringComparison.OrdinalIgnoreCase))
                return await GenerateWithOpenAiAsync(instructions, input, maxOutputTokens, jsonSchema, cancellationToken);

            throw new AiGenerationException(503, "AI:Provider phai la Ollama hoac OpenAI.");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new AiGenerationException(504, $"{provider} phan hoi qua cham. Thu lai voi tai lieu ngan hon.");
        }
        catch (HttpRequestException)
        {
            throw new AiGenerationException(502, $"Khong ket noi duoc {provider}. Kiem tra dich vu dang chay.");
        }
        catch (JsonException)
        {
            throw new AiGenerationException(502, $"{provider} tra ve phan hoi khong dung dinh dang.");
        }
    }

    private async Task<string> GenerateWithOllamaAsync(
        string instructions, string input, int maxTokens, object? jsonSchema, CancellationToken ct)
    {
        var baseUrl = (_config["AI:Ollama:BaseUrl"] ?? "http://127.0.0.1:11434").TrimEnd('/');
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttp || !uri.IsLoopback ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            throw new AiGenerationException(503, "AI:Ollama:BaseUrl phai la dia chi HTTP loopback cua laptop.");

        var model = _config["AI:Ollama:Model"]?.Trim();
        if (string.IsNullOrWhiteSpace(model)) model = "qwen3:4b-instruct";

        int numCtx = OllamaContextTokens;

        var payload = new Dictionary<string, object?>
        {
            ["model"] = model,
            ["stream"] = false,
            ["messages"] = new object[]
            {
                new { role = "system", content = instructions },
                new { role = "user", content = input }
            },
            ["options"] = new { num_ctx = numCtx, num_predict = maxTokens, temperature = jsonSchema is null ? 0.25 : 0.1 }
        };
        if (jsonSchema is not null) payload["format"] = jsonSchema;

        using var response = await _client.PostAsJsonAsync($"{baseUrl}/api/chat", payload, ct);
        if (!response.IsSuccessStatusCode)
            throw await CreateOllamaExceptionAsync(response, model, ct);

        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        if (!json.RootElement.TryGetProperty("message", out var message) ||
            !message.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.String)
            throw new AiGenerationException(502, "Ollama khong tra ve noi dung cau tra loi.");

        return RequiredText(content.GetString(), "Ollama");
    }

    private async Task<string> GenerateWithOpenAiAsync(
        string instructions, string input, int maxTokens, object? jsonSchema, CancellationToken ct)
    {
        var key = _config["OpenAI:ApiKey"]?.Trim();
        if (string.IsNullOrWhiteSpace(key))
            throw new AiGenerationException(503, "Chua cau hinh OpenAI:ApiKey. Hoac dat AI:Provider=Ollama.");

        var model = _config["OpenAI:Model"]?.Trim();
        if (string.IsNullOrWhiteSpace(model)) model = "gpt-4.1-mini";

        var payload = new Dictionary<string, object?>
        {
            ["model"] = model,
            ["instructions"] = instructions,
            ["input"] = input,
            ["max_output_tokens"] = maxTokens,
            ["store"] = false
        };
        if (jsonSchema is not null)
            payload["text"] = new { format = new { type = "json_schema", name = "edumind_quiz", strict = true, schema = jsonSchema } };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        request.Content = JsonContent.Create(payload);
        using var response = await _client.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            var hint = (int)response.StatusCode switch
            {
                401 => "OpenAI API Key bi tu choi. Kiem tra khoa.",
                429 => "OpenAI het credit hoac vuot han muc. Hay chon AI:Provider=Ollama.",
                _ => $"OpenAI tra HTTP {(int)response.StatusCode}."
            };
            throw new AiGenerationException(502, hint);
        }
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        var parts = new List<string>();
        if (json.RootElement.TryGetProperty("output", out var output) && output.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in output.EnumerateArray())
            {
                if (!item.TryGetProperty("content", out var contents) || contents.ValueKind != JsonValueKind.Array)
                    continue;
                foreach (var part in contents.EnumerateArray())
                {
                    if (part.TryGetProperty("type", out var type) && type.GetString() == "output_text" &&
                        part.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String)
                        parts.Add(text.GetString() ?? "");
                }
            }
        }
        return RequiredText(string.Join("\n", parts), "OpenAI");
    }

    public bool SupportsStreaming => (_config["AI:Provider"] ?? "OpenAI")
        .Equals("Ollama", StringComparison.OrdinalIgnoreCase);

    // Ollama emits one JSON object per line. Forward only actual message.content,
    // never expose model reasoning or raw protocol frames to the browser.
    public async IAsyncEnumerable<string> StreamOllamaAsync(
        string instructions, string input, int maxTokens,
        [EnumeratorCancellation] CancellationToken ct)
    {
        if (!SupportsStreaming)
            throw new AiGenerationException(409, "Streaming requires Ollama.");
        var baseUrl = (_config["AI:Ollama:BaseUrl"] ?? "http://127.0.0.1:11434").Trim().TrimEnd('/');
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) || uri.Scheme != "http" ||
            !uri.IsLoopback || uri.AbsolutePath != "/" || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new AiGenerationException(503, "Ollama must use a local HTTP address.");
        var model = _config["AI:Ollama:Model"]?.Trim();
        if (string.IsNullOrWhiteSpace(model)) model = "qwen3:4b-instruct";
        using var request = new HttpRequestMessage(HttpMethod.Post, baseUrl + "/api/chat")
        {
            Content = JsonContent.Create(new {
                model, stream = true,
                messages = new object[] { new { role = "system", content = instructions }, new { role = "user", content = input } },
                options = new { num_ctx = OllamaContextTokens, num_predict = maxTokens, temperature = 0.2 }
            })
        };
        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
            throw await CreateOllamaExceptionAsync(response, model, ct);
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);
        bool completed = false;
        bool hasVisibleOutput = false;
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            using var json = JsonDocument.Parse(line);
            if (json.RootElement.TryGetProperty("error", out var streamError))
            {
                var detail = SafeOllamaError(streamError.ValueKind == JsonValueKind.String
                    ? streamError.GetString() : null);
                _logger.LogWarning("Ollama streaming error, model={Model}, detail={Detail}", model, detail);
                throw new AiGenerationException(502, BuildOllamaHint(502, model, detail));
            }
            if (json.RootElement.TryGetProperty("message", out var msg) &&
                msg.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.String)
            {
                string? delta = content.GetString();
                if (!string.IsNullOrEmpty(delta))
                {
                    hasVisibleOutput = true;
                    yield return delta;
                }
            }
            if (json.RootElement.TryGetProperty("done", out var done) && done.ValueKind == JsonValueKind.True)
            {
                completed = true;
                if (json.RootElement.TryGetProperty("done_reason", out var reason) &&
                    reason.ValueKind == JsonValueKind.String && reason.GetString() == "length")
                    throw new AiGenerationException(502, "Ollama đã chạm giới hạn token trước khi trả lời xong. Hãy giảm ngữ cảnh hoặc tăng AI:Tutor:MaxOutputTokens.");
                break;
            }
        }
        if (!completed)
            throw new AiGenerationException(502, "Luồng Ollama bị ngắt trước khi hoàn tất. Kiểm tra thời gian chờ và trạng thái Ollama.");
        if (!hasVisibleOutput)
            throw new AiGenerationException(502, "Ollama không tạo nội dung trả lời. Kiểm tra model hoặc tăng giới hạn output token.");
    }

    // Ollama reports errors in { "error": "..." }. Never infer RAM problems
    // from the HTTP status alone. The response body is not an instruction.
    private async Task<AiGenerationException> CreateOllamaExceptionAsync(
        HttpResponseMessage response, string model, CancellationToken ct)
    {
        string? raw = null;
        try { raw = await response.Content.ReadAsStringAsync(ct); }
        catch (HttpRequestException) { /* Keep the HTTP status as fallback. */ }
        string? detail = null;
        if (!string.IsNullOrWhiteSpace(raw))
        {
            try
            {
                using var parsed = JsonDocument.Parse(raw);
                if (parsed.RootElement.ValueKind == JsonValueKind.Object &&
                    parsed.RootElement.TryGetProperty("error", out var error) &&
                    error.ValueKind == JsonValueKind.String)
                    detail = error.GetString();
            }
            catch (JsonException) { /* A reverse proxy might return HTML. */ }
        }
        var safeDetail = SafeOllamaError(detail);
        _logger.LogWarning("Ollama /api/chat returned HTTP {Status}, model={Model}, error={Error}",
            (int)response.StatusCode, model, safeDetail);
        return new AiGenerationException(502,
            BuildOllamaHint((int)response.StatusCode, model, safeDetail));
    }

    // Log a short single-line description. Never log raw JSON, prompt, or tokens.
    private static string SafeOllamaError(string? detail)
    {
        if (string.IsNullOrWhiteSpace(detail)) return "(không có mô tả lỗi)";
        var clean = new string(detail.Select(ch => char.IsControl(ch) ? ' ' : ch).ToArray()).Trim();
        return clean.Length > 240 ? clean[..240] + "…" : clean;
    }

    private static string BuildOllamaHint(int status, string model, string detail)
    {
        if (status == 404 || detail.Contains("not found", StringComparison.OrdinalIgnoreCase) ||
            detail.Contains("does not exist", StringComparison.OrdinalIgnoreCase))
            return $"Không tìm thấy model '{model}'. Chạy 'ollama list' và đặt AI__Ollama__Model đúng tên model đã tải.";
        if (detail.Contains("memory", StringComparison.OrdinalIgnoreCase) ||
            detail.Contains("allocat", StringComparison.OrdinalIgnoreCase) ||
            detail.Contains("out of memory", StringComparison.OrdinalIgnoreCase))
            return "Ollama báo thiếu bộ nhớ cho model/ngữ cảnh. Thử giảm AI__Ollama__NumCtx xuống 2048 hoặc chọn model nhỏ hơn.";
        if (detail.Contains("context", StringComparison.OrdinalIgnoreCase))
            return "Ollama báo lỗi giới hạn context. Thử AI__Ollama__NumCtx=2048, giảm số đoạn RAG và thử lại.";
        if (detail.Contains("template", StringComparison.OrdinalIgnoreCase) ||
            detail.Contains("invalid", StringComparison.OrdinalIgnoreCase) ||
            detail.Contains("unsupported", StringComparison.OrdinalIgnoreCase))
            return "Ollama không chấp nhận định dạng/tham số của request. Kiểm tra log Backend để xem chi tiết lỗi thật.";
        return $"Ollama trả HTTP {status}. Xem lỗi gốc trong log Backend hoặc chạy script kiểm tra /api/chat để biết nguyên nhân.";
    }

    private static string RequiredText(string? output, string provider)
    {
        if (string.IsNullOrWhiteSpace(output))
            throw new AiGenerationException(502, $"{provider} khong tra ve noi dung. Thu lai voi tai lieu ngan hon.");
        return output.Trim();
    }
}

public sealed class AiGenerationException : Exception
{
    public int StatusCode { get; }
    public AiGenerationException(int statusCode, string message) : base(message)
        => StatusCode = statusCode;
}
