using System.Security.Claims;
using System.Text.Json.Serialization;
using FitnessTracker.Api;
using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Resend;

var builder = WebApplication.CreateBuilder(args);
var cfg = builder.Configuration;

builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite(cfg.GetConnectionString("Default")));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddMemoryCache();

builder.Services.AddAuthorization(o => o.AddPolicy("Admin", p => p.RequireRole("Admin")));
builder.Services.AddIdentityApiEndpoints<AppUser>(o =>
{
    o.SignIn.RequireConfirmedEmail = true;
    o.User.RequireUniqueEmail = true;
    o.Password.RequiredLength = 8;
    o.Password.RequireNonAlphanumeric = false;
    o.Password.RequireUppercase = false;
})
.AddRoles<IdentityRole>()
.AddEntityFrameworkStores<AppDbContext>();

builder.Services.ConfigureApplicationCookie(o =>
{
    o.ExpireTimeSpan = TimeSpan.FromDays(30);
    o.SlidingExpiration = true;
    o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});
builder.Services.Configure<SecurityStampValidatorOptions>(o => o.ValidationInterval = TimeSpan.FromMinutes(5));

var googleId = cfg["Authentication:Google:ClientId"];
var googleEnabled = !string.IsNullOrEmpty(googleId);
if (googleEnabled)
    builder.Services.AddAuthentication().AddGoogle(o =>
    {
        o.ClientId = googleId!;
        o.ClientSecret = cfg["Authentication:Google:ClientSecret"]!;
        o.SignInScheme = IdentityConstants.ExternalScheme;
    });

if (cfg["DataProtection:KeysPath"] is { Length: > 0 } keysPath)
    builder.Services.AddDataProtection().SetApplicationName("fitness-tracker").PersistKeysToFileSystem(new DirectoryInfo(keysPath));

if (cfg["Resend:ApiKey"] is { Length: > 0 } resendKey)
{
    builder.Services.AddHttpClient<ResendClient>();
    builder.Services.Configure<ResendClientOptions>(o => o.ApiToken = resendKey);
    builder.Services.AddTransient<IResend, ResendClient>();
}
builder.Services.AddSingleton<EmailService>();
builder.Services.AddSingleton<IEmailSender<AppUser>>(sp => sp.GetRequiredService<EmailService>());
builder.Services.AddHostedService<ReminderService>();

builder.Services.AddHttpClient<FoodSearch>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(15);
    c.DefaultRequestHeaders.UserAgent.ParseAdd("FitnessTracker/1.0 (self-hosted personal tracker)");
});

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
    await Seed.RunAsync(scope.ServiceProvider, cfg["Admin:Email"]);

app.UseForwardedHeaders();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

// Stamp LastSeenAt at most once an hour per user, used by the inactivity reminder.
app.Use(async (ctx, next) =>
{
    if (ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) is string uid)
    {
        var db = ctx.RequestServices.GetRequiredService<AppDbContext>();
        var cutoff = DateTime.UtcNow.AddHours(-1);
        await db.Users.Where(u => u.Id == uid && (u.LastSeenAt == null || u.LastSeenAt < cutoff))
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.LastSeenAt, DateTime.UtcNow));
    }
    await next();
});

app.MapGroup("/auth").MapIdentityApi<AppUser>();
app.MapAuthEndpoints(googleEnabled);
app.MapApiEndpoints();
app.MapAdminEndpoints();
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program { }
