using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EduMind.Api.Controllers;

[ApiController]
[Route("api/auth")]
[Authorize]
public sealed class AuthProfileController : ControllerBase
{
    [HttpGet("me")]
    public IActionResult Me() => Ok(new
    {
        id = User.FindFirstValue(ClaimTypes.NameIdentifier),
        email = User.FindFirstValue(ClaimTypes.Email) ?? User.Identity?.Name,
        role = User.IsInRole("Admin") ? "Admin" : "Student"
    });
}
