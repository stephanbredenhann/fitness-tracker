using System.Net.Http.Headers;
using System.Text.Json;
using FitnessTracker.Api.Data;

namespace FitnessTracker.Api;

public sealed class StravaClient(HttpClient http, IConfiguration cfg)
{
    public record Token(string AccessToken, string RefreshToken, DateTime ExpiresAt);
    public record Activity(long Id, string SportType, DateOnly Date, int MovingTimeSec, double DistanceM);

    public async Task<Token> RefreshAsync(string refreshToken, CancellationToken ct)
    {
        using var res = await http.PostAsync("https://www.strava.com/oauth/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = cfg["Strava:ClientId"]!, ["client_secret"] = cfg["Strava:ClientSecret"]!,
            ["grant_type"] = "refresh_token", ["refresh_token"] = refreshToken,
        }), ct);
        res.EnsureSuccessStatusCode();
        using var doc = await res.Content.ReadFromJsonAsync<JsonDocument>(ct);
        var r = doc!.RootElement;
        return new Token(r.GetProperty("access_token").GetString()!, r.GetProperty("refresh_token").GetString()!,
            DateTimeOffset.FromUnixTimeSeconds(r.GetProperty("expires_at").GetInt64()).UtcDateTime);
    }

    public async Task<List<Activity>> ActivitiesAsync(string accessToken, long afterUnix, int page, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"https://www.strava.com/api/v3/athlete/activities?after={afterUnix}&page={page}&per_page=100");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var res = await http.SendAsync(req, ct);
        res.EnsureSuccessStatusCode();
        using var doc = await res.Content.ReadFromJsonAsync<JsonDocument>(ct);
        return doc!.RootElement.EnumerateArray().Select(a => new Activity(
            a.GetProperty("id").GetInt64(),
            a.TryGetProperty("sport_type", out var st) ? st.GetString() ?? "" : a.GetProperty("type").GetString() ?? "",
            DateOnly.FromDateTime(DateTime.Parse(a.GetProperty("start_date_local").GetString()!, null, System.Globalization.DateTimeStyles.AdjustToUniversal)),
            a.GetProperty("moving_time").GetInt32(),
            a.TryGetProperty("distance", out var d) ? d.GetDouble() : 0)).ToList();
    }

    public async Task DeauthorizeAsync(string accessToken, CancellationToken ct)
    {
        using var res = await http.PostAsync($"https://www.strava.com/oauth/deauthorize?access_token={Uri.EscapeDataString(accessToken)}", null, ct);
    }

    public static ExerciseType? Map(string sportType) => sportType switch
    {
        "Run" or "TrailRun" or "VirtualRun" => ExerciseType.Running,
        "Walk" => ExerciseType.Walking,
        "Ride" or "VirtualRide" or "GravelRide" or "MountainBikeRide" or "EBikeRide" => ExerciseType.Cycling,
        "Hike" => ExerciseType.Hiking,
        "Swim" => ExerciseType.Swimming,
        "Rowing" or "VirtualRow" => ExerciseType.Rowing,
        "WeightTraining" or "Crossfit" => ExerciseType.Strength,
        "Yoga" or "Pilates" => ExerciseType.Yoga,
        "Workout" or "HighIntensityIntervalTraining" => ExerciseType.Hiit,
        _ => null,
    };
}
