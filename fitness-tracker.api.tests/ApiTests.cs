using System.Net;
using System.Net.Http.Json;
using FitnessTracker.Api;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

public sealed class TestApp : WebApplicationFactory<Program>
{
    readonly string _db = Path.Combine(Path.GetTempPath(), $"ft-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder b)
    {
        b.UseSetting("ConnectionStrings:Default", $"Data Source={_db}");
        b.UseSetting("Admin:Email", "admin@test.local");
        b.UseSetting("Strava:ClientId", "test-client");
        b.UseSetting("Strava:ClientSecret", "test-secret");
        b.ConfigureTestServices(s => s.AddHttpClient<StravaClient>().ConfigurePrimaryHttpMessageHandler(() => new FakeStrava()));
    }

    public async Task<HttpClient> LoginAsync(string email, bool admin = false)
    {
        using (var scope = Services.CreateScope())
        {
            var um = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            if (await um.FindByEmailAsync(email) is null)
            {
                var u = new AppUser { UserName = email, Email = email, EmailConfirmed = true };
                Assert.True((await um.CreateAsync(u, "Password1!")).Succeeded);
                if (admin) await um.AddToRoleAsync(u, "Admin");
            }
        }
        var client = CreateClient();
        var res = await client.PostAsJsonAsync("/auth/login?useCookies=true", new { email, password = "Password1!" });
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        foreach (var f in Directory.GetFiles(Path.GetDirectoryName(_db)!, Path.GetFileName(_db) + "*")) File.Delete(f);
    }
}

public class ApiTests : IClassFixture<TestApp>
{
    readonly TestApp _app;
    public ApiTests(TestApp app) => _app = app;

    [Fact]
    public async Task Anonymous_gets_401_not_redirect()
    {
        var res = await _app.CreateClient().GetAsync("/api/profile");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Admin_endpoints_require_admin_role()
    {
        var user = await _app.LoginAsync("plain@test.local");
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/admin/users")).StatusCode);

        var admin = await _app.LoginAsync("boss@test.local", admin: true);
        var res = await admin.GetAsync("/api/admin/users");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var users = await res.Content.ReadFromJsonAsync<List<AdminEndpoints.UserDto>>();
        Assert.Contains(users!, u => u.Email == "admin@test.local" && u.IsAdmin);
    }

    [Fact]
    public async Task Users_only_see_their_own_data()
    {
        var a = await _app.LoginAsync("a@test.local");
        var b = await _app.LoginAsync("b@test.local");
        var put = await a.PutAsJsonAsync("/api/weighins/2026-09-01", new { weightKg = 82.5 });
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);

        var mine = await a.GetFromJsonAsync<List<object>>("/api/weighins");
        var theirs = await b.GetFromJsonAsync<List<object>>("/api/weighins");
        Assert.Single(mine!);
        Assert.Empty(theirs!);
    }

    [Fact]
    public async Task Exercise_kcal_is_estimated_from_latest_weight()
    {
        var c = await _app.LoginAsync("runner@test.local");
        var noWeight = await c.PostAsJsonAsync("/api/exercises", new { date = "2026-09-02", type = "Running", durationMin = 30 });
        Assert.Equal(HttpStatusCode.BadRequest, noWeight.StatusCode);

        await c.PutAsJsonAsync("/api/weighins/2026-09-01", new { weightKg = 80 });
        var res = await c.PostAsJsonAsync("/api/exercises", new { date = "2026-09-02", type = "Running", durationMin = 30 });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var ex = await res.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(392, ex.GetProperty("kcal").GetInt32());
    }

    [Fact]
    public async Task Reminder_due_query()
    {
        using var scope = _app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = DateTime.UtcNow;
        var u = new AppUser { UserName = "lapsed@test.local", Email = "lapsed@test.local", EmailConfirmed = true, LastSeenAt = now.AddDays(-3) };
        db.Users.Add(u);
        await db.SaveChangesAsync();

        Assert.Contains(await ReminderService.Due(db, now).ToListAsync(), x => x.Id == u.Id);

        u.LastReminderAt = now;
        await db.SaveChangesAsync();
        Assert.DoesNotContain(await ReminderService.Due(db, now).ToListAsync(), x => x.Id == u.Id);

        u.LastReminderAt = null;
        u.LockoutEnd = DateTimeOffset.MaxValue;
        await db.SaveChangesAsync();
        Assert.DoesNotContain(await ReminderService.Due(db, now).ToListAsync(), x => x.Id == u.Id);
    }

    [Fact]
    public async Task Backup_then_restore_returns_to_snapshot()
    {
        var admin = await _app.LoginAsync("dba@test.local", admin: true);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/weighins/2026-08-01", new { weightKg = 90 })).StatusCode);
        var backup = await admin.GetByteArrayAsync("/api/admin/backup");
        Assert.Equal("SQLite format 3", System.Text.Encoding.ASCII.GetString(backup, 0, 15));
        await admin.PutAsJsonAsync("/api/weighins/2026-08-02", new { weightKg = 91 });
        Assert.Equal(2, (await admin.GetFromJsonAsync<List<object>>("/api/weighins"))!.Count);

        using var junk = new MultipartFormDataContent { { new ByteArrayContent(new byte[100]), "file", "junk.bac" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/restore", junk)).StatusCode);

        using var form = new MultipartFormDataContent { { new ByteArrayContent(backup), "file", "fitness.bac" } };
        var res = await admin.PostAsync("/api/admin/restore", form);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Single((await admin.GetFromJsonAsync<List<object>>("/api/weighins"))!);
    }

    [Fact]
    public async Task Shared_plans_are_visible_and_copyable_but_not_editable_by_others()
    {
        var a = await _app.LoginAsync("plan-a@test.local");
        var b = await _app.LoginAsync("plan-b@test.local");
        var item = new { name = "Push-up", met = 5.0, sets = 3, reps = 12, weightKg = 0, restSec = 60 };
        var shared = await a.PostAsJsonAsync("/api/plans", new { name = "Upper body", description = "Quick", isShared = true, items = new[] { item } });
        Assert.Equal(HttpStatusCode.Created, shared.StatusCode);
        var sharedId = (await shared.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var secret = await a.PostAsJsonAsync("/api/plans", new { name = "Private", isShared = false, items = new[] { item } });
        var secretId = (await secret.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();

        var list = await b.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/plans");
        var sharedNames = list.GetProperty("shared").EnumerateArray().Select(x => x.GetProperty("name").GetString()).ToList();
        Assert.Contains("Upper body", sharedNames);
        Assert.DoesNotContain("Private", sharedNames);
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/api/plans/{secretId}")).StatusCode);

        var edit = await b.PutAsJsonAsync($"/api/plans/{sharedId}", new { name = "Hijacked", isShared = true, items = new[] { item } });
        Assert.Equal(HttpStatusCode.NotFound, edit.StatusCode);

        var copy = await b.PostAsync($"/api/plans/{sharedId}/copy", null);
        Assert.Equal(HttpStatusCode.Created, copy.StatusCode);
        var copied = await copy.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal("Upper body (copy)", copied.GetProperty("name").GetString());
        Assert.True(copied.GetProperty("isMine").GetBoolean());
        Assert.False(copied.GetProperty("isShared").GetBoolean());

        var library = await b.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/library");
        Assert.Contains(library!, x => x.GetProperty("name").GetString() == "Ab wheel rollout");
    }

    [Fact]
    public async Task Timed_sets_round_trip()
    {
        var c = await _app.LoginAsync("timed@test.local");
        await c.PutAsJsonAsync("/api/weighins/2026-09-01", new { weightKg = 80 });

        var plan = await c.PostAsJsonAsync("/api/plans", new { name = "Core hold", isShared = false, items = new[] { new { name = "Plank", met = 3.5, sets = 3, reps = 1, weightKg = 0, restSec = 30, durationSec = 60 } } });
        Assert.Equal(HttpStatusCode.Created, plan.StatusCode);
        var planId = (await plan.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("id").GetInt32();
        var got = await c.GetFromJsonAsync<System.Text.Json.JsonElement>($"/api/plans/{planId}");
        Assert.Equal(60, got.GetProperty("items")[0].GetProperty("durationSec").GetInt32());

        var ex = await c.PostAsJsonAsync("/api/exercises", new { date = "2026-09-02", type = "Strength", durationMin = 10, sets = new[] { new { name = "Plank", sets = 3, reps = 1, weightKg = 0, durationSec = 60 } } });
        Assert.Equal(HttpStatusCode.Created, ex.StatusCode);
        var logged = await ex.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(60, logged.GetProperty("sets")[0].GetProperty("durationSec").GetInt32());

        var tooShort = await c.PostAsJsonAsync("/api/exercises", new { date = "2026-09-02", type = "Strength", durationMin = 10, sets = new[] { new { name = "Plank", sets = 3, reps = 1, weightKg = 0, durationSec = 2 } } });
        Assert.Equal(HttpStatusCode.BadRequest, tooShort.StatusCode);
    }

    [Fact]
    public async Task Strava_sync_imports_once_and_computes_kcal()
    {
        var c = await _app.LoginAsync("strava@test.local");
        await c.PutAsJsonAsync("/api/weighins/2026-09-01", new { weightKg = 80 });
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/strava/sync", null)).StatusCode);

        using (var scope = _app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var um = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var protector = scope.ServiceProvider.GetRequiredService<IDataProtectionProvider>().CreateProtector("strava");
            var uid = (await um.FindByEmailAsync("strava@test.local"))!.Id;
            db.StravaLinks.Add(new StravaLink { UserId = uid, AthleteId = 1, AccessToken = protector.Protect("expired"), RefreshToken = protector.Protect("r1"), ExpiresAt = DateTime.UtcNow.AddMinutes(-1) });
            await db.SaveChangesAsync();
        }

        var first = await (await c.PostAsync("/api/strava/sync", null)).Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(2, first.GetProperty("imported").GetInt32());
        Assert.Equal(1, first.GetProperty("skipped").GetInt32());
        var second = await (await c.PostAsync("/api/strava/sync", null)).Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.Equal(0, second.GetProperty("imported").GetInt32());

        var list = await c.GetFromJsonAsync<List<System.Text.Json.JsonElement>>("/api/exercises?from=2026-09-01&to=2026-09-07");
        var run = list!.Single(e => e.GetProperty("type").GetString() == "Running");
        Assert.Equal("Strava", run.GetProperty("source").GetString());
        Assert.Equal(5.0, run.GetProperty("distanceKm").GetDouble());
        Assert.Equal(Calc.ExerciseKcal(ExerciseType.Running, 25, 80, 5, null), run.GetProperty("kcal").GetInt32());

        var status = await c.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/strava/status");
        Assert.True(status.GetProperty("connected").GetBoolean());
        Assert.Equal(HttpStatusCode.NoContent, (await c.DeleteAsync("/api/strava/")).StatusCode);
        Assert.False((await c.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/strava/status")).GetProperty("connected").GetBoolean());
        Assert.True(FakeStrava.Refreshed);
    }
}

// Stands in for Strava: one token refresh, a page with a run, a ride and an unmapped activity, then nothing.
sealed class FakeStrava : HttpMessageHandler
{
    public static bool Refreshed;
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        var path = req.RequestUri!.AbsolutePath;
        string body = "[]";
        if (path == "/oauth/token") { Refreshed = true; body = """{"access_token":"a2","refresh_token":"r2","expires_at":4102444800}"""; }
        else if (path == "/api/v3/athlete/activities" && req.RequestUri.Query.Contains("page=1"))
            body = """
            [{"id":101,"sport_type":"Run","start_date_local":"2026-09-05T07:00:00Z","moving_time":1500,"distance":5000},
             {"id":102,"sport_type":"Ride","start_date_local":"2026-09-06T07:00:00Z","moving_time":3600,"distance":22000},
             {"id":103,"sport_type":"Golf","start_date_local":"2026-09-06T09:00:00Z","moving_time":7200,"distance":0}]
            """;
        return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.OK) { Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json") });
    }
}
