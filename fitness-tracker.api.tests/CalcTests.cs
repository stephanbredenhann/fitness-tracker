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
}
