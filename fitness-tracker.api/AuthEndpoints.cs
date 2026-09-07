using System.Security.Claims;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api;

public static class AuthEndpoints
{
    public static string Uid(this ClaimsPrincipal p) => p.FindFirstValue(ClaimTypes.NameIdentifier)!;

    public record MeDto(string Email, string? DisplayName, string Role, bool HasProfile, bool GoogleEnabled);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app, bool googleEnabled)
    {
        var g = app.MapGroup("/auth");

        g.MapPost("/logout", async (SignInManager<AppUser> sm) =>
        {
            await sm.SignOutAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        g.MapGet("/me", async (ClaimsPrincipal p, UserManager<AppUser> um, AppDbContext db) =>
        {
            var user = await um.GetUserAsync(p);
            if (user is null) return Results.Unauthorized();
            var hasProfile = await db.Profiles.AnyAsync(x => x.UserId == user.Id);
            var role = await um.IsInRoleAsync(user, "Admin") ? "Admin" : "User";
            return Results.Ok(new MeDto(user.Email!, user.DisplayName, role, hasProfile, googleEnabled));
        }).RequireAuthorization();

        g.MapGet("/providers", () => Results.Ok(new { google = googleEnabled }));

        if (!googleEnabled) return;

        g.MapGet("/google", (SignInManager<AppUser> sm) =>
        {
            var props = sm.ConfigureExternalAuthenticationProperties("Google", "/auth/google/callback");
            return Results.Challenge(props, ["Google"]);
        });

        g.MapGet("/google/callback", async (SignInManager<AppUser> sm, UserManager<AppUser> um) =>
        {
            var info = await sm.GetExternalLoginInfoAsync();
            if (info is null) return Results.Redirect("/login?error=google");

            var result = await sm.ExternalLoginSignInAsync(info.LoginProvider, info.ProviderKey, isPersistent: true, bypassTwoFactor: true);
            if (result.IsLockedOut) return Results.Redirect("/login?error=disabled");
            if (result.Succeeded) return Results.Redirect("/");

            var email = info.Principal.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrEmpty(email)) return Results.Redirect("/login?error=google");

            var user = await um.FindByEmailAsync(email);
            if (user is null)
            {
                user = new AppUser { UserName = email, Email = email, EmailConfirmed = true, DisplayName = info.Principal.FindFirstValue(ClaimTypes.Name) };
                var created = await um.CreateAsync(user);
                if (!created.Succeeded) return Results.Redirect("/login?error=google");
            }
            if (await um.IsLockedOutAsync(user)) return Results.Redirect("/login?error=disabled");

            await um.AddLoginAsync(user, info);
            await sm.SignInAsync(user, isPersistent: true);
            return Results.Redirect("/");
        });
    }
}
