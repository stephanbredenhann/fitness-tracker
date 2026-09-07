# Fitness Tracker: food search fix, exercise rework, plans, Strava

## Context

The tracker (`.NET 10` minimal API + EF Core + SQLite, Angular 22 standalone + signals + Material + ng2-charts) is live for the owner and friends. Five asks, delivered as five independently shippable phases in this order:

1. **Food search breaks after one search.** Root cause found and reproduced: Open Food Facts rate-limits `world.openfoodfacts.org/api/v2/product/{code}` to about 10 requests per minute per IP. `FoodSearch.SearchAsync` does 1 search + 10 parallel product fetches, so search one spends the whole budget and search two gets 429 → `HttpRequestException` → 502 "Food search is unavailable right now". The 24h cache on the first query makes it look like the client broke. Verified today that `search.openfoodfacts.org` returns `nutriments` when asked in `fields`, so the fan-out can be deleted entirely.
2. **Exercise rework.** Cardio (running, walking, cycling, hiking, swimming, rowing) takes distance + time, app computes pace and calories with speed-based MET. Strength takes sets, reps and weight per movement. Per-type trend charts.
3. **Design pass.** More responsive and interactive, mobile-friendly on every page.
4. **Workout plan builder.** Exercise library (dumbbell, light weights, bodyweight, ab wheel), plans private or shared with all users, estimated burn per plan, users can add their own library exercises with a manual intensity.
5. **Strava.** Connect account, manual "Sync now" pulls activities into exercises. No webhook.
6. **Database backup and restore.** Admin downloads a `.bac` snapshot and can upload one to restore. Placed second in the build order so a backup exists before the first schema migration.

Decisions confirmed with the user: one phased plan; strength logs sets/reps/kg per movement; Strava manual sync only; shared plans are view + copy (owner-only edit); speed-based MET for cardio calories.

First implementation step: save this plan's design content as `docs/superpowers/specs/2026-09-07-exercise-plans-strava-design.md` so the repo carries the decisions, then start Phase 1.

Conventions to keep (from `docs/superpowers/specs/2026-09-03-fitness-tracker-design.md`): dense one-file components with inline template/styles, signals not RxJS, blue/white minimal theme via CSS vars in `src/styles.scss`, logic and tests server-side (xUnit in `fitness-tracker.api.tests`), no Angular unit tests, metric only, no em dashes, one-line comments. **No git commands from the assistant**; migration and git commands are handed to the user as text. Every phase ends with `dotnet test` green and `ng build --configuration production` green (Node 24: `nvm use 24` first).

---

## Phase 1: Food search fix

**Files:** `fitness-tracker.api/FoodSearch.cs`, `fitness-tracker.api/ApiEndpoints.cs:117-121`, `fitness-tracker.web/src/app/pages/food.ts`, new `fitness-tracker.api.tests/FoodSearchTests.cs`.

- `FoodSearch.SearchAsync`: one GET to `https://search.openfoodfacts.org/search?q=…&langs=en&page_size=25&fields=code,product_name,brands,nutriments`. Delete `Fetch`. Move JSON → `Hit` mapping into `public static List<Hit> Parse(JsonElement root)` so it is testable without HTTP: keep hits that have `energy-kcal_100g` (or `energy_100g` kJ / 4.184) and a name, `brands` is an array in this API so take the first element, dedupe by code, take 10. Update the `ponytail:` comment (now: "search index only, no per-product fetch; OFF product API is 10 req/min so never fan out").
- Endpoint: catch `Exception` when `!ct.IsCancellationRequested` (timeouts surface as `TaskCanceledException`, malformed payloads as `KeyNotFoundException`, both currently escape as 500) → 502 with the existing message. Keep cache at 24h.
- `food.ts`: fix the out-of-order race with a request counter (`const seq = ++this.seq; … if (seq !== this.seq) return;`), clear `results` on error, clear `searchError` on success. Three lines.
- Test: `FoodSearchTests.Parse_keeps_only_hits_with_kcal_and_reads_first_brand` against a fixed JSON string modelled on the real response captured today (some hits have no `nutriments`).

Check: run API, type three different foods within a minute, all return results.

---

## Phase 1b: Database backup and restore (admin only)

**Files:** `fitness-tracker.api/AdminEndpoints.cs` (two endpoints in the existing `/api/admin` group), `fitness-tracker.web/src/app/pages/admin.ts` (one new panel), `ApiTests.cs` (one round-trip test).

- **Download** `GET /api/admin/backup`: open the live connection from `AppDbContext.Database.GetDbConnection()`, `VACUUM INTO '{tmp}'` (consistent snapshot, works while the app is running, built into SQLite, no extra package), stream the file as `application/octet-stream` named `fitness-{yyyyMMdd-HHmm}.bac`, delete the temp file after. The `.bac` is a plain SQLite database, so it can also be opened with any SQLite tool.
- **Restore** `POST /api/admin/restore` (multipart `file`, limit 200 MB via `RequestSizeLimit`): save to temp; validate the first 16 bytes are `SQLite format 3\0` and that opening it read-only shows a `__EFMigrationsHistory` table (rejects random files); write a safety copy of the current DB to `{dataDir}/backups/pre-restore-{ts}.bac` via `VACUUM INTO`; `SqliteConnection.ClearAllPools()` so no pooled handle holds the old file; `File.Copy(tmp, dbPath, overwrite: true)` and delete stale `-wal`/`-shm` siblings; `await db.Database.MigrateAsync()` so an older backup is brought up to the current schema; return `{ restoredFrom, safetyCopy }`. The DB path comes from the connection string (`SqliteConnectionStringBuilder(...).DataSource`). Users stay signed in because Data Protection keys live outside the DB (`/data/keys`); Identity security stamps that changed since the backup will log those users out on their next request, which is correct.
- **Admin page:** "Database" panel under the users table with a Download backup link (`<a href="/api/admin/backup" download>`), a file input accepting `.bac`, and a Restore button that opens a `confirm()` naming the file and stating that current data is replaced and a safety copy is kept. Show the result or error inline.
- **Test:** login as admin, log a weigh-in, download backup, log a second weigh-in, restore the backup, assert only the first weigh-in remains. Runs against the temp SQLite file the fixture already uses.
- Restore is destructive by nature; the safety copy plus the confirm dialog are the guard rails. Non-admins get 403 from the existing group policy.

---

## Phase 2: Exercise rework (distance, pace, calories, sets, charts)

### Data (`fitness-tracker.api/Data/Models.cs`, `AppDbContext.cs`, one migration `ExerciseDetail`)

- `Exercise` gains `double? DistanceKm`.
- New `StrengthSet { int Id, int ExerciseId, string Name, int Sets, int Reps, double WeightKg }` (one row per movement; `WeightKg` 0 = bodyweight). `HasOne<Exercise>().WithMany(e => e.Sets)` cascade. `Exercise.Sets` navigation `List<StrengthSet>`.
- Partial unique index on Exercise now so Strava sync is idempotent: `HasIndex(e => new { e.UserId, e.ExternalId }).IsUnique().HasFilter("ExternalId IS NOT NULL")`.
- Only nullable columns are added to existing tables (SQLite rebuilds the table for anything else). Enum values are appended, never reordered.
- User runs: `cd fitness-tracker.api && dotnet tool restore && dotnet dotnet-ef migrations add ExerciseDetail -o Data/Migrations` (I write the model, hand over the command, then verify the generated migration compiles). The empty `20260903115513_IntialCreate` migration is already applied on the VPS DB; leave it.

### Calc (`fitness-tracker.api/Calc.cs`, tests in `CalcTests.cs`)

- `Calc.CardioMet(ExerciseType, double kmh)`: speed bands from the ACSM compendium. Walking `<3.2:2.0, <4.0:2.8, <4.8:3.0, <5.6:3.5, <6.4:4.3, <7.2:5.0, else 7.0`. Running `<6.4:6.0, <8.0:8.3, <9.7:9.8, <11.3:11.0, <12.9:11.8, <14.5:12.8, <16.1:14.5, <17.7:16.0, else 19.0`. Cycling `<16:4.0, <19:6.8, <22:8.0, <26:10.0, <30:12.0, else 15.8`. Other types with distance fall back to the fixed `Met` table.
- `Calc.StrengthMet(double loadKg, double bodyKg)`: `ratio >= 0.5 → 6.0, >= 0.2 → 5.0, else 3.5` (compendium resistance training vigorous / moderate / light). This is how "weights" feed the estimate.
- `Calc.ExerciseKcal(type, minutes, kg, distanceKm?, sets?)`: cardio with distance → `CardioMet(type, km / (min/60))`; strength with movements → plain average of `StrengthMet(WeightKg, kg)` over the movements, applied to the whole session duration (`// ponytail: session-average MET, no per-movement time split`); otherwise existing `Met[type]`. `Other` still requires manual kcal, guarded at the endpoint as today.
- `Calc.PaceMinPerKm(km, min)` returns `double?` (null when km <= 0). Client formats `m:ss`.
- Tests: one fact per band table edge (walking 5 km/h = 3.5, running 12 km/h = 11.8, cycling 20 km/h = 8.0), strength ratio cutoffs, pace.

### API (`ApiEndpoints.cs`)

- `ExerciseDto` gains `double? DistanceKm`, `List<StrengthSetDto>? Sets` (`Name, Sets, Reps, WeightKg`). Validation: distance 0.01 to 1000, sets 1 to 20, reps 1 to 500, weight 0 to 500, name required, max 30 movements.
- `POST /api/exercises` computes kcal via the new `Calc.ExerciseKcal`; persists `Sets`.
- `GET /api/exercises` signature becomes `(DateOnly? date, DateOnly? from, DateOnly? to)` mirroring `/weighins` (span clamped to 365 days), `.Include(e => e.Sets)`, returns a projection `{ id, date, type, durationMin, distanceKm, kcal, source, note, sets }` instead of the raw entity (stops leaking `UserId`).
- `GET /api/exercises/types` unchanged.

### Web (`pages/exercise.ts`, `core/api.ts`)

- Type picker becomes a horizontal chip row (native buttons styled like the existing `.chip` in `food.ts`, promote `.chip` to `styles.scss`). Cardio types show Duration + Distance (optional) fields, live "Pace 5:12 /km · ~410 kcal" preview using the same band tables ported to `core/calc.ts` (mirror of `Calc.cs`, kept in one file so the two stay side by side). Strength shows Duration + a movement list: rows of Name (with `<datalist>` from `/api/library` once Phase 4 exists; free text until then), Sets, Reps, kg, an "Add movement" button, and a live kcal estimate.
- Entry list shows type, duration, distance and pace, or "4 movements · 2,340 kg volume" for strength, with an expandable `<details>` for the sets.
- **Trends panel** at the bottom of `/exercise`: type toggle (Running, Walking, Cycling, Strength) + 30/90 day toggle, loads `GET /api/exercises?from&to`, draws with the existing `BaseChartDirective` and the `base` options object lifted out of `dashboard.ts` into `shared/chart-defaults.ts`. Cardio: bars = distance per day, line on the second axis = pace (inverted axis so faster is higher). Strength: bars = volume (Σ sets×reps×kg) per day. Below each chart a one-line summary (total distance, average pace, sessions). Load `dataviz` skill before writing the chart config.

Check: log a 5 km run in 25 min → pace 5:00, kcal matches `CalcTests` value; log a strength session with three movements; both appear in Trends.

---

## Phase 3: Design pass (responsive, interactive, mobile-first)

**Files:** `src/styles.scss`, `shell/shell.ts`, `shared/date-nav.ts`, `pages/dashboard.ts`, `pages/food.ts`, `pages/exercise.ts`, `pages/admin.ts`, `src/index.html`. Load `frontend-design` skill first; stay inside the blue/white palette already in `:root`.

- **Shell:** at `≤ 700px` the top nav becomes a fixed bottom tab bar (icon + label, 56px, `padding-bottom: env(safe-area-inset-bottom)`), brand stays in a slim top bar. Above 700px unchanged. Add `<meta name="theme-color">` and `viewport-fit=cover` in `index.html`. `main` gets bottom padding for the tab bar.
- **Layout tokens:** `.wrap` padding 16px on mobile; `.panel` padding 16px on mobile; `.fields` already collapses. Tap targets: `.icon-btn` and `.chip` min 44px hit area on touch (`@media (pointer: coarse)`).
- **Date nav** sticks under the header on mobile (`position: sticky; top: 56px`).
- **Charts:** `.chart` height 220px on mobile, `maxTicksLimit` 5 on narrow widths.
- **Interactive:** `MatSnackBar` "Added" / "Removed" toasts with an Undo action on delete (re-POSTs the entry; needs the removed object which the list already has). Optimistic list update on add (push the returned entity, no full reload). `MatProgressBar mode="indeterminate"` at the top of each page while its first load is pending. Number inputs get `inputmode="decimal"` so phones show a numeric keypad.
- **Admin table** collapses to stacked cards under 700px (`display: block` rows with `data-label` pseudo elements).
- **Dashboard hero** already collapses; add the exercise type mix for the range as small stat tiles (sessions per type from the new range endpoint).

Check: Chrome device toolbar at 375×812 and 768×1024 on every route; no horizontal scroll; every action reachable with a thumb; Lighthouse mobile accessibility ≥ 95.

---

## Phase 4: Workout plan builder

### Data (`Models.cs`, `AppDbContext.cs`, `Seed.cs`, migration `WorkoutPlans`)

- `LibraryExercise { int Id, string Name, Equipment Equipment, MuscleGroup Muscle, double Met, string? OwnerUserId }`. Enums `Equipment { Bodyweight, Dumbbell, Kettlebell, Band, AbWheel, Other }`, `MuscleGroup { Chest, Back, Shoulders, Arms, Legs, Core, FullBody }`. `OwnerUserId` null = built-in. It is a picker source only: nothing references it by FK, so a user can delete their own custom exercise at any time.
- Seeded in `Seed.RunAsync` from a static list in new `fitness-tracker.api/LibrarySeed.cs` (~40 rows: dumbbell press/row/curl/lunge/goblet squat/RDL/lateral raise/overhead press/renegade row/farmer carry; bodyweight push-up/pull-up/squat/lunge/plank/burpee/mountain climber/glute bridge/dip/pike push-up; ab wheel rollout/kneeling rollout/plank walkout; band and kettlebell basics). Idempotent the cheap way: insert the whole list only when no built-in rows exist yet. MET 3.5 (light: curls, raises, planks), 5.0 (moderate: presses, rows, squats), 8.0 (vigorous: burpees, mountain climbers, kettlebell swings).
- `WorkoutPlan { int Id, string OwnerUserId, string Name, string? Description, bool IsShared, DateTime CreatedAt, List<WorkoutPlanItem> Items }`, `WorkoutPlanItem { int Id, int PlanId, int Order, string Name, double Met, int Sets, int Reps, double WeightKg, int RestSec }` (RestSec default 60). Name and Met are copied from the library at edit time, the same denormalisation `StrengthSet` uses. Cascade plan → items. This keeps shared plans readable by everyone even when they use an owner's custom exercise, and makes copy a plain clone.

### Calc

- `Calc.PlanEstimate(items, bodyKg)` → `(int minutes, int kcal)`: minutes = Σ `Sets * (Reps * 4 + RestSec) / 60`, kcal = Σ per item `max(item.Met, StrengthMet(WeightKg, bodyKg))` × bodyKg × itemMinutes/60. `// ponytail: 4 s per rep fixed, make it per-exercise if estimates feel off`. Tests: one plan fixture.

### API (new `fitness-tracker.api/PlanEndpoints.cs`, mapped in `Program.cs`)

- `GET /api/library` → built-ins + mine. `POST /api/library` (`Name, Equipment, Muscle, Met`) mine only. `DELETE /api/library/{id}` mine only.
- `GET /api/plans` → `{ mine: [...], shared: [...] }`, each plan with `items`, `ownerName` (DisplayName or "A member", never email or user id), `estimatedMin`, `estimatedKcal` (from the caller's own latest weight, null if none, so no other user's weight is ever involved). Shared excludes my own.
- `POST /api/plans`, `PUT /api/plans/{id}` (filter `Id == id && OwnerUserId == uid`, 404 otherwise, items replaced by delete-all + reinsert ignoring client ids), `DELETE /api/plans/{id}` (same filter), `POST /api/plans/{id}/copy` (source must be `IsShared || OwnerUserId == uid`; new plan `IsShared=false`, name suffixed " (copy)").
- Integration test: user B cannot PUT user A's shared plan (403/404), B can copy it, A's private plan is not in B's list.

### Web

- Routes `/plans` (list) and `/plans/new`, `/plans/:id` (editor). Nav item "Plans". New `pages/plans.ts`, `pages/plan-edit.ts`.
- List: two sections, "My plans" and "Shared by others", each card shows name, movement count, estimated minutes and kcal, owner name for shared, buttons Log / Edit / Copy / Delete as applicable, share toggle (`MatSlideToggle`) on mine.
- Editor: name, description, shared toggle, ordered item rows (exercise picker: `mat-select` grouped by equipment with a filter input, choosing one copies its name and MET into the row; Sets, Reps, kg, Rest), up/down/remove per row, live estimate line, "Add your own exercise" inline form (name, equipment, muscle, intensity Light/Moderate/Vigorous → 3.5/5/8).
- Log from plan: `/exercise?plan={id}` prefills the strength movement rows and estimated duration; user edits and submits as a normal exercise (no server coupling between plans and logged exercises).

Check: create a plan with three items, share it, log in as a second user, see it under Shared, copy it, edit the copy, log a session from it.

---

## Phase 5: Strava (manual sync)

### Data (`Models.cs`, `AppDbContext.cs`, migration `Strava`)

- `StravaLink { string UserId (PK), long AthleteId, string AccessToken, string RefreshToken, DateTime ExpiresAt, DateTime? LastSyncAt }`. Tokens stored protected with `IDataProtectionProvider.CreateProtector("strava")` (Data Protection already configured in `Program.cs:49-50`).

### API (new `fitness-tracker.api/StravaEndpoints.cs` + `StravaClient.cs`, config `Strava:ClientId`, `Strava:ClientSecret`, feature disabled when empty like Google)

- **OAuth via the framework's generic handler, no hand-rolled state.** In `Program.cs` next to Google: `AddOAuth("Strava", o => { AuthorizationEndpoint = "https://www.strava.com/oauth/authorize"; TokenEndpoint = "https://www.strava.com/oauth/token"; CallbackPath = "/signin-strava"; SaveTokens = true; SignInScheme = IdentityConstants.ExternalScheme; Scope.Add("read,activity:read_all") /* single item so Strava's comma format survives */; ClaimActions to read athlete.id and firstname from the token response })`. Correlation cookie, state and code exchange are then handled by ASP.NET Core, and account-linking CSRF is prevented by passing `uid` as the third argument of `ConfigureExternalAuthenticationProperties` and reading back with `GetExternalLoginInfoAsync(uid)`.
- Browser-facing endpoints live in `AuthEndpoints.cs` beside Google, both `.RequireAuthorization()`: `GET /auth/strava` → `Results.Challenge(props, ["Strava"])`; `GET /auth/strava/callback` → `GetExternalLoginInfoAsync(uid)`, pull `access_token`, `refresh_token`, `expires_at` from `info.AuthenticationTokens`, upsert `StravaLink` (tokens protected), redirect `/settings?strava=ok` or `?strava=error`. Add `"/signin-strava"` to `proxy.conf.json` mirroring `/signin-google`.
- JSON endpoints under `/api/strava`: `GET /status` → `{ connected, lastSyncAt }`; `POST /sync`; `DELETE /` → call Strava deauthorize (ignore failure) and delete the link. `MeDto` gains `StravaEnabled` so the UI can hide the panel.
- `StravaClient` (typed `HttpClient`, 15s timeout): `RefreshAsync(refreshToken)`, `ActivitiesAsync(token, afterUnix, page)`, `DeauthorizeAsync(token)`. Static `Map(sportType) → ExerciseType?` (Run/TrailRun/VirtualRun → Running, Walk → Walking, Ride/VirtualRide/GravelRide/MountainBikeRide → Cycling, Hike → Hiking, Swim → Swimming, Rowing → Rowing, WeightTraining/Crossfit → Strength, Yoga → Yoga, Workout/HIIT → Hiit, else null).
- Sync: unprotect tokens (a `CryptographicException` means keys rotated: delete the link, report disconnected); refresh when `ExpiresAt < now + 5 min`; `after = LastSyncAt ?? now - 30 days` so deleted Strava rows do not come back and each sync is cheap; loop `per_page=100` until a short page; for each activity with a mapped type insert `Exercise { Source=Strava, ExternalId=id, Date=start_date_local, DurationMin=moving_time/60, DistanceKm=distance/1000, Kcal=Calc.ExerciseKcal(...) from our formula and the user's weight }` unless `(UserId, ExternalId)` already exists; unmapped types are counted under `skipped`; set `LastSyncAt`; return `{ imported, skipped }`.
- Strava app "Authorization Callback Domain" is the host only: `localhost` for dev, `fit.<domain>` for prod. The redirect URI is built from the Host header, which the dev proxy and `UseForwardedHeaders` already get right for Google.
- Tests: `StravaClient.Map` table test; sync idempotency test with a stub `HttpMessageHandler` returning the same two activities twice → second sync imports 0.

### Web

- `settings.ts`: "Connections" panel: Connect Strava button (plain `<a href="/auth/strava">`, styled like `.google`), when connected shows "Connected · last sync …", Sync now, Disconnect. Reads `?strava=` query for a success/error message.
- `exercise.ts`: if connected, a "Sync Strava" icon button next to the date nav; imported entries get a small "Strava" tag and are still deletable.
- `core/auth.store.ts`: `Me` gains `stravaEnabled` so the UI hides the panel when the server has no client id.

Check: with a dev Strava app and `dotnet user-secrets set Strava:ClientId …`, connect, sync, see runs appear with our computed kcal; sync again imports 0; disconnect removes the link.

---

## Verification (each phase, then end to end)

1. `cd fitness-tracker.api && dotnet build && cd .. && dotnet test` green.
2. `cd fitness-tracker.web && nvm use 24 && npx ng build --configuration production` green.
3. Run API (`dotnet run --project fitness-tracker.api`) + `ng serve` with the proxy; walk the checks listed at the end of each phase on desktop and at 375px width.
4. After Phase 2, 4 and 5 a migration exists; confirm `dotnet ef migrations list` shows it and the app boots against a copy of a real DB. Take a backup from the admin page before deploying each of these phases.
5. Backup round trip: download from the admin page, open the `.bac` with `sqlite3` to confirm it is readable, restore it, confirm the safety copy exists under `/data/backups`.

## User actions outside the code

- Run each `dotnet ef migrations add …` command when handed over, review the generated file, commit.
- Phase 5: create a Strava API application (Authorization Callback Domain = app host), set `Strava__ClientId` / `Strava__ClientSecret` in the VPS `.env` and in `dotnet user-secrets` for dev, add them to `deploy/.env.example`.

## Skipped on purpose

- Strava webhooks (manual sync chosen), Strava heart-rate or elevation, importing Strava's own calorie figure (we compute ours for consistency).
- Per-set logging (a movement row is sets × reps × kg, not one row per set), rest timers, plan scheduling, plan comments or likes.
- Editing a logged exercise (delete and re-add stays the flow, as today).
- Dark mode, imperial units, Angular unit tests.
- Scheduled automatic backups and off-site copies (manual download covers it; add a cron on the VPS calling the endpoint if wanted later).
