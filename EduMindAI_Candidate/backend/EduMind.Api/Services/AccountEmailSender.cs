using System.Net;
using System.Net.Mail;
using System.Text;

namespace EduMind.Api.Services;

public interface IAccountEmailSender
{
    Task SendAsync(string address, string subject, string body, CancellationToken cancellationToken);
}

/// <summary>
/// File mode ONLY for localhost Development: messages contain single-use links.
/// SMTP mode is required for real users. Never serve Storage/DevMail as static files.
/// </summary>
public sealed class AccountEmailSender : IAccountEmailSender
{
    private readonly IConfiguration _config;
    private readonly IWebHostEnvironment _environment;

    public AccountEmailSender(IConfiguration config, IWebHostEnvironment environment)
    {
        _config = config;
        _environment = environment;
    }

    public async Task SendAsync(string address, string subject, string body, CancellationToken cancellationToken)
    {
        var mode = _config["Email:Mode"] ?? (_environment.IsDevelopment() ? "File" : "Smtp");
        if (mode.Equals("File", StringComparison.OrdinalIgnoreCase))
        {
            if (!_environment.IsDevelopment())
                throw new InvalidOperationException("File email mode is restricted to Development.");

            var directory = Path.Combine(_environment.ContentRootPath, "Storage", "DevMail");
            Directory.CreateDirectory(directory);
            var content = $"To: {address}\nSubject: {subject}\n\n{body}\n";
            var file = Path.Combine(directory, $"message-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}.txt");
            await File.WriteAllTextAsync(file, content, Encoding.UTF8, cancellationToken);
            return;
        }

        if (!mode.Equals("Smtp", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Email:Mode must be File or Smtp.");

        var host = _config["Email:Smtp:Host"];
        var sender = _config["Email:Smtp:From"];
        if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(sender))
            throw new InvalidOperationException("SMTP host and From must be configured.");

        using var message = new MailMessage(new MailAddress(sender), new MailAddress(address))
        {
            Subject = subject,
            Body = body,
            IsBodyHtml = false
        };
        using var smtp = new SmtpClient(host, _config.GetValue<int?>("Email:Smtp:Port") ?? 587)
        {
            EnableSsl = true,
            DeliveryMethod = SmtpDeliveryMethod.Network
        };
        var username = _config["Email:Smtp:Username"];
        var password = _config["Email:Smtp:Password"];
        if (!string.IsNullOrWhiteSpace(username))
            smtp.Credentials = new NetworkCredential(username, password);

        // SMTP supports STARTTLS when the server supports it; validate provider settings.
        await smtp.SendMailAsync(message, cancellationToken);
    }
}
