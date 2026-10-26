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
});

builder.Services.AddCors(options => options.AddPolicy("ReactApp", policy => policy
    .WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
    .AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddHttpClient("EduMindOpenAI", client =>
{
    client.Timeout = TimeSpan.FromSeconds(90);
});

var app = builder.Build();
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseRouting();
app.UseCors("ReactApp");
app.UseRateLimiter();
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
