using System.ComponentModel.DataAnnotations;
using System.Data;
using System.Security.Claims;
using EduMind.Api.Data;
using EduMind.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Controllers;

/// <summary>
/// Bước 19: số liệu tổng hợp và quản trị tài khoản.
/// Không trả mật khẩu, token, nội dung PDF hoặc lịch sử câu trả lời riêng tư.
/// </summary>
[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/admin")]
public sealed class AdminDashboardController : ControllerBase
{
    private readonly EduMindDbContext _db;
    private readonly UserManager<EduMindUser> _users;
    private readonly ILogger<AdminDashboardController> _logger;

    public AdminDashboardController(EduMindDbContext db,
        UserManager<EduMindUser> users,
        ILogger<AdminDashboardController> logger)
    {
        _db = db;
        _users = users;
        _logger = logger;
    }

    [HttpGet("dashboard")]
    public async Task<IActionResult> Dashboard(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var beginning = DateTime.UtcNow.Date.AddDays(-6);
        var verified = await _db.Users.CountAsync(x => x.EmailConfirmed, ct);
        var locked = await _db.Users.CountAsync(x => x.LockoutEnabled &&
            x.LockoutEnd != null && x.LockoutEnd > now, ct);

        var adminRoleId = await _db.Roles.AsNoTracking()
            .Where(x => x.NormalizedName == "ADMIN")
            .Select(x => x.Id).FirstOrDefaultAsync(ct);
        var admins = adminRoleId == null ? 0 : await _db.UserRoles.AsNoTracking()
            .CountAsync(x => x.RoleId == adminRoleId, ct);

        var summary = new
        {
            TotalUsers = await _db.Users.CountAsync(ct),
            VerifiedUsers = verified,
            SuspendedUsers = locked,
            AdminUsers = admins,
            Subjects = await _db.Subjects.CountAsync(ct),
            Documents = await _db.Documents.CountAsync(ct),
            OrphanDocuments = await _db.Documents.CountAsync(x => x.OwnerUserId == null, ct),
            Quizzes = await _db.Quizzes.CountAsync(ct),
            CompletedAttempts = await _db.QuizAttempts.CountAsync(x => x.SubmittedAtUtc != null, ct),
            AverageScore = await _db.QuizAttempts
                .Where(x => x.SubmittedAtUtc != null && x.ScorePercent != null)
                .AverageAsync(x => x.ScorePercent, ct) ?? 0m
        };

        // Chỉ tải những ngày có hoạt động trong 7 ngày qua để tổng hợp biểu đồ nhỏ.
        var recent = await _db.QuizAttempts.AsNoTracking()
            .Where(x => x.SubmittedAtUtc != null && x.SubmittedAtUtc >= beginning)
            .Select(x => x.SubmittedAtUtc!.Value)
            .ToListAsync(ct);
        var byDay = Enumerable.Range(0, 7)
            .Select(i => beginning.AddDays(i))
            .Select(day => new
            {
                Date = day.ToString("yyyy-MM-dd"),
                CompletedAttempts = recent.Count(x => x.Date == day)
            }).ToArray();

        return Ok(new { summary, recentActivity = byDay,
            note = "Thống kê toàn hệ thống; không bao gồm nội dung riêng tư của tài liệu." });
    }

    [HttpGet("users")]
    public async Task<IActionResult> Users([FromQuery] string? search,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 15,
        CancellationToken ct = default)
    {
        if (page < 1 || pageSize < 1 || pageSize > 50)
            return BadRequest(new { message = "page phải >= 1; pageSize từ 1 đến 50." });
        if (search?.Length > 100)
            return BadRequest(new { message = "Từ khóa tối đa 100 ký tự." });

        var query = _db.Users.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var value = search.Trim();
            query = query.Where(x => (x.Email != null && x.Email.Contains(value)) || x.Id == value);
        }
        var total = await query.CountAsync(ct);
        var raw = await query.OrderBy(x => x.Email).ThenBy(x => x.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.Id, x.Email, x.EmailConfirmed,
                x.LockoutEnabled, x.LockoutEnd, x.AccessFailedCount })
            .ToListAsync(ct);
        var ids = raw.Select(x => x.Id).ToArray();
        var mappedRoles = await (from ur in _db.UserRoles.AsNoTracking()
            join role in _db.Roles.AsNoTracking() on ur.RoleId equals role.Id
            where ids.Contains(ur.UserId)
            select new { ur.UserId, Role = role.Name }).ToListAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var items = raw.Select(x => new
        {
            x.Id, x.Email, x.EmailConfirmed, x.AccessFailedCount,
            Suspended = x.LockoutEnabled && x.LockoutEnd.HasValue && x.LockoutEnd.Value > now,
            Role = mappedRoles.Any(r => r.UserId == x.Id && r.Role == "Admin") ? "Admin" : "Student"
        });
        return Ok(new { items, total, page, pageSize, totalPages = (int)Math.Ceiling(total / (double)pageSize) });
    }

    public sealed class StatusRequest
    {
        public bool Suspended { get; set; }
    }

    [HttpPut("users/{id}/status")]
    public async Task<IActionResult> SetStatus(string id, [FromBody] StatusRequest request)
    {
        if (id == User.FindFirstValue(ClaimTypes.NameIdentifier))
            return BadRequest(new { message = "Không thể khóa chính tài khoản đang đăng nhập." });
        var target = await _users.FindByIdAsync(id);
        if (target == null) return NotFound(new { message = "Không tìm thấy tài khoản." });
        if (await _users.IsInRoleAsync(target, "Admin"))
            return BadRequest(new { message = "Không được khóa Admin tại màn hình này." });

        var enabled = await _users.SetLockoutEnabledAsync(target, true);
        if (!enabled.Succeeded) return IdentityFailed(enabled);
        var result = await _users.SetLockoutEndDateAsync(target,
            request.Suspended ? DateTimeOffset.MaxValue : (DateTimeOffset?)null);
        if (!result.Succeeded) return IdentityFailed(result);
        if (!request.Suspended)
        {
            var reset = await _users.ResetAccessFailedCountAsync(target);
            if (!reset.Succeeded) return IdentityFailed(reset);
        }
        _logger.LogWarning("Admin {ActorId} changed suspension for account {TargetId} to {Suspended}",
            User.FindFirstValue(ClaimTypes.NameIdentifier), id, request.Suspended);
        return Ok(new { message = request.Suspended ? "Đã khóa tài khoản." : "Đã mở khóa tài khoản." });
    }

    public sealed class RoleRequest
    {
        [Required] public string Role { get; set; } = string.Empty;
    }

    [HttpPut("users/{id}/role")]
    public async Task<IActionResult> SetRole(string id, [FromBody] RoleRequest request, CancellationToken ct)
    {
        if (request.Role is not ("Student" or "Admin"))
            return BadRequest(new { message = "Chỉ hỗ trợ vai trò Student hoặc Admin." });
        if (id == User.FindFirstValue(ClaimTypes.NameIdentifier))
            return BadRequest(new { message = "Không được tự sửa vai trò của mình." });
        var target = await _users.FindByIdAsync(id);
        if (target == null) return NotFound(new { message = "Không tìm thấy tài khoản." });
        if (request.Role == "Admin" && await _users.IsLockedOutAsync(target))
            return BadRequest(new { message = "Không thể cấp quyền Admin cho tài khoản đang bị khóa." });

        // Dùng transaction chung với Identity store để tránh ghi nửa chừng.
        await using var transaction = await _db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        var hasAdmin = await _users.IsInRoleAsync(target, "Admin");
        if (hasAdmin && request.Role == "Student")
        {
            var adminRoleId = await _db.Roles.AsNoTracking()
                .Where(x => x.NormalizedName == "ADMIN").Select(x => x.Id).FirstAsync(ct);
            var adminCount = await _db.UserRoles.CountAsync(x => x.RoleId == adminRoleId, ct);
            if (adminCount <= 1)
                return Conflict(new { message = "Không thể hạ quyền quản trị viên cuối cùng." });
        }

        if (!await _users.IsInRoleAsync(target, request.Role))
        {
            var added = await _users.AddToRoleAsync(target, request.Role);
            if (!added.Succeeded) return IdentityFailed(added);
        }
        var otherRole = request.Role == "Admin" ? "Student" : "Admin";
        if (await _users.IsInRoleAsync(target, otherRole))
        {
            var removed = await _users.RemoveFromRoleAsync(target, otherRole);
            if (!removed.Succeeded) return IdentityFailed(removed);
        }
        await transaction.CommitAsync(ct);
        _logger.LogWarning("Admin {ActorId} changed role for account {TargetId} to {NewRole}",
            User.FindFirstValue(ClaimTypes.NameIdentifier), id, request.Role);
        return Ok(new { message = "Đã cập nhật vai trò tài khoản." });
    }

    private IActionResult IdentityFailed(IdentityResult _) =>
        StatusCode(500, new { message = "Không thể cập nhật tài khoản. Vui lòng kiểm tra log Backend." });
}
