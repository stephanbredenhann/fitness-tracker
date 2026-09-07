using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<WeighIn> WeighIns => Set<WeighIn>();
    public DbSet<FoodEntry> FoodEntries => Set<FoodEntry>();
    public DbSet<Exercise> Exercises => Set<Exercise>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.Entity<Profile>().HasKey(p => p.UserId);
        b.Entity<Profile>().HasOne<AppUser>().WithOne().HasForeignKey<Profile>(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<WeighIn>().HasIndex(w => new { w.UserId, w.Date }).IsUnique();
        b.Entity<WeighIn>().HasOne<AppUser>().WithMany().HasForeignKey(w => w.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<FoodEntry>().HasIndex(f => new { f.UserId, f.Date });
        b.Entity<FoodEntry>().HasOne<AppUser>().WithMany().HasForeignKey(f => f.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Exercise>().HasIndex(e => new { e.UserId, e.Date });
        b.Entity<Exercise>().HasOne<AppUser>().WithMany().HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
