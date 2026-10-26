using Microsoft.AspNetCore.Authorization;

using EduMind.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/database")]
public class DatabaseController : ControllerBase
{
    private readonly EduMindDbContext _context;

    public DatabaseController(EduMindDbContext context)
    {
        _context = context;
    }

    [HttpGet("health")]
    public async Task<IActionResult> CheckConnection()
    {
        try
        {
            bool connected =
                await _context.Database.CanConnectAsync();

            if (!connected)
            {
                return StatusCode(503, new
                {
                    success = false,
                    message = "Khong the ket noi MySQL"
                });
            }

            return Ok(new
            {
                success = true,
                application = "EduMind AI",
                database = "edumind_ai",
                message = "Ket noi MySQL thanh cong"
            });
        }
        catch (Exception)
        {
            return StatusCode(503, new
            {
                success = false,
                message = "Loi ket noi database"
            });
        }
    }
}
