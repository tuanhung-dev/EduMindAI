using System.Security.Claims;
using System.Threading.RateLimiting;
using EduMind.Api.Controllers;
using EduMind.Api.Data;
using EduMind.Api.Models;
using EduMind.Api.Services;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();

// Chuoi ket noi duoc luu ngoai ma nguon qua User Secrets (Development)
// hoac bien moi truong ConnectionStrings__DefaultConnection. Khong log mat khau.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        $"Thiếu ConnectionStrings:DefaultConnection (môi trường: {builder.Environment.EnvironmentName}). " +
        "Trên máy phát triển, chạy Scripts/02_CauHinh_MySQL.ps1 của gói sửa lỗi, " +
        "hoặc thiết lập .NET User Secrets cho đúng EduMind.Api.csproj rồi chạy với Development. " +
        "Không gửi chuỗi kết nối hoặc mật khẩu lên chat.");
}
builder.Services.AddDbContext<EduMindDbContext>(options => options.UseMySQL(connectionString));

builder.Services.AddIdentityApiEndpoints<EduMindUser>(options =>
{
    options.Password.RequiredLength = 10;
    options.Password.RequireUppercase = true;
    options.Password.RequireLowercase = true;
    options.Password.RequireDigit = true;
    options.Password.RequireNonAlphanumeric = true;
    options.User.RequireUniqueEmail = true;
    options.SignIn.RequireConfirmedEmail = false; // Development: đăng ký xong được đăng nhập ngay.
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
    options.Lockout.MaxFailedAccessAttempts = 5;
})
.AddRoles<IdentityRole>()
.AddEntityFrameworkStores<EduMindDbContext>();

builder.Services.Configure<BearerTokenOptions>(IdentityConstants.BearerScheme, options =>
{
    options.BearerTokenExpiration = TimeSpan.FromMinutes(20);
    options.RefreshTokenExpiration = TimeSpan.FromHours(8);
});
builder.Services.AddAuthorization();
builder.Services.AddSingleton<LearningApiAccess>();

// Do not map MapIdentityApi: it exposes a second public /register endpoint
// that would bypass the Student role registration policy.
builder.Services.AddScoped<AccountSecurityController>();
builder.Services.AddScoped<IAccountEmailSender, AccountEmailSender>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("account-strict", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: "strict:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 8, Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0, AutoReplenishment = true
        }));
    options.AddPolicy("account-email", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: "email:" + (context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 3, Window = TimeSpan.FromMinutes(5),
            QueueLimit = 0, AutoReplenishment = true
        }));

    // Expensive local AI calls are limited per authenticated account.
    // No queue: clients receive HTTP 429 and can retry later.
    options.AddPolicy("ai-heavy", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: "ai:" + (context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 6, Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0, AutoReplenishment = true
        }));
    options.AddPolicy("pdf-write", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: "pdf:" + (context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 12, Window = TimeSpan.FromMinutes(10),
            QueueLimit = 0, AutoReplenishment = true
        }));
});

// Production frontend origins must be explicitly listed in configuration.
// Example: Cors__AllowedOrigins__0=https://your-frontend.example
var configuredOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? Array.Empty<string>();
var allowedOrigins = (builder.Environment.IsDevelopment()
        ? configuredOrigins.Concat(new[] { "http://localhost:5173", "http://127.0.0.1:5173" })
        : configuredOrigins.AsEnumerable())
    .Where(origin => Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
        (uri.Scheme == Uri.UriSchemeHttps ||
         (builder.Environment.IsDevelopment() && uri.Scheme == Uri.UriSchemeHttp)))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();
builder.Services.AddCors(options => options.AddPolicy("ReactApp", policy => policy
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader().AllowAnyMethod()));

// Bước 25: tìm kiếm ngữ nghĩa Ollama có cache RAM; không thay đổi MySQL.
// D4: cap cached embedding vectors (the only cache writer in this snapshot).
// Any new IMemoryCache writers must also specify an entry Size.
builder.Services.AddMemoryCache(options => options.SizeLimit = 96L * 1024 * 1024);
builder.Services.AddHttpClient("RagEmbeddingClient", client =>
{
    client.Timeout = TimeSpan.FromMinutes(2);
});
builder.Services.AddSingleton<DocumentRetrievalService>(sp => new DocumentRetrievalService(
    sp.GetRequiredService<IHttpClientFactory>().CreateClient("RagEmbeddingClient"),
    sp.GetRequiredService<IConfiguration>(),
    sp.GetRequiredService<ILogger<DocumentRetrievalService>>(),
    sp.GetRequiredService<Microsoft.Extensions.Caching.Memory.IMemoryCache>()));

// D5: persistent status-based queue; uses existing Documents.Status column.
builder.Services.AddScoped<DocumentIndexingService>();
builder.Services.AddHostedService<DocumentIndexWorker>();

builder.Services.AddHttpClient<AiTextService>(client =>
{
    // Ollama tren laptop co the can vai phut khi load model lan dau.
    client.Timeout = TimeSpan.FromMinutes(5);
});

var app = builder.Build();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

// API responses are private and should not be sniffed, framed or cached.
app.Use(async (ctx, next) =>
{
    ctx.Response.OnStarting(() =>
    {
        ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
        ctx.Response.Headers["X-Frame-Options"] = "DENY";
        ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
        ctx.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        if (ctx.Request.Path.StartsWithSegments("/api"))
            ctx.Response.Headers["Cache-Control"] = "no-store";
        return Task.CompletedTask;
    });
    await next();
});
app.UseRouting();
app.UseCors("ReactApp");
// When MySQL chat tables/columns are missing, return a safe actionable error
// instead of an opaque HTTP 500. Full details remain only in Backend logs.
app.Use(async (ctx, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex) when (
        ctx.Request.Path.StartsWithSegments("/api/ai") &&
        (ex is System.Data.Common.DbException || ex is DbUpdateException))
    {
        var logger = ctx.RequestServices.GetRequiredService<ILoggerFactory>()
            .CreateLogger("EduMind.ChatDatabase");
        logger.LogError(ex, "Database failure for {Path}; trace {TraceId}",
            ctx.Request.Path, ctx.TraceIdentifier);
        if (ctx.Response.HasStarted) throw; // SSE headers cannot be replaced.
        ctx.Response.Clear();
        ctx.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await ctx.Response.WriteAsJsonAsync(new
        {
            code = "AI_DATABASE_ERROR",
            message = "Không truy cập được dữ liệu hội thoại. Hãy kiểm tra kết nối MySQL và chạy dotnet ef database update sau khi sao lưu database.",
            traceId = ctx.TraceIdentifier
        });
    }
});

app.UseAuthentication();

// Bước 19: áp dụng trạng thái khóa và vai trò HIỆN TẠI từ MySQL trên mọi
// API có Bearer token. Nếu không, token đã phát trước khi khóa/hạ quyền
// vẫn giữ được quyền cũ cho tới khi hết hạn.
// Bản Development: thêm truy vấn DB mỗi request; có thể tối ưu sau.
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api") &&
        context.User.Identity?.IsAuthenticated == true)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var db = context.RequestServices.GetRequiredService<EduMindDbContext>();
        var account = await db.Users.AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => new { x.Id, x.LockoutEnabled, x.LockoutEnd })
            .SingleOrDefaultAsync(context.RequestAborted);
        if (account == null ||
            (account.LockoutEnabled && account.LockoutEnd > DateTimeOffset.UtcNow))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        var roleNames = await (from ur in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on ur.RoleId equals role.Id
            where ur.UserId == userId
            select role.Name).ToListAsync(context.RequestAborted);
        foreach (var identity in context.User.Identities)
            foreach (var staleRole in identity.FindAll(identity.RoleClaimType).ToArray())
                identity.RemoveClaim(staleRole);
        var principalIdentity = context.User.Identities.FirstOrDefault(x => x.IsAuthenticated);
        if (principalIdentity != null)
            foreach (var role in roleNames.Where(x => !string.IsNullOrWhiteSpace(x)))
                principalIdentity.AddClaim(new Claim(principalIdentity.RoleClaimType, role!));
    }
    await next();
});
// Run endpoint rate-limiting after authentication so accounts have separate quotas.
app.UseRateLimiter();
app.UseAuthorization();

// Existing databases need the B17 Identity migration first.
using (var scope = app.Services.CreateScope())
{
    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    foreach (var role in new[] { "Student", "Admin" })
        if (!await roles.RoleExistsAsync(role))
        {
            var result = await roles.CreateAsync(new IdentityRole(role));
            if (!result.Succeeded)
                throw new InvalidOperationException("Cannot seed identity roles.");
        }

    // Development-only bootstrap uses User Secrets, and MUST be removed after setup.
    if (app.Environment.IsDevelopment())
    {
        var config = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var email = config["BootstrapAdmin:Email"];
        var password = config["BootstrapAdmin:Password"];
        if (!string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(password))
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<EduMindUser>>();
            var admin = await users.FindByEmailAsync(email);
            if (admin is null)
            {
                admin = new EduMindUser { UserName = email, Email = email, EmailConfirmed = false };
                var created = await users.CreateAsync(admin, password);
                if (!created.Succeeded)
                    throw new InvalidOperationException("Cannot bootstrap admin account.");
            }
            if (!await users.IsInRoleAsync(admin, "Admin"))
            {
                var assigned = await users.AddToRoleAsync(admin, "Admin");
                if (!assigned.Succeeded)
                    throw new InvalidOperationException("Cannot bootstrap Admin role.");
            }
        }
    }
}

app.MapControllers();
app.Run();
