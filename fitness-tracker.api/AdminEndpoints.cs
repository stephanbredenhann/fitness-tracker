using System.Security.Claims;
using System.Text;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api;

public static class AdminEndpoints
{
    public record UserDto(string Id, string Email, string? DisplayName, bool EmailConfirmed, bool IsAdmin, bool Disabled, DateTime CreatedAt, DateTime? LastSeenAt);

    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/admin").RequireAuthorization("Admin");

        g.MapGet("/users", async (AppDbContext db) =>
        {
            var admins = await (from ur in db.UserRoles join r in db.Roles on ur.RoleId equals r.Id where r.Name == "Admin" select ur.UserId).ToHashSetAsync();
            var users = await db.Users.OrderBy(u => u.CreatedAt).ToListAsync();
            return Results.Ok(users.Select(u => new UserDto(u.Id, u.Email!, u.DisplayName, u.EmailConfirmed, admins.Contains(u.Id),
                u.LockoutEnd > DateTimeOffset.UtcNow, u.CreatedAt, u.LastSeenAt)));
        });

        g.MapPost("/users/{id}/disable", (string id, ClaimsPrincipal p, UserManager<AppUser> um) => NotSelf(id, p, um, async u =>
        {
            await um.SetLockoutEnabledAsync(u, true);
            await um.SetLockoutEndDateAsync(u, DateTimeOffset.MaxValue);
            await um.UpdateSecurityStampAsync(u);
        }));

        g.MapPost("/users/{id}/enable", (string id, ClaimsPrincipal p, UserManager<AppUser> um) => NotSelf(id, p, um, async u =>
        {
            await um.SetLockoutEndDateAsync(u, null);
            await um.ResetAccessFailedCountAsync(u);
        }, allowSelf: true));

        g.MapPost("/users/{id}/promote", (string id, ClaimsPrincipal p, UserManager<AppUser> um) => NotSelf(id, p, um, async u =>
        {
            if (!await um.IsInRoleAsync(u, "Admin")) await um.AddToRoleAsync(u, "Admin");
            await um.UpdateSecurityStampAsync(u);
        }, allowSelf: true));

        g.MapPost("/users/{id}/demote", (string id, ClaimsPrincipal p, UserManager<AppUser> um) => NotSelf(id, p, um, async u =>
        {
            await um.RemoveFromRoleAsync(u, "Admin");
            await um.UpdateSecurityStampAsync(u);
        }));

        g.MapPost("/users/{id}/reset-password", (string id, ClaimsPrincipal p, UserManager<AppUser> um, EmailService email) => NotSelf(id, p, um, async u =>
        {
            var token = await um.GeneratePasswordResetTokenAsync(u);
            await email.SendPasswordResetCodeAsync(u, u.Email!, WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token)));
        }, allowSelf: true));

        g.MapDelete("/users/{id}", (string id, ClaimsPrincipal p, UserManager<AppUser> um) => NotSelf(id, p, um, async u =>
        {
            await um.DeleteAsync(u);
        }));

        // Backup is a plain SQLite file made with VACUUM INTO, consistent while the app keeps running.
        g.MapGet("/backup", async (AppDbContext db, CancellationToken ct) =>
        {
            var tmp = Path.Combine(Path.GetTempPath(), $"ft-backup-{Guid.NewGuid():N}.bac");
            await db.Database.ExecuteSqlAsync($"VACUUM INTO {tmp}", ct);
            var stream = new FileStream(tmp, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16, FileOptions.DeleteOnClose);
            return Results.File(stream, "application/octet-stream", $"fitness-{DateTime.UtcNow:yyyyMMdd-HHmm}.bac");
        });

        g.MapPost("/restore", async (IFormFile file, AppDbContext db) =>
        {
            var dbPath = Path.GetFullPath(new SqliteConnectionStringBuilder(db.Database.GetConnectionString()).DataSource);
            var tmp = Path.Combine(Path.GetTempPath(), $"ft-restore-{Guid.NewGuid():N}.bac");
            try
            {
                await using (var fs = File.Create(tmp)) await file.CopyToAsync(fs);
                if (!await IsSqliteBackup(tmp)) return Results.BadRequest(new { error = "That file is not a Fitness Tracker backup." });

                var safeDir = Path.Combine(Path.GetDirectoryName(dbPath)!, "backups");
                Directory.CreateDirectory(safeDir);
                var safety = Path.Combine(safeDir, $"pre-restore-{DateTime.UtcNow:yyyyMMdd-HHmmss}.bac");
                await db.Database.ExecuteSqlAsync($"VACUUM INTO {safety}");

                // ponytail: no global write lock during the swap, fine for one admin restoring a small self-hosted db
                await db.Database.CloseConnectionAsync();
                SqliteConnection.ClearAllPools();
                foreach (var suffix in new[] { "-wal", "-shm", "-journal" }) File.Delete(dbPath + suffix);
                File.Move(tmp, dbPath, overwrite: true);
                await db.Database.MigrateAsync();
                return Results.Ok(new { safetyCopy = safety });
            }
            finally { File.Delete(tmp); }
        }).DisableAntiforgery()
          .WithMetadata(new RequestSizeLimitAttribute(200L * 1024 * 1024), new RequestFormLimitsAttribute { MultipartBodyLengthLimit = 200L * 1024 * 1024 });
    }

    static async Task<bool> IsSqliteBackup(string path)
    {
        var header = new byte[16];
        await using (var fs = File.OpenRead(path))
            if (await fs.ReadAsync(header) < 16 || Encoding.ASCII.GetString(header) != "SQLite format 3\0") return false;
        try
        {
            await using var conn = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Mode = SqliteOpenMode.ReadOnly, Pooling = false }.ToString());
            await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '__EFMigrationsHistory'";
            return (long)(await cmd.ExecuteScalarAsync())! == 1;
        }
        catch (SqliteException) { return false; }
    }

    static async Task<IResult> NotSelf(string id, ClaimsPrincipal p, UserManager<AppUser> um, Func<AppUser, Task> action, bool allowSelf = false)
    {
        if (!allowSelf && id == p.Uid()) return Results.BadRequest(new { error = "You cannot do that to your own account." });
        var user = await um.FindByIdAsync(id);
        if (user is null) return Results.NotFound();
        await action(user);
        return Results.NoContent();
    }
}
