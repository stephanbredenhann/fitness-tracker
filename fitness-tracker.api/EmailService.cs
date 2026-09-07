using System.Net;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Identity;
using Resend;

namespace FitnessTracker.Api;

// Singleton: MapIdentityApi resolves the sender once from the root container, so Resend is resolved per send.
public sealed class EmailService(IConfiguration cfg, ILogger<EmailService> log, IServiceScopeFactory scopes) : IEmailSender<AppUser>
{
    string BaseUrl => (cfg["App:BaseUrl"] ?? "http://localhost:4200").TrimEnd('/');

    public Task SendConfirmationLinkAsync(AppUser user, string email, string confirmationLink) =>
        Send(email, "Confirm your email", "Confirm your email",
            "One click and your account is ready.", $"{BaseUrl}/verify{new Uri(WebUtility.HtmlDecode(confirmationLink)).Query}", "Confirm email");

    public Task SendPasswordResetLinkAsync(AppUser user, string email, string resetLink) =>
        Send(email, "Reset your password", "Reset your password",
            "Choose a new password. The link expires soon.", resetLink, "Reset password");

    public Task SendPasswordResetCodeAsync(AppUser user, string email, string resetCode) =>
        Send(email, "Reset your password", "Reset your password", "Choose a new password. The link expires soon.",
            $"{BaseUrl}/reset?email={Uri.EscapeDataString(email)}&code={resetCode}", "Reset password");

    public Task SendReminderAsync(AppUser user) =>
        Send(user.Email!, "Your log is two days behind", "Two days without an entry",
            "The trend only works if the data is there. Log today's weight and meals.", $"{BaseUrl}/dashboard", "Open tracker");

    async Task Send(string to, string subject, string heading, string body, string link, string action)
    {
        var html = $"""
            <div style="font-family:Inter,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1a1f2e">
              <h1 style="font-size:20px;font-weight:600;margin:0 0 12px">{WebUtility.HtmlEncode(heading)}</h1>
              <p style="font-size:15px;line-height:1.5;margin:0 0 24px;color:#4b5563">{WebUtility.HtmlEncode(body)}</p>
              <a href="{WebUtility.HtmlEncode(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:500">{WebUtility.HtmlEncode(action)}</a>
              <p style="font-size:12px;color:#9ca3af;margin:32px 0 0">If the button does not work, open this link:<br>{WebUtility.HtmlEncode(link)}</p>
            </div>
            """;
        using var scope = scopes.CreateScope();
        var resend = scope.ServiceProvider.GetService<IResend>();
        if (resend is null)
        {
            log.LogInformation("Email (no Resend key) to {To}: {Subject} -> {Link}", to, subject, link);
            return;
        }
        var msg = new EmailMessage
        {
            From = cfg["Email:From"] ?? "Fitness Tracker <onboarding@resend.dev>",
            Subject = subject,
            HtmlBody = html,
        };
        msg.To.Add(to);
        await resend.EmailSendAsync(msg);
    }
}
