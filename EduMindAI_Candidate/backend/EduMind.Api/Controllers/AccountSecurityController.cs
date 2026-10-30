using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text;
using EduMind.Api.Models;
using EduMind.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;

namespace EduMind.Api.Controllers;

public class EmailOnlyRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = string.Empty;
}

public sealed class AccountLoginRequest : EmailOnlyRequest
{
    [Required]
    public string Password { get; set; } = string.Empty;
}

public sealed class ConfirmEmailRequest
{
    [Required] public string UserId { get; set; } = string.Empty;
    [Required] public string Code { get; set; } = string.Empty;
}

public sealed class ResetPasswordRequest : EmailOnlyRequest
{
    [Required] public string Code { get; set; } = string.Empty;
    [Required] public string NewPassword { get; set; } = string.Empty;
}

public sealed class ChangePasswordRequest
{
    [Required] public string CurrentPassword { get; set; } = string.Empty;
    [Required] public string NewPassword { get; set; } = string.Empty;
}

/// <summary>
/// Explicit account endpoints replace MapIdentityApi; the latter exposes /register
/// without the project's Student-role assignment policy.
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class AccountSecurityController : ControllerBase
{
    private readonly UserManager<EduMindUser> _users;
    private readonly SignInManager<EduMindUser> _signIn;
    private readonly IAccountEmailSender _email;
    private readonly IConfiguration _configuration;

    public AccountSecurityController(
        UserManager<EduMindUser> users,
        SignInManager<EduMindUser> signIn,
        IAccountEmailSender email,
        IConfiguration configuration)
    {
        _users = users;
        _signIn = signIn;
        _email = email;
        _configuration = configuration;
    }

    [AllowAnonymous, EnableRateLimiting("account-strict")]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] AccountLoginRequest request)
    {
        var user = await _users.FindByEmailAsync(request.Email.Trim());
        if (user is null)
            return Unauthorized(new { message = "Email hoặc mật khẩu không đúng, hoặc tài khoản đang bị khóa." });

        var result = await _signIn.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: true);
        if (!result.Succeeded)
            return Unauthorized(new { message = "Email hoặc mật khẩu không đúng, hoặc tài khoản đang bị khóa." });

        var principal = await _signIn.CreateUserPrincipalAsync(user);
        await HttpContext.SignInAsync(IdentityConstants.BearerScheme, principal);
        // The bearer handler writes the JSON token response to the HTTP body.
        return new EmptyResult();
    }

    [AllowAnonymous, EnableRateLimiting("account-strict")]
    [HttpPost("confirm-email")]
    public async Task<IActionResult> ConfirmEmail([FromBody] ConfirmEmailRequest request)
    {
        var user = await _users.FindByIdAsync(request.UserId);
        if (user is null || !TryDecode(request.Code, out var token))
            return BadRequest(new { message = "Liên kết xác minh không hợp lệ hoặc đã hết hạn." });
        var result = await _users.ConfirmEmailAsync(user, token);
        return result.Succeeded
            ? Ok(new { message = "Xác minh email thành công. Bạn có thể đăng nhập." })
            : BadRequest(new { message = "Liên kết xác minh không hợp lệ hoặc đã hết hạn." });
    }

    [AllowAnonymous, EnableRateLimiting("account-email")]
    [HttpPost("resend-confirmation")]
    public async Task<IActionResult> Resend([FromBody] EmailOnlyRequest request, CancellationToken ct)
    {
        var user = await _users.FindByEmailAsync(request.Email.Trim());
        if (user is not null && !await _users.IsEmailConfirmedAsync(user))
        {
            try { await SendConfirmationAsync(user, ct); }
            catch (Exception) when (!ct.IsCancellationRequested)
            {
                // Same outward response regardless of whether address exists or mail fails.
            }
        }
        return Ok(new { message = "Nếu tài khoản cần xác minh, hướng dẫn đã được gửi." });
    }

    [AllowAnonymous, EnableRateLimiting("account-email")]
    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] EmailOnlyRequest request, CancellationToken ct)
    {
        var user = await _users.FindByEmailAsync(request.Email.Trim());
        if (user is not null)
        {
            var code = Encode(await _users.GeneratePasswordResetTokenAsync(user));
            var link = BuildLink("reset-password", ("email", user.Email ?? ""), ("code", code));
            try
            {
                await _email.SendAsync(user.Email!, "EduMind AI - Dat lai mat khau",
                    $"Ban da yeu cau dat lai mat khau. Mo lien ket (neu do ban yeu cau):\n{link}\n\nNeu khong yeu cau, hay bo qua email nay.", ct);
            }
            catch (Exception) when (!ct.IsCancellationRequested)
            {
                // Keep anti-enumeration response identical if SMTP is temporarily unavailable.
            }
        }
        return Ok(new { message = "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi." });
    }

    [AllowAnonymous, EnableRateLimiting("account-strict")]
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        var user = await _users.FindByEmailAsync(request.Email.Trim());
        if (user is null || !TryDecode(request.Code, out var token))
            return BadRequest(new { message = "Yêu cầu đặt lại mật khẩu không hợp lệ hoặc đã hết hạn." });

        var result = await _users.ResetPasswordAsync(user, token, request.NewPassword);
        return result.Succeeded
            ? Ok(new { message = "Đã cập nhật mật khẩu. Hãy đăng nhập lại." })
            : BadRequest(new { message = "Không thể đặt lại mật khẩu. Kiểm tra liên kết và yêu cầu mật khẩu." });
    }

    [Authorize, EnableRateLimiting("account-strict")]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var user = id is null ? null : await _users.FindByIdAsync(id);
        if (user is null) return Unauthorized();
        var result = await _users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        return result.Succeeded
            ? Ok(new { message = "Đổi mật khẩu thành công. Vui lòng đăng nhập lại." })
            : BadRequest(new { message = "Mật khẩu hiện tại không chính xác hoặc mật khẩu mới chưa đạt yêu cầu." });
    }

    [NonAction]
    public async Task SendConfirmationAsync(EduMindUser user, CancellationToken ct)
    {
        var code = Encode(await _users.GenerateEmailConfirmationTokenAsync(user));
        var link = BuildLink("confirm-email", ("userId", user.Id), ("code", code));
        await _email.SendAsync(user.Email!, "EduMind AI - Xac minh email",
            $"Cam on ban da dang ky EduMind AI. Xac minh email tai day:\n{link}\n\nNeu ban khong dang ky, hay bo qua email nay.", ct);
    }

    private string BuildLink(string route, params (string Key, string Value)[] items)
    {
        // Server-managed config ONLY. Never trust Host/Origin/returnUrl supplied by clients.
        var baseUrl = (_configuration["Frontend:BaseUrl"] ?? "http://127.0.0.1:5173").TrimEnd('/');
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttps &&
             !(uri.Scheme == Uri.UriSchemeHttp && (uri.IsLoopback))))
            throw new InvalidOperationException("Frontend:BaseUrl must use HTTPS or localhost HTTP.");
        var query = string.Join("&", items.Select(pair =>
            $"{Uri.EscapeDataString(pair.Key)}={Uri.EscapeDataString(pair.Value)}"));
        return $"{baseUrl}/{route}?{query}";
    }

    private static string Encode(string token) => WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

    private static bool TryDecode(string code, out string token)
    {
        token = string.Empty;
        try
        {
            if (code.Length > 4096) return false;
            token = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
            return true;
        }
        catch (FormatException) { return false; }
        catch (ArgumentException) { return false; }
    }
}
