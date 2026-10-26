
using Microsoft.AspNetCore.Mvc;

namespace EduMind.Api.Controllers
{
    [ApiController]
    [Route("api/health")]
    public class HealthController : ControllerBase
    {
        [HttpGet]
        public IActionResult Get()
        {
            return Ok(new
            {
                success = true,
                message = "EduMind AI Backend dang hoat dong",
                version = "1.0.0",
                status = "online"
            });
        }
    }
}
