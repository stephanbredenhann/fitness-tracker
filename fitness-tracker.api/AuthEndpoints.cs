using System.Security.Claims;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api;

public static class AuthEndpoints
{
    public static string Uid(this ClaimsPrincipal p) => p.FindFirstValue(ClaimTypes.NameIdentifier)!;

    public record MeDto(string Email, string? DisplayName, string Role, bool HasProfile, bool GoogleEnabled, bool StravaEnabled);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app, bool googleEnabled, bool stravaEnabled)
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
            return Results.Ok(new MeDto(user.Email!, user.DisplayName, role, hasProfile, googleEnabled, stravaEnabled));
        }).RequireAuthorization();

        g.MapGet("/providers", () => Results.Ok(new { google = googleEnabled, strava = stravaEnabled }));

        if (stravaEnabled) MapStrava(g);
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

    // Connect a signed-in user's Strava account. The user id rides along as the XSRF value so a code cannot be
    // planted on someone else's session.
    static void MapStrava(RouteGroupBuilder g)
    {
        g.MapGet("/strava", (ClaimsPrincipal p, SignInManager<AppUser> sm) =>
        {
            var props = sm.ConfigureExternalAuthenticationProperties("Strava", "/auth/strava/callback", p.Uid());
            return Results.Challenge(props, ["Strava"]);
        }).RequireAuthorization();

        g.MapGet("/strava/callback", async (HttpContext ctx, ClaimsPrincipal p, SignInManager<AppUser> sm, AppDbContext db, IDataProtectionProvider dp) =>
        {
            var uid = p.Uid();
            var info = await sm.GetExternalLoginInfoAsync(uid);
            await ctx.SignOutAsync(IdentityConstants.ExternalScheme);
            var access = info?.AuthenticationTokens?.FirstOrDefault(t => t.Name == "access_token")?.Value;
            var refresh = info?.AuthenticationTokens?.FirstOrDefault(t => t.Name == "refresh_token")?.Value;
            var expires = info?.AuthenticationTokens?.FirstOrDefault(t => t.Name == "expires_at")?.Value;
            if (info is null || info.LoginProvider != "Strava" || access is null || refresh is null || !long.TryParse(info.ProviderKey, out var athleteId))
                return Results.Redirect("/settings?strava=error");

            var protector = dp.CreateProtector("strava");
            var link = await db.StravaLinks.FindAsync(uid);
            if (link is null) db.StravaLinks.Add(link = new StravaLink { UserId = uid });
            link.AthleteId = athleteId;
            link.AccessToken = protector.Protect(access);
            link.RefreshToken = protector.Protect(refresh);
            link.ExpiresAt = DateTimeOffset.TryParse(expires, out var exp) ? exp.UtcDateTime : DateTime.UtcNow.AddHours(6);
            await db.SaveChangesAsync();
            return Results.Redirect("/settings?strava=ok");
        }).RequireAuthorization();
    }
}
