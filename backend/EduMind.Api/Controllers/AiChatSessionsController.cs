using System.Security.Claims;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using EduMind.Api.Data;
using EduMind.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/ai/chats")]
public sealed class AiChatSessionsController : ControllerBase
{
    private readonly EduMindDbContext _db;
    private readonly LearningApiAccess _access;
    private string UserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    public AiChatSessionsController(EduMindDbContext db, LearningApiAccess access)
    {
        _db = db;
        _access = access;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int documentId, CancellationToken ct)
    {
        if (!_access.Enabled) return StatusCode(403);
        if (documentId <= 0) return BadRequest("Cần chọn tài liệu.");
        if (!await _db.Documents.AsNoTracking().AnyAsync(d => d.Id == documentId && (d.OwnerUserId == UserId || (User.IsInRole("Admin") && d.OwnerUserId != null)), ct))
            return NotFound();
        var sessions = await _db.AiChatSessions.AsNoTracking()
            .Where(c => c.DocumentId == documentId && c.OwnerUserId == UserId)
            .OrderByDescending(c => c.IsPinned).ThenByDescending(c => c.UpdatedAtUtc).Take(100)
            .Select(c => new { c.Id, c.DocumentId, c.Title, c.IsPinned, c.CreatedAtUtc, c.UpdatedAtUtc })
            .ToListAsync(ct);
        return Ok(sessions);
    }

    [HttpGet("{id:int}")]
    public async Task<IActionResult> Detail(int id, CancellationToken ct)
    {
        if (!_access.Enabled) return StatusCode(403);
        var session = await _db.AiChatSessions.AsNoTracking()
            .Where(s => s.Id == id && s.OwnerUserId == UserId &&
                (s.Document!.OwnerUserId == UserId || (User.IsInRole("Admin") && s.Document!.OwnerUserId != null)))
            .Select(s => new { s.Id, s.DocumentId, s.Title, s.IsPinned, s.CreatedAtUtc, s.UpdatedAtUtc })
            .FirstOrDefaultAsync(ct);
        if (session == null) return NotFound();
        var items = await _db.AiChatMessages.AsNoTracking()
            .Where(m => m.AiChatSessionId == id)
            .OrderBy(m => m.Id)
            .Take(200)
            .Select(m => new { m.Id, m.Role, m.Content, m.SourcesJson, m.CreatedAtUtc })
            .ToListAsync(ct);
        return Ok(new
        {
            session.Id, session.DocumentId, session.Title, session.IsPinned, session.CreatedAtUtc, session.UpdatedAtUtc,
            messages = items.Select(m => new {
                m.Id, m.Role, m.Content, m.CreatedAtUtc,
                sources = DeserializeSources(m.SourcesJson)
            })
        });
    }

    // C1: Update only the signed-in owner's session, never another user's.
    public sealed record RenameChatRequest([property: Required, StringLength(180, MinimumLength = 1)] string Title);
    public sealed record PinChatRequest(bool IsPinned);

    [HttpPut("{id:int}/title")]
    public async Task<IActionResult> Rename(int id, [FromBody] RenameChatRequest request, CancellationToken ct)
    {
        if (!_access.Enabled) return StatusCode(403);
        var title = request.Title?.Trim() ?? "";
        if (title.Length is < 1 or > 180) return BadRequest("Tên cuộc trò chuyện phải dài từ 1 đến 180 ký tự.");
        var session = await _db.AiChatSessions.FirstOrDefaultAsync(
            c => c.Id == id && c.OwnerUserId == UserId && c.Document != null &&
                (c.Document.OwnerUserId == UserId || (User.IsInRole("Admin") && c.Document.OwnerUserId != null)), ct);
        if (session is null) return NotFound();
        session.Title = title;
        await _db.SaveChangesAsync(ct);
        return Ok(new { session.Id, session.Title, session.IsPinned, session.UpdatedAtUtc });
    }

    [HttpPut("{id:int}/pin")]
    public async Task<IActionResult> Pin(int id, [FromBody] PinChatRequest request, CancellationToken ct)
    {
        if (!_access.Enabled) return StatusCode(403);
        var session = await _db.AiChatSessions.FirstOrDefaultAsync(
            c => c.Id == id && c.OwnerUserId == UserId && c.Document != null &&
                (c.Document.OwnerUserId == UserId || (User.IsInRole("Admin") && c.Document.OwnerUserId != null)), ct);
        if (session is null) return NotFound();
        session.IsPinned = request.IsPinned;
        await _db.SaveChangesAsync(ct);
        return Ok(new { session.Id, session.Title, session.IsPinned, session.UpdatedAtUtc });
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        if (!_access.Enabled) return StatusCode(403);
        var chat = await _db.AiChatSessions
            .FirstOrDefaultAsync(c => c.Id == id && c.OwnerUserId == UserId, ct);
        if (chat == null) return NotFound();
        _db.AiChatSessions.Remove(chat);
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static object DeserializeSources(string json)
    {
        try { return JsonSerializer.Deserialize<JsonElement>(json); }
        catch (JsonException) { return Array.Empty<object>(); }
    }
}
