using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FitnessTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ExerciseDetail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "DistanceKm",
                table: "Exercises",
                type: "REAL",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StrengthSets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ExerciseId = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Sets = table.Column<int>(type: "INTEGER", nullable: false),
                    Reps = table.Column<int>(type: "INTEGER", nullable: false),
                    WeightKg = table.Column<double>(type: "REAL", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StrengthSets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StrengthSets_Exercises_ExerciseId",
                        column: x => x.ExerciseId,
                        principalTable: "Exercises",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Exercises_UserId_ExternalId",
                table: "Exercises",
                columns: new[] { "UserId", "ExternalId" },
                unique: true,
                filter: "ExternalId IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StrengthSets_ExerciseId",
                table: "StrengthSets",
                column: "ExerciseId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StrengthSets");

            migrationBuilder.DropIndex(
                name: "IX_Exercises_UserId_ExternalId",
                table: "Exercises");

            migrationBuilder.DropColumn(
                name: "DistanceKm",
                table: "Exercises");
        }
    }
}
