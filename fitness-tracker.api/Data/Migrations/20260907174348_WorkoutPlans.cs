using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FitnessTracker.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class WorkoutPlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "LibraryExercises",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Equipment = table.Column<int>(type: "INTEGER", nullable: false),
                    Muscle = table.Column<int>(type: "INTEGER", nullable: false),
                    Met = table.Column<double>(type: "REAL", nullable: false),
                    OwnerUserId = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LibraryExercises", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LibraryExercises_AspNetUsers_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkoutPlans",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    OwnerUserId = table.Column<string>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: true),
                    IsShared = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkoutPlans", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkoutPlans_AspNetUsers_OwnerUserId",
                        column: x => x.OwnerUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WorkoutPlanItem",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    PlanId = table.Column<int>(type: "INTEGER", nullable: false),
                    Order = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", nullable: false),
                    Met = table.Column<double>(type: "REAL", nullable: false),
                    Sets = table.Column<int>(type: "INTEGER", nullable: false),
                    Reps = table.Column<int>(type: "INTEGER", nullable: false),
                    WeightKg = table.Column<double>(type: "REAL", nullable: false),
                    RestSec = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkoutPlanItem", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkoutPlanItem_WorkoutPlans_PlanId",
                        column: x => x.PlanId,
                        principalTable: "WorkoutPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_LibraryExercises_OwnerUserId",
                table: "LibraryExercises",
                column: "OwnerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutPlanItem_PlanId",
                table: "WorkoutPlanItem",
                column: "PlanId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutPlans_IsShared",
                table: "WorkoutPlans",
                column: "IsShared");

            migrationBuilder.CreateIndex(
                name: "IX_WorkoutPlans_OwnerUserId",
                table: "WorkoutPlans",
                column: "OwnerUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LibraryExercises");

            migrationBuilder.DropTable(
                name: "WorkoutPlanItem");

            migrationBuilder.DropTable(
                name: "WorkoutPlans");
        }
    }
}
