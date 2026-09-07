using FitnessTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api;

public sealed class ReminderService(IServiceScopeFactory scopes, ILogger<ReminderService> log) : BackgroundService
{
    public static IQueryable<AppUser> Due(AppDbContext db, DateTime now)
    {
        var cutoff = now.AddHours(-48);
        return db.Users.Where(u => u.EmailConfirmed && u.LockoutEnd == null
            && u.LastSeenAt != null && u.LastSeenAt < cutoff
            && (u.LastReminderAt == null || u.LastReminderAt < u.LastSeenAt));
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try { await RunOnce(ct); }
            catch (Exception e) when (e is not OperationCanceledException) { log.LogError(e, "Reminder run failed"); }
        } while (await timer.WaitForNextTickAsync(ct));
    }

    async Task RunOnce(CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var email = scope.ServiceProvider.GetRequiredService<EmailService>();
        var now = DateTime.UtcNow;
        foreach (var user in await Due(db, now).ToListAsync(ct))
        {
            await email.SendReminderAsync(user);
            user.LastReminderAt = now;
        }
        await db.SaveChangesAsync(ct);
    }
}
