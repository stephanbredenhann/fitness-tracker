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

    // Speed bands from the ACSM Compendium of Physical Activities. Null when the type has no speed table.
    public static double? CardioMet(ExerciseType type, double kmh) => type switch
    {
        ExerciseType.Walking => kmh < 3.2 ? 2.0 : kmh < 4.0 ? 2.8 : kmh < 4.8 ? 3.0 : kmh < 5.6 ? 3.5 : kmh < 6.4 ? 4.3 : kmh < 7.2 ? 5.0 : 7.0,
        ExerciseType.Running => kmh < 6.4 ? 6.0 : kmh < 8.0 ? 8.3 : kmh < 9.7 ? 9.8 : kmh < 11.3 ? 11.0 : kmh < 12.9 ? 11.8 : kmh < 14.5 ? 12.8 : kmh < 16.1 ? 14.5 : kmh < 17.7 ? 16.0 : 19.0,
        ExerciseType.Cycling => kmh < 16 ? 4.0 : kmh < 19 ? 6.8 : kmh < 22 ? 8.0 : kmh < 26 ? 10.0 : kmh < 30 ? 12.0 : 15.8,
        _ => null,
    };

    // Resistance training light / moderate / vigorous by load relative to bodyweight.
    public static double StrengthMet(double loadKg, double bodyKg) =>
        bodyKg <= 0 ? 3.5 : loadKg / bodyKg >= 0.5 ? 6.0 : loadKg / bodyKg >= 0.2 ? 5.0 : 3.5;

    public static int ExerciseKcal(ExerciseType type, int minutes, double kg) => ExerciseKcal(type, minutes, kg, null, null);

    public static int ExerciseKcal(ExerciseType type, int minutes, double kg, double? distanceKm, IReadOnlyCollection<StrengthSet>? sets)
    {
        // ponytail: session-average MET for strength, no per-movement time split
        var met = distanceKm is > 0 && minutes > 0 ? CardioMet(type, distanceKm.Value / (minutes / 60.0)) : null;
        met ??= type == ExerciseType.Strength && sets is { Count: > 0 } ? sets.Average(s => StrengthMet(s.WeightKg, kg)) : null;
        met ??= Met[type];
        return (int)Math.Round(met.Value * kg * minutes / 60.0);
    }

    public static double? PaceMinPerKm(double? km, int minutes) => km is > 0 ? minutes / km : null;

    // ponytail: 4 s per rep fixed for reps rows, timed rows use their own seconds
    public static (int Minutes, int? Kcal) PlanEstimate(IEnumerable<WorkoutPlanItem> items, double? bodyKg)
    {
        double minutes = 0, kcal = 0;
        foreach (var i in items)
        {
            var workSec = i.DurationSec ?? i.Reps * 4;
            var min = i.Sets * (workSec + i.RestSec) / 60.0;
            minutes += min;
            if (bodyKg is double kg) kcal += Math.Max(i.Met, StrengthMet(i.WeightKg, kg)) * kg * min / 60.0;
        }
        return ((int)Math.Round(minutes), bodyKg is null ? null : (int)Math.Round(kcal));
    }

    // Counts back from today, or from yesterday when today has nothing logged yet.
    public static int Streak(IReadOnlySet<DateOnly> activeDays, DateOnly today)
    {
        var d = activeDays.Contains(today) ? today : today.AddDays(-1);
        var n = 0;
        while (activeDays.Contains(d)) { n++; d = d.AddDays(-1); }
        return n;
    }

    public static int Age(DateOnly birth, DateOnly on)
    {
        var age = on.Year - birth.Year;
        if (on < birth.AddYears(age)) age--;
        return age;
    }
}
