using FitnessTracker.Api.Data;

namespace FitnessTracker.Api;

public static class Calc
{
    // Mifflin-St Jeor
    public static double Bmr(double kg, double cm, int age, Sex sex) =>
        10 * kg + 6.25 * cm - 5 * age + (sex == Sex.Male ? 5 : -161);

    public static double Multiplier(ActivityLevel level) => level switch
    {
        ActivityLevel.Sedentary => 1.2,
        ActivityLevel.Light => 1.375,
        ActivityLevel.Moderate => 1.55,
        ActivityLevel.Active => 1.725,
        _ => throw new ArgumentOutOfRangeException(nameof(level)),
    };

    public static readonly IReadOnlyDictionary<ExerciseType, double> Met = new Dictionary<ExerciseType, double>
    {
        [ExerciseType.Walking] = 3.5,
        [ExerciseType.Running] = 9.8,
        [ExerciseType.Cycling] = 7.5,
        [ExerciseType.Swimming] = 6.0,
        [ExerciseType.Strength] = 5.0,
        [ExerciseType.Hiit] = 8.0,
        [ExerciseType.Hiking] = 6.0,
        [ExerciseType.Rowing] = 7.0,
        [ExerciseType.Yoga] = 2.5,
    };

    public static int ExerciseKcal(ExerciseType type, int minutes, double kg) =>
        (int)Math.Round(Met[type] * kg * minutes / 60.0);

    public static int Age(DateOnly birth, DateOnly on)
    {
        var age = on.Year - birth.Year;
        if (on < birth.AddYears(age)) age--;
        return age;
    }
}
