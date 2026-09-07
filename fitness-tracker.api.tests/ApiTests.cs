using System.Net;
using System.Net.Http.Json;
using FitnessTracker.Api;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
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
}
