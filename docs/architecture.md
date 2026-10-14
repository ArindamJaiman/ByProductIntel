# Architecture

## Overview

```
Browser ──► Next.js 16 App Router (React 19, Cache Components + Partial Prerendering)
              │  Server Components read data; Server Actions mutate it
              │  src/proxy.ts refreshes Supabase sessions (persistent mode only)
              ▼
        src/server/context.ts  ── picks repository + actor per request (React.cache)
              │
     ┌────────┴─────────┐
     ▼                  ▼
 demo repository    supabase repository
 (.data/*.json)     (Postgres + RLS via the user's session)
              │
              ▼
        src/domain/  ── pure TypeScript: units, properties, validation,
                        matching engine, scoring, Missing-Bridge planner
```

The domain layer has no I/O and no framework imports. The same engine code runs:
- on the server when a run is saved (`runMatchAction`), the dashboard screens live data, or the landing hero renders;
- in the browser in the scenario lab, for instant recalculation;
- in Vitest, Node scripts and the seed validator.

## Key decisions

| Decision | Reason |
|---|---|
| Single TypeScript codebase, no Python service | The engine is rule-based arithmetic. One tested implementation shared by server, client and tests is simpler than a second service. |
| Deterministic rules, no LLM | Compatibility must be auditable and reproducible. No paid API is required. |
| Next.js defaults (Cache Components, PPR) kept | The framework's recommended path. Pages read data inside `<Suspense>`, and `getContext()` calls `connection()` so mutable data is never baked into a static shell. |
| Filters use GET forms and `searchParams` | Filters are shareable URLs and work without client JS (Vercel best practice: server rendering, no client waterfalls). |
| Repository interface with two adapters | Demo mode runs with no credentials; persistent mode uses Supabase. Server code never knows which is active. |
| Reference data read-only | Application rules and sources come from seed modules (demo) or service-role seeding (Supabase). RLS grants users no write path to them. |
| Runs snapshot their inputs | A run stores the material and application snapshots, scenario, weights, versions and an input hash. Later edits do not change past results. |
| Results stored as JSONB plus normalised rows | The full explanation is immutable derived output (JSONB). State, score, checks, actions and evidence links are also rows for querying. |

## Data flow: a matching run

1. A user submits a run (material page, workspace or scenario lab).
2. `runMatchAction` resolves the actor server-side, loads the material and applications, and validates the optional scenario/weights with Zod.
3. `runMatching` validates the material (stage 1), evaluates each application (stages 2–7) and ranks the results.
4. The repository stores the run with snapshots and versions, writes an audit event, and the user is redirected to `/match/runs/[id]`.

## Operating modes

| | Demo | Persistent |
|---|---|---|
| Selected when | No Supabase env vars, or `BPI_DATA_MODE=demo` | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set |
| Storage | `.data/demo-store.json` (falls back to process memory if not writable; the UI says so) | Supabase Postgres |
| Auth | none (single demo user) | Supabase Auth email/password; users provisioned by an admin |
| Access control | n/a | Row-level security per organisation (see migration) |

`BPI_DATA_MODE=supabase` without configuration fails loudly with a configuration error rather than silently falling back.

## Security

- The secret/service-role key is read only by `scripts/seed-supabase.ts`. The app uses the publishable key with the user's session, so RLS always applies.
- The organisation id is resolved from `public.profiles` on the server, never taken from the client. RLS `with check` clauses repeat the check in the database.
- Users cannot self-assign `independently_verified`, `verified_source`, `available_verified` or `verified_evidence`. Both the server action guard and RLS enforce this.
- Matching runs, results and review decisions are insert-only for users.
- RLS policies were executed against the real migration in PGlite (`tests/integration/rls.test.ts`).

## Directory map

```
src/domain/            engine, schemas, units, labels (pure)
src/data/seed/         synthetic materials, applications, evidence sources
src/server/            context, actions, repositories, Supabase client
src/app/               routes: / (landing), (app)/… product screens, login
src/components/        UI primitives, Missing-Bridge span, forms, scenario lab
supabase/migrations/   schema and RLS
scripts/               seeding and the outcome matrix
tests/unit|integration Vitest; tests/e2e Playwright (Python)
.claude/skills/        installed skills + industrial-byproduct-matching domain skill
```
