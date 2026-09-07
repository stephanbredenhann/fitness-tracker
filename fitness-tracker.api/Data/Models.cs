using Microsoft.AspNetCore.Identity;

namespace FitnessTracker.Api.Data;

public class AppUser : IdentityUser
{
    public string? DisplayName { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSeenAt { get; set; }
    public DateTime? LastReminderAt { get; set; }
}

public enum Sex { Male, Female }
public enum ActivityLevel { Sedentary, Light, Moderate, Active }
public enum ExerciseType { Walking, Running, Cycling, Swimming, Strength, Hiit, Hiking, Rowing, Yoga, Other }
public enum ExerciseSource { Manual, Strava }
public enum Equipment { Bodyweight, Dumbbell, Kettlebell, Band, AbWheel, Other }
public enum MuscleGroup { Chest, Back, Shoulders, Arms, Legs, Core, FullBody }

public class Profile
{
    public string UserId { get; set; } = "";
    public double HeightCm { get; set; }
    public double GoalWeightKg { get; set; }
    public DateOnly BirthDate { get; set; }
    public Sex Sex { get; set; }
    public ActivityLevel ActivityLevel { get; set; }
}

public class WeighIn
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public DateOnly Date { get; set; }
    public double WeightKg { get; set; }
}

public class FoodEntry
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public DateOnly Date { get; set; }
    public string Name { get; set; } = "";
    public int Kcal { get; set; }
    public double? Grams { get; set; }
    public double? ProteinG { get; set; }
    public double? CarbsG { get; set; }
    public double? FatG { get; set; }
    public string? Barcode { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Exercise
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public DateOnly Date { get; set; }
    public ExerciseType Type { get; set; }
    public int DurationMin { get; set; }
    public double? DistanceKm { get; set; }
    public int Kcal { get; set; }
    public ExerciseSource Source { get; set; } = ExerciseSource.Manual;
    public string? ExternalId { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<StrengthSet> Sets { get; set; } = [];
}

// One row per movement in a strength session, e.g. dumbbell press 3 x 10 at 12 kg. WeightKg 0 means bodyweight.
public class StrengthSet
{
    public int Id { get; set; }
    public int ExerciseId { get; set; }
    public string Name { get; set; } = "";
    public int Sets { get; set; }
    public int Reps { get; set; }
    public double WeightKg { get; set; }
}

// Picker source for plans and strength logging. OwnerUserId null means a built-in seeded row.
public class LibraryExercise
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public Equipment Equipment { get; set; }
    public MuscleGroup Muscle { get; set; }
    public double Met { get; set; }
    public string? OwnerUserId { get; set; }
}

public class WorkoutPlan
{
    public int Id { get; set; }
    public string OwnerUserId { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsShared { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<WorkoutPlanItem> Items { get; set; } = [];
}

// Name and Met are copied from the library so shared plans stay readable if the source exercise is deleted.
public class WorkoutPlanItem
{
    public int Id { get; set; }
    public int PlanId { get; set; }
    public int Order { get; set; }
    public string Name { get; set; } = "";
    public double Met { get; set; }
    public int Sets { get; set; }
    public int Reps { get; set; }
    public double WeightKg { get; set; }
    public int RestSec { get; set; } = 60;
}

// One Strava connection per user. Tokens are stored protected with the app's Data Protection keys.
public class StravaLink
{
    public string UserId { get; set; } = "";
    public long AthleteId { get; set; }
    public string AccessToken { get; set; } = "";
    public string RefreshToken { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime? LastSyncAt { get; set; }
}
