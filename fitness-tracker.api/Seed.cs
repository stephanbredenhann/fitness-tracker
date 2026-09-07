using FitnessTracker.Api.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api;

public static class Seed
{
    public static async Task RunAsync(IServiceProvider sp, string? adminEmail)
    {
        var db = sp.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();

        var roles = sp.GetRequiredService<RoleManager<IdentityRole>>();
        if (!await roles.RoleExistsAsync("Admin")) await roles.CreateAsync(new IdentityRole("Admin"));

        if (string.IsNullOrWhiteSpace(adminEmail)) return;
        var um = sp.GetRequiredService<UserManager<AppUser>>();
        var admin = await um.FindByEmailAsync(adminEmail);
        if (admin is null)
        {
            admin = new AppUser { UserName = adminEmail, Email = adminEmail, EmailConfirmed = true };
            var result = await um.CreateAsync(admin);
            if (!result.Succeeded) throw new InvalidOperationException(string.Join("; ", result.Errors.Select(e => e.Description)));
        }
        if (!await um.IsInRoleAsync(admin, "Admin")) await um.AddToRoleAsync(admin, "Admin");
    }
}
