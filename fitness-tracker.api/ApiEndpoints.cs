using System.Security.Claims;
using FitnessTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api;

public static class ApiEndpoints
{
    public record ProfileDto(string? DisplayName, double HeightCm, double GoalWeightKg, DateOnly BirthDate, Sex Sex, ActivityLevel ActivityLevel);
    public record WeighInDto(double WeightKg);
    public record FoodDto(DateOnly Date, string Name, int Kcal, double? Grams, double? ProteinG, double? CarbsG, double? FatG, string? Barcode);
    public record StrengthSetDto(string Name, int Sets, int Reps, double WeightKg);
    public record ExerciseDto(DateOnly Date, ExerciseType Type, int DurationMin, int? Kcal, string? Note, double? DistanceKm = null, List<StrengthSetDto>? Sets = null);

    public static void MapApiEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization();

        // Profile
        api.MapGet("/profile", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            var pr = await db.Profiles.FindAsync(uid);
            if (pr is null) return Results.NotFound();
            var user = await db.Users.FindAsync(uid);
            return Results.Ok(new ProfileDto(user!.DisplayName, pr.HeightCm, pr.GoalWeightKg, pr.BirthDate, pr.Sex, pr.ActivityLevel));
        });

        api.MapPut("/profile", async (ProfileDto dto, ClaimsPrincipal p, AppDbContext db) =>
        {
            var errors = new Dictionary<string, string[]>();
            if (dto.HeightCm is < 100 or > 250) errors["heightCm"] = ["Height must be between 100 and 250 cm."];
            if (dto.GoalWeightKg is < 30 or > 300) errors["goalWeightKg"] = ["Goal weight must be between 30 and 300 kg."];
            var age = Calc.Age(dto.BirthDate, DateOnly.FromDateTime(DateTime.UtcNow));
            if (age is < 13 or > 110) errors["birthDate"] = ["Enter a valid birth date."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);

            var uid = p.Uid();
            var pr = await db.Profiles.FindAsync(uid);
            if (pr is null) db.Profiles.Add(pr = new Profile { UserId = uid });
            pr.HeightCm = dto.HeightCm;
            pr.GoalWeightKg = dto.GoalWeightKg;
            pr.BirthDate = dto.BirthDate;
            pr.Sex = dto.Sex;
            pr.ActivityLevel = dto.ActivityLevel;
            var user = await db.Users.FindAsync(uid);
            user!.DisplayName = string.IsNullOrWhiteSpace(dto.DisplayName) ? null : dto.DisplayName.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(dto);
        });

        // Weigh-ins
        api.MapGet("/weighins", async (DateOnly? from, DateOnly? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            var q = db.WeighIns.Where(w => w.UserId == uid);
            if (from is not null) q = q.Where(w => w.Date >= from);
            if (to is not null) q = q.Where(w => w.Date <= to);
            return Results.Ok(await q.OrderBy(w => w.Date).Select(w => new { w.Date, w.WeightKg }).ToListAsync());
        });

        api.MapPut("/weighins/{date}", async (DateOnly date, WeighInDto dto, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (dto.WeightKg is < 30 or > 300) return Invalid("weightKg", "Weight must be between 30 and 300 kg.");
            var uid = p.Uid();
            var w = await db.WeighIns.SingleOrDefaultAsync(x => x.UserId == uid && x.Date == date);
            if (w is null) db.WeighIns.Add(w = new WeighIn { UserId = uid, Date = date });
            w.WeightKg = dto.WeightKg;
            await db.SaveChangesAsync();
            return Results.Ok(new { w.Date, w.WeightKg });
        });

        api.MapDelete("/weighins/{date}", async (DateOnly date, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            await db.WeighIns.Where(x => x.UserId == uid && x.Date == date).ExecuteDeleteAsync();
            return Results.NoContent();
        });

        // Food
        api.MapGet("/food", async (DateOnly date, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            return Results.Ok(await db.FoodEntries.Where(f => f.UserId == uid && f.Date == date).OrderBy(f => f.CreatedAt).ToListAsync());
        });

        api.MapPost("/food", async (FoodDto dto, ClaimsPrincipal p, AppDbContext db) =>
        {
            var errors = new Dictionary<string, string[]>();
            if (string.IsNullOrWhiteSpace(dto.Name)) errors["name"] = ["Name is required."];
            if (dto.Kcal is < 0 or > 10000) errors["kcal"] = ["Calories must be between 0 and 10000."];
            if (errors.Count > 0) return Results.ValidationProblem(errors);
            var f = new FoodEntry
            {
                UserId = p.Uid(), Date = dto.Date, Name = dto.Name.Trim(), Kcal = dto.Kcal, Grams = dto.Grams,
                ProteinG = dto.ProteinG, CarbsG = dto.CarbsG, FatG = dto.FatG, Barcode = dto.Barcode,
            };
            db.FoodEntries.Add(f);
            await db.SaveChangesAsync();
            return Results.Created($"/api/food/{f.Id}", f);
        });

        api.MapDelete("/food/{id:int}", async (int id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            await db.FoodEntries.Where(f => f.Id == id && f.UserId == uid).ExecuteDeleteAsync();
            return Results.NoContent();
        });

        api.MapGet("/food/recent", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            var recent = await db.FoodEntries.Where(f => f.UserId == uid).OrderByDescending(f => f.CreatedAt).Take(200).ToListAsync();
            return Results.Ok(recent.DistinctBy(f => f.Name.ToLowerInvariant()).Take(20)
                .Select(f => new { f.Name, f.Kcal, f.Grams, f.ProteinG, f.CarbsG, f.FatG, f.Barcode }));
        });

        api.MapGet("/food/search", async (string q, FoodSearch search, CancellationToken ct) =>
        {
            try { return Results.Ok(await search.SearchAsync(q, ct)); }
            catch (Exception) when (!ct.IsCancellationRequested) { return Results.Problem("Food search is unavailable right now.", statusCode: 502); }
        });

        // Exercises
        api.MapGet("/exercises/types", () => Results.Ok(Calc.Met.Select(kv => new { Type = kv.Key, Met = kv.Value })));

        api.MapGet("/exercises", async (DateOnly? date, DateOnly? from, DateOnly? to, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            var q = db.Exercises.Where(e => e.UserId == uid);
            if (date is not null) q = q.Where(e => e.Date == date);
            else
            {
                to ??= DateOnly.FromDateTime(DateTime.UtcNow);
                from = from is null || from < to.Value.AddDays(-365) ? to.Value.AddDays(-365) : from;
                q = q.Where(e => e.Date >= from && e.Date <= to);
            }
            var list = await q.Include(e => e.Sets).OrderBy(e => e.Date).ThenBy(e => e.CreatedAt).ToListAsync();
            return Results.Ok(list.Select(ExerciseView));
        });

        api.MapPost("/exercises", async (ExerciseDto dto, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            if (dto.DurationMin is < 1 or > 1440) return Invalid("durationMin", "Duration must be between 1 and 1440 minutes.");
            if (dto.DistanceKm is < 0.01 or > 1000) return Invalid("distanceKm", "Distance must be between 0.01 and 1000 km.");
            var sets = (dto.Sets ?? []).Where(s => !string.IsNullOrWhiteSpace(s.Name)).ToList();
            if (sets.Count > 30) return Invalid("sets", "At most 30 movements per session.");
            if (sets.Any(s => s.Sets is < 1 or > 20 || s.Reps is < 1 or > 500 || s.WeightKg is < 0 or > 500))
                return Invalid("sets", "Each movement needs 1 to 20 sets, 1 to 500 reps and a weight between 0 and 500 kg.");
            var setRows = sets.Select(s => new StrengthSet { Name = s.Name.Trim(), Sets = s.Sets, Reps = s.Reps, WeightKg = s.WeightKg }).ToList();
            int kcal;
            if (dto.Kcal is int given)
            {
                if (given is < 0 or > 10000) return Invalid("kcal", "Calories must be between 0 and 10000.");
                kcal = given;
            }
            else if (dto.Type == ExerciseType.Other)
                return Invalid("kcal", "Enter calories for this exercise.");
            else
            {
                var kg = await LatestWeight(db, uid, dto.Date);
                if (kg is null) return Invalid("kcal", "Log a weigh-in first so calories can be estimated.");
                kcal = Calc.ExerciseKcal(dto.Type, dto.DurationMin, kg.Value, dto.DistanceKm, setRows);
            }
            var e = new Exercise { UserId = uid, Date = dto.Date, Type = dto.Type, DurationMin = dto.DurationMin, DistanceKm = dto.DistanceKm, Kcal = kcal, Note = dto.Note?.Trim(), Sets = setRows };
            db.Exercises.Add(e);
            await db.SaveChangesAsync();
            return Results.Created($"/api/exercises/{e.Id}", ExerciseView(e));
        });

        api.MapDelete("/exercises/{id:int}", async (int id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            await db.Exercises.Where(e => e.Id == id && e.UserId == uid).ExecuteDeleteAsync();
            return Results.NoContent();
        });

        // Dashboard
        api.MapGet("/dashboard", async (DateOnly to, int? days, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            var profile = await db.Profiles.FindAsync(uid);
            if (profile is null) return Results.NotFound();
            var n = Math.Clamp(days ?? 30, 7, 365);
            var from = to.AddDays(-(n - 1));
            var mult = Calc.Multiplier(profile.ActivityLevel);

            var weights = await db.WeighIns.Where(w => w.UserId == uid && w.Date <= to).OrderBy(w => w.Date)
                .Select(w => new { w.Date, w.WeightKg }).ToListAsync();
            var food = await db.FoodEntries.Where(f => f.UserId == uid && f.Date >= from && f.Date <= to)
                .GroupBy(f => f.Date).Select(g => new { Date = g.Key, Kcal = g.Sum(f => f.Kcal) }).ToDictionaryAsync(x => x.Date, x => x.Kcal);
            var exercise = await db.Exercises.Where(e => e.UserId == uid && e.Date >= from && e.Date <= to)
                .GroupBy(e => e.Date).Select(g => new { Date = g.Key, Kcal = g.Sum(e => e.Kcal) }).ToDictionaryAsync(x => x.Date, x => x.Kcal);

            var dayList = new List<object>();
            for (var d = from; d <= to; d = d.AddDays(1))
            {
                var hasFood = food.TryGetValue(d, out var intake);
                var hasEx = exercise.TryGetValue(d, out var burned);
                if (!hasFood && !hasEx) continue;
                var kg = weights.LastOrDefault(w => w.Date <= d)?.WeightKg ?? weights.FirstOrDefault()?.WeightKg;
                if (kg is null) continue;
                var burn = (int)Math.Round(Calc.Bmr(kg.Value, profile.HeightCm, Calc.Age(profile.BirthDate, d), profile.Sex) * mult) + burned;
                dayList.Add(new { Date = d, Intake = intake, Burn = burn, Deficit = burn - intake });
            }

            var latest = weights.LastOrDefault();
            double? bmr = latest is null ? null : Math.Round(Calc.Bmr(latest.WeightKg, profile.HeightCm, Calc.Age(profile.BirthDate, to), profile.Sex));
            return Results.Ok(new
            {
                Weights = weights.Where(w => w.Date >= from).ToList(),
                Days = dayList,
                Bmr = bmr,
                Tdee = bmr is null ? null : (double?)Math.Round(bmr.Value * mult),
                GoalKg = profile.GoalWeightKg,
                StartKg = weights.FirstOrDefault()?.WeightKg,
                LatestKg = latest?.WeightKg,
                LatestDate = latest?.Date,
            });
        });
    }

    static object ExerciseView(Exercise e) => new
    {
        e.Id, e.Date, e.Type, e.DurationMin, e.DistanceKm, e.Kcal, e.Source, e.Note,
        Sets = e.Sets.Select(s => new { s.Name, s.Sets, s.Reps, s.WeightKg }).ToList(),
    };

    static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    internal static async Task<double?> LatestWeight(AppDbContext db, string uid, DateOnly onOrBefore) =>
        await db.WeighIns.Where(w => w.UserId == uid && w.Date <= onOrBefore).OrderByDescending(w => w.Date).Select(w => (double?)w.WeightKg).FirstOrDefaultAsync()
        ?? await db.WeighIns.Where(w => w.UserId == uid).OrderBy(w => w.Date).Select(w => (double?)w.WeightKg).FirstOrDefaultAsync();
}
