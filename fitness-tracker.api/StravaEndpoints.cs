using System.Security.Claims;
using System.Security.Cryptography;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api;

public static class StravaEndpoints
{
    public static void MapStravaEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/strava").RequireAuthorization();

        g.MapGet("/status", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var link = await db.StravaLinks.FindAsync(p.Uid());
            return Results.Ok(new { Connected = link is not null, link?.LastSyncAt });
        });

        g.MapPost("/sync", async (ClaimsPrincipal p, AppDbContext db, StravaClient strava, IDataProtectionProvider dp, CancellationToken ct) =>
        {
            var uid = p.Uid();
            var link = await db.StravaLinks.FindAsync(uid);
            if (link is null) return Results.BadRequest(new { error = "Connect Strava first." });
            var protector = dp.CreateProtector("strava");
            string access, refresh;
            try { access = protector.Unprotect(link.AccessToken); refresh = protector.Unprotect(link.RefreshToken); }
            catch (CryptographicException)
            {
                // Keys rotated since the connection was made, so the tokens are unreadable. Start over.
                db.StravaLinks.Remove(link);
                await db.SaveChangesAsync(ct);
                return Results.BadRequest(new { error = "The Strava connection expired. Connect it again." });
            }

            try
            {
                if (link.ExpiresAt < DateTime.UtcNow.AddMinutes(5))
                {
                    var t = await strava.RefreshAsync(refresh, ct);
                    access = t.AccessToken;
                    link.AccessToken = protector.Protect(t.AccessToken);
                    link.RefreshToken = protector.Protect(t.RefreshToken);
                    link.ExpiresAt = t.ExpiresAt;
                }

                var since = link.LastSyncAt ?? DateTime.UtcNow.AddDays(-30);
                var after = new DateTimeOffset(since).ToUnixTimeSeconds();
                var kg = await ApiEndpoints.LatestWeight(db, uid, DateOnly.FromDateTime(DateTime.UtcNow));
                var known = (await db.Exercises.Where(e => e.UserId == uid && e.ExternalId != null).Select(e => e.ExternalId!).ToListAsync(ct)).ToHashSet();
                int imported = 0, skipped = 0;
                for (var page = 1; ; page++)
                {
                    var batch = await strava.ActivitiesAsync(access, after, page, ct);
                    foreach (var a in batch)
                    {
                        var type = StravaClient.Map(a.SportType);
                        var minutes = Math.Max(1, (int)Math.Round(a.MovingTimeSec / 60.0));
                        if (type is null || kg is null || known.Contains(a.Id.ToString())) { skipped++; continue; }
                        double? km = a.DistanceM > 0 ? Math.Round(a.DistanceM / 1000, 2) : null;
                        db.Exercises.Add(new Exercise
                        {
                            UserId = uid, Date = a.Date, Type = type.Value, DurationMin = minutes, DistanceKm = km,
                            Kcal = Calc.ExerciseKcal(type.Value, minutes, kg.Value, km, null),
                            Source = ExerciseSource.Strava, ExternalId = a.Id.ToString(), Note = a.SportType,
                        });
                        known.Add(a.Id.ToString());
                        imported++;
                    }
                    if (batch.Count < 100) break;
                }
                link.LastSyncAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { imported, skipped, needsWeight = kg is null });
            }
            catch (HttpRequestException) { return Results.Problem("Strava is not reachable right now.", statusCode: 502); }
        });

        g.MapDelete("/", async (ClaimsPrincipal p, AppDbContext db, StravaClient strava, IDataProtectionProvider dp, CancellationToken ct) =>
        {
            var link = await db.StravaLinks.FindAsync(p.Uid());
            if (link is null) return Results.NoContent();
            try { await strava.DeauthorizeAsync(dp.CreateProtector("strava").Unprotect(link.AccessToken), ct); }
            catch (Exception) when (!ct.IsCancellationRequested) { /* revoking on Strava is best effort, the local link goes regardless */ }
            db.StravaLinks.Remove(link);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }
}
