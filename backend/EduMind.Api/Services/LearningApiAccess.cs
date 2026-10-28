namespace EduMind.Api.Services;

/// <summary>
/// Keeps the learning APIs available for local development while requiring an
/// explicit opt-in on a deployed server. Authentication and per-resource owner
/// checks in each controller remain mandatory in BOTH environments.
/// </summary>
public sealed class LearningApiAccess
{
    private readonly IWebHostEnvironment _environment;
    private readonly IConfiguration _configuration;

    public LearningApiAccess(IWebHostEnvironment environment, IConfiguration configuration)
    {
        _environment = environment;
        _configuration = configuration;
    }

    public bool Enabled => _environment.IsDevelopment() ||
        _configuration.GetValue<bool>("Features:EnableLearningApi", false);
}
