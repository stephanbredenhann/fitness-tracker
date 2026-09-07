using System.Security.Claims;
using System.Text;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
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
