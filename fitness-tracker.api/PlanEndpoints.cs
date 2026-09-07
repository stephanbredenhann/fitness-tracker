using System.Security.Claims;
using FitnessTracker.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api;

public static class PlanEndpoints
{
    public record LibraryDto(string Name, Equipment Equipment, MuscleGroup Muscle, double Met);
    public record PlanItemDto(string Name, double Met, int Sets, int Reps, double WeightKg, int RestSec, int? DurationSec = null);
    public record PlanDto(string Name, string? Description, bool IsShared, List<PlanItemDto> Items);

    public static void MapPlanEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization();

        api.MapGet("/library", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            return Results.Ok(await db.LibraryExercises.Where(x => x.OwnerUserId == null || x.OwnerUserId == uid)
                .OrderBy(x => x.Equipment).ThenBy(x => x.Name)
                .Select(x => new { x.Id, x.Name, x.Equipment, x.Muscle, x.Met, Mine = x.OwnerUserId != null }).ToListAsync());
        });

        api.MapPost("/library", async (LibraryDto dto, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(dto.Name) || dto.Name.Length > 60) return Invalid("name", "Give the exercise a name of up to 60 characters.");
            if (dto.Met is < 1 or > 15) return Invalid("met", "Intensity must be between 1 and 15 MET.");
            var x = new LibraryExercise { Name = dto.Name.Trim(), Equipment = dto.Equipment, Muscle = dto.Muscle, Met = dto.Met, OwnerUserId = p.Uid() };
            db.LibraryExercises.Add(x);
            await db.SaveChangesAsync();
            return Results.Created($"/api/library/{x.Id}", new { x.Id, x.Name, x.Equipment, x.Muscle, x.Met, Mine = true });
        });

        api.MapDelete("/library/{id:int}", async (int id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            await db.LibraryExercises.Where(x => x.Id == id && x.OwnerUserId == uid).ExecuteDeleteAsync();
            return Results.NoContent();
        });

        api.MapGet("/plans", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            var kg = await ApiEndpoints.LatestWeight(db, uid, DateOnly.FromDateTime(DateTime.UtcNow));
            var plans = await Visible(db, uid);
            return Results.Ok(new
            {
                Mine = plans.Where(x => x.Plan.OwnerUserId == uid).Select(x => View(x.Plan, x.OwnerName, uid, kg)),
                Shared = plans.Where(x => x.Plan.OwnerUserId != uid).Select(x => View(x.Plan, x.OwnerName, uid, kg)),
            });
        });

        api.MapGet("/plans/{id:int}", async (int id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            var x = (await Visible(db, uid, id)).SingleOrDefault();
            if (x.Plan is null) return Results.NotFound();
            var kg = await ApiEndpoints.LatestWeight(db, uid, DateOnly.FromDateTime(DateTime.UtcNow));
            return Results.Ok(View(x.Plan, x.OwnerName, uid, kg));
        });

        api.MapPost("/plans", async (PlanDto dto, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (Validate(dto) is { } bad) return bad;
            var uid = p.Uid();
            var plan = new WorkoutPlan { OwnerUserId = uid, Name = dto.Name.Trim(), Description = Clean(dto.Description), IsShared = dto.IsShared, Items = Items(dto) };
            db.WorkoutPlans.Add(plan);
            await db.SaveChangesAsync();
            var kg = await ApiEndpoints.LatestWeight(db, uid, DateOnly.FromDateTime(DateTime.UtcNow));
            return Results.Created($"/api/plans/{plan.Id}", View(plan, null, uid, kg));
        });

        api.MapPut("/plans/{id:int}", async (int id, PlanDto dto, ClaimsPrincipal p, AppDbContext db) =>
        {
            if (Validate(dto) is { } bad) return bad;
            var uid = p.Uid();
            var plan = await db.WorkoutPlans.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id && x.OwnerUserId == uid);
            if (plan is null) return Results.NotFound();
            plan.Name = dto.Name.Trim(); plan.Description = Clean(dto.Description); plan.IsShared = dto.IsShared;
            plan.Items.Clear();
            plan.Items.AddRange(Items(dto));
            await db.SaveChangesAsync();
            var kg = await ApiEndpoints.LatestWeight(db, uid, DateOnly.FromDateTime(DateTime.UtcNow));
            return Results.Ok(View(plan, null, uid, kg));
        });

        api.MapDelete("/plans/{id:int}", async (int id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            await db.WorkoutPlans.Where(x => x.Id == id && x.OwnerUserId == uid).ExecuteDeleteAsync();
            return Results.NoContent();
        });

        api.MapPost("/plans/{id:int}/copy", async (int id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var uid = p.Uid();
            var src = await db.WorkoutPlans.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id && (x.IsShared || x.OwnerUserId == uid));
            if (src is null) return Results.NotFound();
            var copy = new WorkoutPlan
            {
                OwnerUserId = uid, Name = src.Name + " (copy)", Description = src.Description, IsShared = false,
                Items = src.Items.OrderBy(i => i.Order).Select(i => new WorkoutPlanItem { Order = i.Order, Name = i.Name, Met = i.Met, Sets = i.Sets, Reps = i.Reps, WeightKg = i.WeightKg, RestSec = i.RestSec, DurationSec = i.DurationSec }).ToList(),
            };
            db.WorkoutPlans.Add(copy);
            await db.SaveChangesAsync();
            var kg = await ApiEndpoints.LatestWeight(db, uid, DateOnly.FromDateTime(DateTime.UtcNow));
            return Results.Created($"/api/plans/{copy.Id}", View(copy, null, uid, kg));
        });
    }

    // Plans I own plus everyone's shared plans, with the owner's display name and never their email.
    static async Task<List<(WorkoutPlan Plan, string? OwnerName)>> Visible(AppDbContext db, string uid, int? id = null)
    {
        var q = db.WorkoutPlans.Include(x => x.Items).Where(x => x.OwnerUserId == uid || x.IsShared);
        if (id is not null) q = q.Where(x => x.Id == id);
        var plans = await q.OrderBy(x => x.Name).ToListAsync();
        var owners = plans.Select(x => x.OwnerUserId).Distinct().ToList();
        var names = await db.Users.Where(u => owners.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
        return plans.Select(x => (x, names.GetValueOrDefault(x.OwnerUserId))).ToList();
    }

    static object View(WorkoutPlan plan, string? ownerName, string uid, double? kg)
    {
        var items = plan.Items.OrderBy(i => i.Order).ToList();
        var (min, kcal) = Calc.PlanEstimate(items, kg);
        return new
        {
            plan.Id, plan.Name, plan.Description, plan.IsShared, plan.CreatedAt,
            IsMine = plan.OwnerUserId == uid,
            OwnerName = plan.OwnerUserId == uid ? "You" : ownerName ?? "A member",
            Items = items.Select(i => new { i.Name, i.Met, i.Sets, i.Reps, i.WeightKg, i.RestSec, i.DurationSec }),
            EstimatedMin = min, EstimatedKcal = kcal,
        };
    }

    static IResult? Validate(PlanDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name) || dto.Name.Length > 80) return Invalid("name", "Give the plan a name of up to 80 characters.");
        if (dto.Description is { Length: > 500 }) return Invalid("description", "Keep the description under 500 characters.");
        var items = dto.Items ?? [];
        if (items.Count is 0 or > 30) return Invalid("items", "A plan needs between 1 and 30 exercises.");
        if (items.Any(i => string.IsNullOrWhiteSpace(i.Name) || i.Name.Length > 60)) return Invalid("items", "Every exercise needs a name.");
        if (items.Any(i => i.Met is < 1 or > 15 || i.Sets is < 1 or > 20 || i.Reps is < 1 or > 500 || i.WeightKg is < 0 or > 500 || i.RestSec is < 0 or > 600 || i.DurationSec is < 5 or > 3600))
            return Invalid("items", "Each exercise needs 1 to 20 sets, 1 to 500 reps, 0 to 500 kg and 0 to 600 s rest, or 5 to 3600 s for a timed exercise.");
        return null;
    }

    static List<WorkoutPlanItem> Items(PlanDto dto) =>
        dto.Items.Select((i, n) => new WorkoutPlanItem { Order = n, Name = i.Name.Trim(), Met = i.Met, Sets = i.Sets, Reps = i.Reps, WeightKg = i.WeightKg, RestSec = i.RestSec, DurationSec = i.DurationSec }).ToList();

    static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    static IResult Invalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });
}
