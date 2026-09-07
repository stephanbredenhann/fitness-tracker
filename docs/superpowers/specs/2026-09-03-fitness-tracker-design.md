# Fitness Tracker: design and implementation plan

## Context

A small self-hosted fitness tracker for the owner and a group of friends. It runs on an existing Contabo VPS behind a host-installed Caddy on a subdomain of the owner's personal domain. Users log daily weight, food (calories) and exercise, and the dashboard shows a weight trend and a daily calorie deficit computed from BMR, activity level, exercise and intake. An admin role manages accounts but never sees another user's health data. Transactional email (verify, reset, inactivity reminder) goes through Resend. GitHub Actions builds one Docker image and deploys it over SSH.

Decisions already made with the user:

| Topic | Decision |
|---|---|
| Stack | .NET 10 minimal API + EF Core + SQLite, Angular (latest) + Angular Material, Chart.js via ng2-charts |
| Repo | Mono repo: `fitness-tracker.api/` and `fitness-tracker.web/`. `ng build` outputs into the API's `wwwroot`, API serves the SPA |
| Auth | ASP.NET Core Identity, cookie auth (same origin), Google external login. Open registration, email verification required for password accounts |
| Hosting | One container. Caddy already on host reverse-proxies to it. CI builds image to GHCR, SSH deploys with docker compose |
| Food data | Open Food Facts (free, no key) proxied server-side, plus manual entry and "recent foods" |
| Strava | Phase 2. Exercise table has `Source` and `ExternalId` from day one |
| Activity | Single activity level in profile/settings (no per-day toggle) |
| Admin | List, disable, delete, promote/demote, trigger password reset email. No health data access |
| Units | Metric only, kg and cm |
| Seed admin | `s.bredenhann456@gmail.com`, created confirmed with no password, Admin role. Signs in via Google or sets password via reset link |
| Design | Blue and white, minimal. One blue accent, white surfaces, neutral greys, a real typeface. No gradients, glass, purple, emoji icons, or generic hero copy |

## Repo layout

```
fitness-tracker/
  fitness-tracker.api/           FitnessTracker.Api.csproj (.NET 10 minimal API)
  fitness-tracker.api.tests/     FitnessTracker.Api.Tests.csproj (xUnit)
  fitness-tracker.web/           Angular workspace, outputPath ../fitness-tracker.api/wwwroot
  deploy/
    docker-compose.yml           image from GHCR, /data volume for SQLite, env_file .env
    Caddyfile.snippet            site block to paste into host Caddyfile
  .github/workflows/
    ci.yml                       PR: dotnet test, ng build
    deploy.yml                   push main: docker build+push GHCR, ssh compose pull/up
  Dockerfile                     multi-stage: node build web -> dotnet publish api
  FitnessTracker.slnx
  docs/superpowers/specs/2026-09-03-fitness-tracker-design.md   (this design, written in step 1)
```

## Data model (EF Core, SQLite)

- **AppUser : IdentityUser** adds `DisplayName`, `LastSeenAt`, `LastReminderAt`, `CreatedAt`. Disable = Identity lockout (`LockoutEnd = DateTimeOffset.MaxValue`). Roles: `Admin`, `User`.
- **Profile** (1:1 user): `HeightCm`, `GoalWeightKg`, `BirthDate`, `Sex` (Male/Female, needed for BMR), `ActivityLevel` enum (Sedentary 1.2, Light 1.375, Moderate 1.55, Active 1.725).
- **WeighIn**: `UserId`, `Date` (date only), `WeightKg`. Unique (UserId, Date). PUT upserts.
- **FoodEntry**: `UserId`, `Date`, `Name`, `Kcal`, `Grams?`, `ProteinG?`, `CarbsG?`, `FatG?`, `Barcode?`. "Recent foods" = distinct names from the user's last entries; no separate custom-food table.
- **Exercise**: `UserId`, `Date`, `Type` enum, `DurationMin`, `Kcal`, `Source` (Manual/Strava), `ExternalId?`, `Note?`.

Every query on Profile/WeighIn/FoodEntry/Exercise filters by the current user's id. Admin endpoints touch AspNetUsers columns only.

## Calculations (pure static class `Calc`, unit tested)

- BMR (Mifflin-St Jeor): `10*kg + 6.25*cm - 5*age + (male ? 5 : -161)`.
- Daily burn = BMR × activity multiplier + sum(exercise kcal).
- Exercise kcal = MET × kg × hours, using the most recent weigh-in on or before that date (falls back to latest). MET table hard-coded: walking 3.5, running 9.8, cycling 7.5, swimming 6, strength 5, HIIT 8, hiking 6, rowing 7, yoga 2.5, other (user types kcal).
- Deficit = burn − intake. Positive means deficit.

## API surface

Identity built-ins via `MapIdentityApi<AppUser>()` under `/auth`: register, login (`useCookies=true`), confirmEmail, resendConfirmationEmail, forgotPassword, resetPassword, manage/info. Custom:

- `POST /auth/logout`, `GET /auth/me` → `{ email, displayName, role, hasProfile }`
- `GET /auth/google` (challenge), `GET /auth/google/callback` (find by email or create confirmed user, add external login, sign in, redirect to `/`)
- `GET|PUT /api/profile`
- `GET /api/weighins?from&to`, `PUT /api/weighins/{date}`, `DELETE /api/weighins/{date}`
- `GET /api/food?date`, `POST /api/food`, `DELETE /api/food/{id}`, `GET /api/food/recent`, `GET /api/food/search?q` (proxies Open Food Facts v2 search, sets a descriptive User-Agent, caches results 24h in `IMemoryCache`, returns name, brand, kcal/100g, macros/100g, barcode)
- `GET /api/exercises?date`, `POST /api/exercises`, `DELETE /api/exercises/{id}`, `GET /api/exercises/types`
- `GET /api/dashboard?days=30|90` → `{ weights: [{date, kg}], days: [{date, intake, burn, deficit}], bmr, goalKg }`
- Admin (policy `Admin`): `GET /api/admin/users`, `POST /api/admin/users/{id}/disable|enable|promote|demote|reset-password`, `DELETE /api/admin/users/{id}`

Cookie: default Identity cookie, SameSite=Lax, 401 for API (no redirect). No GET mutates state, so Lax covers CSRF. Angular uses `withCredentials`.

## Email (Resend)

`ResendEmailSender : IEmailSender<AppUser>` implementing confirmation link, reset link, reset code, plus `SendReminderAsync`. Official `Resend` NuGet package. If `Resend:ApiKey` is empty (dev), log the email to console instead. Plain HTML templates as C# raw strings, no template engine.

## Inactivity reminders

- Middleware stamps `LastSeenAt` on authenticated requests at most once per hour.
- `ReminderService : BackgroundService` runs hourly: users with `LastSeenAt < now-48h` and (`LastReminderAt` null or `< LastSeenAt`), not locked out, email confirmed → send reminder, set `LastReminderAt`. One email per lapse.

## Startup

`Migrate()` on boot (single instance), ensure roles, ensure seed admin from `Admin:Email` config. Static files + `MapFallbackToFile("index.html")` for the SPA. Config via env: `ConnectionStrings__Default`, `Resend__ApiKey`, `Email__From`, `Authentication__Google__ClientId/ClientSecret`, `App__BaseUrl`, `Admin__Email`.

## Angular app

Standalone components, signals, Angular Material with a custom M3 theme (blue primary, white surfaces). Routes:

- Public: `/login`, `/register`, `/verify`, `/forgot`, `/reset`
- Authed: `/onboarding` (guard: no profile yet), `/dashboard` (weight chart, deficit chart, today's weigh-in card, today's intake/burn summary), `/food` (date nav, search OFF, add from recent, manual add, list/delete), `/exercise` (date nav, type + minutes → computed kcal preview, list/delete), `/settings` (profile fields, activity level, change password)
- Admin: `/admin` (users table with actions), guard on role

One `AuthStore` signal service loads `/auth/me` once. `withCredentials` interceptor. Dev: `proxy.conf.json` to the API. Prod: `outputPath` into the API `wwwroot`. Load the `frontend-design` skill when building the shell and theme to keep the blue/white minimal direction and avoid templated defaults; load `dataviz` before writing the two charts.

## Deployment

- Dockerfile: stage 1 `node:24` runs `npm ci && ng build`, stage 2 `dotnet/sdk:10.0` publishes API with wwwroot, stage 3 `dotnet/aspnet:10.0` runtime, `/data` volume.
- `deploy/docker-compose.yml`: GHCR image, `ports: 127.0.0.1:8085:8080`, volume `./data:/data`, `env_file: .env`.
- `deploy/Caddyfile.snippet`: `fit.<domain> { reverse_proxy 127.0.0.1:8085 }` for the user to paste into the host Caddyfile.
- `deploy.yml`: on push to `main`: build + push `ghcr.io/<owner>/fitness-tracker:latest` and `:sha`, then `appleboy/ssh-action` (or plain `ssh` with key) runs `docker compose pull && docker compose up -d` in `~/fitness-tracker`. Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`. `GITHUB_TOKEN` pushes to GHCR.
- `ci.yml`: on PR: `dotnet test`, `ng build`.

## Implementation phases (each ends with a runnable check)

1. **Scaffold + deploy pipeline.** Write the spec to `docs/superpowers/specs/`. Solution, API project with health endpoint, Angular project building into wwwroot, Dockerfile, compose, Caddy snippet, both workflows. Check: `docker build` succeeds locally and the container serves the Angular placeholder.
2. **Auth.** Identity + SQLite, `MapIdentityApi`, Google login, Resend sender with console fallback, seed admin, `/auth/me`, `LastSeenAt` middleware. Angular auth pages, `AuthStore`, guards. Check: register → console-logged confirm link → login → `/auth/me` returns user; integration test that a non-admin gets 403 on `/api/admin/users`.
3. **Profile, weigh-ins, weight chart.** Onboarding page, settings, weigh-in upsert, dashboard weights series. Check: `Calc` unit tests for BMR and activity multipliers.
4. **Food and exercise, deficit chart.** OFF search proxy with cache, food/exercise CRUD, MET calculation, dashboard day series. Check: unit tests for exercise kcal and deficit aggregation; integration test that user A cannot read user B's entries.
5. **Admin page and reminders.** Admin endpoints + Angular table, `ReminderService`. Check: unit test for reminder eligibility query against an in-memory SQLite db.
6. **Design pass and verification.** Apply theme and typography consistently, empty states, mobile layout. Full manual walk-through against the checklist below.

## Verification

- `dotnet test` green; `ng build --configuration production` green.
- `docker compose up` locally with a throwaway `.env`: register, verify via logged link, onboard, weigh in, add food via OFF search, add exercise, see both charts populated.
- Log in as seeded admin via reset link, confirm admin page lists users, confirm admin cannot hit `/api/weighins` for another user (returns only own data).
- Push to `main`, watch `deploy.yml`, confirm the subdomain serves the app over HTTPS via Caddy.

## User setup outside the repo

- DNS A record for the subdomain pointing at the VPS; Caddy site block from `deploy/Caddyfile.snippet`.
- `~/fitness-tracker/.env` on the VPS with Resend key, Google client id/secret, from address, base URL.
- Google Cloud OAuth client with redirect URI `https://fit.<domain>/signin-google`.
- Resend domain verification for the sending domain.
- GitHub repo secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`; GHCR package set to allow the VPS to pull (public package or a PAT in `docker login` on the VPS).
- Phase 2 Strava: register an API app, self-upgrade to 10 athletes in the dashboard, keep a Strava subscription on the owner account.

## Skipped on purpose

- Custom food library table (recent foods derived from entries covers it).
- Per-day activity override, imperial units, refresh tokens, separate frontend container, template engine for email, macro targets.
- Angular unit tests beyond compiling; logic lives server-side and is tested there.

Git and hub actions stay with the user: no commits, staging, or pushes from the assistant. Commands to run will be given as text.
