# IronLog

A mobile-first, offline-first workout tracker with editable routines, an exercise catalogue, workout history, progress charts and optional encrypted cloud sync.

This public repository contains generic sample routines with blank load fields. It does **not** contain the original author's routines, working weights, notes, workout history, measurements, photos, credentials or hosted database identifiers.

## Run locally

```bash
npm install
npm run dev
```

For an iPhone, open the deployed HTTPS address in Safari, tap **Share**, then **Add to Home Screen**. IndexedDB keeps local data on the device.

## Private backend setup

The app works locally without a hosted database. Cloud sync and progress-photo storage require resources owned by the person deploying the app:

1. Copy `.openai/hosting.example.json` to `.openai/hosting.json`.
2. Create a new private D1 database and R2 photo bucket in your own Sites project.
3. Bind them as `DB` and `PHOTOS`.
4. Configure authentication for that deployment.

`.openai/hosting.json` is ignored intentionally because it contains deployment identity. Never commit environment files, database exports, workout backups or uploaded photos.

## Product structure

```text
app/
  components/TrackerApp.tsx  product screens and gym interactions
  components/ServiceWorker.tsx
  lib/types.ts               Zod schemas and strict TypeScript types
  lib/seed.ts                generic routines and exercise catalogue
  lib/db.ts                  private per-browser Dexie database
  lib/cloud-sync.ts          automatic, on-demand and cross-device sync
  lib/domain.ts              timers, progression, exports and validation
  api/sync/route.ts          authenticated encrypted-backup endpoint
  layout.tsx                 iPhone/PWA metadata
  manifest.ts                install manifest
public/
  sw.js                      offline application-shell cache
tests/
  domain.test.ts             calculation, timer and import tests
  e2e/workout.spec.ts        iPhone primary-flow Playwright spec
```

## Screen map

- **Train:** unlimited routines, create/edit/duplicate/delete, start or resume.
- **Active workout:** routine notes and saved per-set weights, warm-up/working/failure/drop types, `weight × reps` previous-session comparison, timestamp rest timer, optional sound/haptics, explainable progression suggestions, plate calculation, notes, pause, replacement, finish/discard.
- **Post-workout:** when set counts changed, choose whether today’s set structure and weights should become the saved routine defaults.
- **History:** completed sessions, totals, corrections and workout-over-workout reports.
- **Progress:** exercise trend charts, best load/reps and estimated 1RM, weekly volume, training-day statistics, a monthly workout calendar and optional body measurements.
- **Routine safety:** one-tap deload copies and automatic recoverable versions before edits, workout updates, replacements and restores.
- **Data:** secure cloud-sync status, on-demand sync, versioned JSON recovery backup/import, CSV history and backlog.

## Data model

IndexedDB (`ironlog`) contains `exercises`, `routines`, `sessions`, and `meta` tables. Routines nest ordered `RoutineExercise` and `SetTemplate` values. Sessions nest `ExerciseLog` and `SetLog` snapshots so later renames do not change history. Active sessions and `timerEndsAt` are written after each change. Imports are parsed against `BackupSchema` before a single replacement transaction begins.

When a deployer provisions the optional backend, D1 stores one AES-256-GCM encrypted snapshot per authenticated account. The row owner is derived server-side from the trusted identity header; the browser cannot select another user. Every deployment must use its own database, photo bucket and authentication configuration.

## Commands

```bash
npm test             # Vitest domain suite
npm run test:e2e     # Playwright iPhone flow
npx tsc --noEmit     # strict application type-check
npm run build        # production build
```

## Native backlog

Apple Health, Apple Watch, Dynamic Island and reliable background notifications require the future native iOS app. Any future AI assistance remains transparent and opt-in.
