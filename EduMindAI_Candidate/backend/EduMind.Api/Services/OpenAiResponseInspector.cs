using System.Net.Http;
using System.Text.Json;

namespace EduMind.Api.Services;

/// <summary>
/// Phân tích lỗi của upstream mà không trả HTML/raw body (có thể chứa dữ liệu nhạy cảm)
/// về phía trình duyệt. Giữ x-request-id để đối chiếu với OpenAI Support.
/// </summary>
public static class OpenAiResponseInspector
{
    public static object PublicError(HttpResponseMessage response, string rawBody, string message)
    {
        string? upstreamMessage = null;
        string? errorCode = null;
        string? errorParam = null;
        string? errorType = null;
        var contentType = response.Content.Headers.ContentType?.MediaType;

        try
        {
            using var json = JsonDocument.Parse(rawBody);
            var root = json.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                var error = root;
                if (root.TryGetProperty("error", out var child))
                    error = child;

                if (error.ValueKind == JsonValueKind.Object)
                {
                    upstreamMessage = GetString(error, "message") ?? GetString(root, "message");
                    errorCode = GetString(error, "code");
                    errorParam = GetString(error, "param");
                    errorType = GetString(error, "type");
                }
                else if (error.ValueKind == JsonValueKind.String)
                {
                    upstreamMessage = error.GetString();
                }
                upstreamMessage ??= GetString(root, "message");
            }
        }
        catch (JsonException)
        {
            // HTTP 400 dạng HTML/text thường là phản hồi từ proxy/gateway hoặc
            // endpoint trả lỗi không theo chuẩn JSON. Không đoán sai nội dung.
        }

        if (string.IsNullOrWhiteSpace(upstreamMessage))
        {
            var format = string.IsNullOrWhiteSpace(rawBody)
                ? "rỗng"
                : "không phải JSON có thể đọc được";
            upstreamMessage = $"Phản hồi từ dịch vụ là {format}. " +
                "Hãy kiểm tra API key/model, kết nối mạng và proxy của máy Backend. " +
                "Nếu có Request ID, dùng ID đó để tra cứu lỗi.";
        }

        string? requestId = null;
        if (response.Headers.TryGetValues("x-request-id", out var values))
        {
            var candidate = values.FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(candidate) &&
                candidate.Length <= 120 &&
                candidate.All(ch => char.IsAsciiLetterOrDigit(ch) || ch is '-' or '_'))
                requestId = candidate;
        }

        // Không trả nội dung raw HTML/text (có thể do proxy sinh ra),
        // không log Authorization header và không trả khóa bí mật.
        return new
        {
            message,
            upstreamStatus = (int)response.StatusCode,
            upstreamMessage = Limit(upstreamMessage, 450),
            errorCode = Limit(errorCode, 100),
            errorParam = Limit(errorParam, 100),
            errorType = Limit(errorType, 100),
            upstreamContentType = Limit(contentType, 100),
            upstreamRequestId = requestId
        };
    }

    private static string? GetString(JsonElement value, string key) =>
        value.TryGetProperty(key, out var property) &&
        property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static string? Limit(string? value, int maxLength) =>
        value is null || value.Length <= maxLength ? value : value[..maxLength] + "…";
}
