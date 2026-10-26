using System.ComponentModel.DataAnnotations;
using EduMind.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace EduMind.Api.Controllers;

public sealed class EduMindRegisterRequest
{
    [Required, EmailAddress, MaxLength(254)]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Password { get; set; } = string.Empty;
}

[ApiController]
[Route("api/auth")]
public sealed class RegistrationController : ControllerBase
{
    private readonly UserManager<EduMindUser> _users;

    public RegistrationController(UserManager<EduMindUser> users)
    {
        _users = users;
    }

    [AllowAnonymous, EnableRateLimiting("account-strict")]
    [HttpPost("signup")]
    public async Task<IActionResult> SignUp([FromBody] EduMindRegisterRequest request)
    {
        var email = request.Email.Trim();
        var user = new EduMindUser { UserName = email, Email = email, EmailConfirmed = false };
        var created = await _users.CreateAsync(user, request.Password);
        if (!created.Succeeded)
            return BadRequest(new
            {
                message = "Không thể đăng ký tài khoản.",
                errors = created.Errors.Select(x => x.Description).ToArray()
            });

        var assigned = await _users.AddToRoleAsync(user, "Student");
        if (!assigned.Succeeded)
        {
            await _users.DeleteAsync(user);
            return StatusCode(500, new { message = "Không gán được quyền học viên." });
        }

        // Không yêu cầu xác minh email ở giai đoạn demo. Giữ EmailConfirmed=false
        // để không ghi nhận sai rằng người dùng đã xác minh địa chỉ email.
        // Không gửi mail, không trả token; sau đăng ký chuyển sang /login.
        return Ok(new { message = "Đăng ký thành công. Bạn có thể đăng nhập ngay." });
    }
}
