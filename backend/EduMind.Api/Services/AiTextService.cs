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

    public AiTextService(HttpClient client, IConfiguration config)
    {
        _client = client;
        _config = config;
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

        int numCtx = 8192;
        if (int.TryParse(_config["AI:Ollama:NumCtx"], out int configuredCtx) &&
            configuredCtx is >= 2048 and <= 16384)
            numCtx = configuredCtx;

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
        {
            var hint = response.StatusCode == System.Net.HttpStatusCode.NotFound
                ? $"Khong tim thay model {model}. Chay: ollama pull {model}"
                : $"Ollama tra HTTP {(int)response.StatusCode}. Kiem tra Ollama dang chay va RAM/VRAM.";
            throw new AiGenerationException(502, hint);
        }

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
                options = new { num_ctx = 8192, num_predict = maxTokens, temperature = 0.2 }
            })
        };
        using var response = await _client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!response.IsSuccessStatusCode)
            throw new AiGenerationException(502, $"Ollama streaming HTTP {(int)response.StatusCode}.");
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);
        bool completed = false;
        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            using var json = JsonDocument.Parse(line);
            if (json.RootElement.TryGetProperty("error", out var error))
                throw new AiGenerationException(502, "Ollama streaming error: " + error.ToString());
            if (json.RootElement.TryGetProperty("message", out var msg) &&
                msg.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.String)
            {
                string? delta = content.GetString();
                if (!string.IsNullOrEmpty(delta)) yield return delta;
            }
            if (json.RootElement.TryGetProperty("done", out var done) && done.ValueKind == JsonValueKind.True)
            { completed = true; break; }
        }
        if (!completed) throw new AiGenerationException(502, "Ollama stream interrupted before completion.");
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
