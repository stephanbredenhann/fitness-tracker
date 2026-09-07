using FitnessTracker.Api;
using FitnessTracker.Api.Data;
using Xunit;

public class CalcTests
{
    [Fact]
    public void Bmr_MifflinStJeor()
    {
        Assert.Equal(1780, Calc.Bmr(80, 180, 30, Sex.Male));
        Assert.Equal(1614, Calc.Bmr(80, 180, 30, Sex.Female));
    }

    [Fact]
    public void Multipliers()
    {
        Assert.Equal(1.2, Calc.Multiplier(ActivityLevel.Sedentary));
        Assert.Equal(1.725, Calc.Multiplier(ActivityLevel.Active));
    }

    [Fact]
    public void ExerciseKcal_MetTimesWeightTimesHours()
    {
        // running 9.8 MET, 80 kg, 30 min = 392
        Assert.Equal(392, Calc.ExerciseKcal(ExerciseType.Running, 30, 80));
        Assert.Equal(0, Calc.ExerciseKcal(ExerciseType.Walking, 0, 80));
    }

    [Fact]
    public void Age_HandlesBirthdayNotYetReached()
    {
        Assert.Equal(29, Calc.Age(new DateOnly(1996, 12, 31), new DateOnly(2026, 9, 3)));
        Assert.Equal(30, Calc.Age(new DateOnly(1996, 9, 3), new DateOnly(2026, 9, 3)));
    }

    [Theory]
    [InlineData(ExerciseType.Walking, 5.0, 3.5)]
    [InlineData(ExerciseType.Walking, 3.0, 2.0)]
    [InlineData(ExerciseType.Running, 12.0, 11.8)]
    [InlineData(ExerciseType.Running, 20.0, 19.0)]
    [InlineData(ExerciseType.Cycling, 20.0, 8.0)]
    [InlineData(ExerciseType.Cycling, 15.9, 4.0)]
    public void CardioMet_speed_bands(ExerciseType type, double kmh, double met) => Assert.Equal(met, Calc.CardioMet(type, kmh));

    [Fact]
    public void CardioMet_is_null_without_speed_table() => Assert.Null(Calc.CardioMet(ExerciseType.Swimming, 3));

    [Theory]
    [InlineData(40, 80, 6.0)]
    [InlineData(16, 80, 5.0)]
    [InlineData(15.9, 80, 3.5)]
    [InlineData(0, 80, 3.5)]
    public void StrengthMet_load_ratio(double load, double body, double met) => Assert.Equal(met, Calc.StrengthMet(load, body));

    [Fact]
    public void ExerciseKcal_uses_speed_when_distance_given()
    {
        // 5 km in 25 min = 12 km/h -> 11.8 MET x 80 kg x 25/60 = 393
        Assert.Equal(393, Calc.ExerciseKcal(ExerciseType.Running, 25, 80, 5, null));
        Assert.Equal(392, Calc.ExerciseKcal(ExerciseType.Running, 30, 80, null, null));
    }

    [Fact]
    public void ExerciseKcal_strength_averages_movement_met()
    {
        var sets = new[] { new StrengthSet { WeightKg = 40 }, new StrengthSet { WeightKg = 0 } };
        // (6.0 + 3.5) / 2 = 4.75 MET x 80 kg x 0.5 h = 190
        Assert.Equal(190, Calc.ExerciseKcal(ExerciseType.Strength, 30, 80, null, sets));
    }

    [Fact]
    public void Pace()
    {
        Assert.Equal(5.0, Calc.PaceMinPerKm(5, 25));
        Assert.Null(Calc.PaceMinPerKm(null, 25));
        Assert.Null(Calc.PaceMinPerKm(0, 25));
    }

    [Fact]
    public void PlanEstimate_sums_time_and_kcal()
    {
        var items = new[]
        {
            new WorkoutPlanItem { Met = 5.0, Sets = 3, Reps = 10, WeightKg = 40, RestSec = 60 },   // 3 x 100 s = 5 min, load ratio 0.5 -> 6.0 MET
            new WorkoutPlanItem { Met = 3.5, Sets = 3, Reps = 15, WeightKg = 0, RestSec = 60 },    // 3 x 120 s = 6 min, 3.5 MET
        };
        var (min, kcal) = Calc.PlanEstimate(items, 80);
        Assert.Equal(11, min);
        Assert.Equal((int)Math.Round(6.0 * 80 * 5 / 60.0 + 3.5 * 80 * 6 / 60.0), kcal);
        Assert.Null(Calc.PlanEstimate(items, null).Kcal);
    }

    [Fact]
    public void PlanEstimate_uses_duration_for_timed_items()
    {
        // 3 x (60 s hold + 40 s rest) = 5 min, Reps ignored
        var items = new[] { new WorkoutPlanItem { Met = 3.5, Sets = 3, Reps = 10, WeightKg = 0, RestSec = 40, DurationSec = 60 } };
        var (min, kcal) = Calc.PlanEstimate(items, 80);
        Assert.Equal(5, min);
        Assert.Equal((int)Math.Round(3.5 * 80 * 5 / 60.0), kcal);
    }

    [Fact]
    public void Streak_counts_back_from_today()
    {
        var today = new DateOnly(2026, 9, 7);
        Assert.Equal(3, Calc.Streak(new HashSet<DateOnly> { today, today.AddDays(-1), today.AddDays(-2) }, today));
        Assert.Equal(1, Calc.Streak(new HashSet<DateOnly> { today }, today));
    }

    [Fact]
    public void Streak_falls_back_to_yesterday_when_today_empty()
    {
        var today = new DateOnly(2026, 9, 7);
        Assert.Equal(2, Calc.Streak(new HashSet<DateOnly> { today.AddDays(-1), today.AddDays(-2) }, today));
        Assert.Equal(0, Calc.Streak(new HashSet<DateOnly>(), today));
    }

    [Theory]
    [InlineData("Run", ExerciseType.Running)]
    [InlineData("TrailRun", ExerciseType.Running)]
    [InlineData("GravelRide", ExerciseType.Cycling)]
    [InlineData("WeightTraining", ExerciseType.Strength)]
    [InlineData("Walk", ExerciseType.Walking)]
    public void Strava_sport_types_map(string sport, ExerciseType type) => Assert.Equal(type, StravaClient.Map(sport));

    [Fact]
    public void Unknown_strava_sport_is_null() => Assert.Null(StravaClient.Map("Golf"));
}
