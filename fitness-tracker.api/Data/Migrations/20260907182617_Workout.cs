using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FitnessTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Workout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DurationSec",
                table: "WorkoutPlanItem",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DurationSec",
                table: "StrengthSets",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DurationSec",
                table: "WorkoutPlanItem");

            migrationBuilder.DropColumn(
                name: "DurationSec",
                table: "StrengthSets");
        }
    }
}
