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
    public int Kcal { get; set; }
    public ExerciseSource Source { get; set; } = ExerciseSource.Manual;
    public string? ExternalId { get; set; }
    public string? Note { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
