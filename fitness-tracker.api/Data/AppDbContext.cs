using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FitnessTracker.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Profile> Profiles => Set<Profile>();
    public DbSet<WeighIn> WeighIns => Set<WeighIn>();
    public DbSet<FoodEntry> FoodEntries => Set<FoodEntry>();
    public DbSet<Exercise> Exercises => Set<Exercise>();
    public DbSet<StrengthSet> StrengthSets => Set<StrengthSet>();
    public DbSet<LibraryExercise> LibraryExercises => Set<LibraryExercise>();
    public DbSet<WorkoutPlan> WorkoutPlans => Set<WorkoutPlan>();
    public DbSet<StravaLink> StravaLinks => Set<StravaLink>();

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
        b.Entity<Exercise>().HasIndex(e => new { e.UserId, e.ExternalId }).IsUnique().HasFilter("ExternalId IS NOT NULL");
        b.Entity<Exercise>().HasMany(e => e.Sets).WithOne().HasForeignKey(s => s.ExerciseId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<LibraryExercise>().HasIndex(x => x.OwnerUserId);
        b.Entity<LibraryExercise>().HasOne<AppUser>().WithMany().HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<WorkoutPlan>().HasIndex(p => p.OwnerUserId);
        b.Entity<WorkoutPlan>().HasIndex(p => p.IsShared);
        b.Entity<WorkoutPlan>().HasOne<AppUser>().WithMany().HasForeignKey(p => p.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<StravaLink>().HasKey(s => s.UserId);
        b.Entity<StravaLink>().HasOne<AppUser>().WithOne().HasForeignKey<StravaLink>(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<WorkoutPlan>().HasMany(p => p.Items).WithOne().HasForeignKey(i => i.PlanId).OnDelete(DeleteBehavior.Cascade);
    }
}
