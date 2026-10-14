# ByProduct Intelligence

**Turn industrial by-products into evidence-backed opportunities.**

A decision-support prototype that screens one specific by-product stream against the requirements of possible applications. It ranks the pathways that pass and, through the **Missing-Bridge Planner**, lists the measurements, tests, certificates and reviews still needed before an uncertain match can be taken further.

> Independent concept prototype for the Tata Imagination Challenge 2026. It is not a Tata product, is not endorsed by any Tata company and uses no Tata data. It never approves a material or declares it safe. All demo material profiles are synthetic.

## What it does
- **Deterministic matching engine** (`src/domain/engine`): validation → hard gates → specification and evidence checks → state (`potentially eligible` / `incomplete evidence` / `ineligible`) → explainable weighted score → indicative economics → environmental indicators → Missing-Bridge plan. Unknown is never a pass.
- **Screens**: landing, dashboard, materials registry (search, filter, sort, create, edit, CSV import), material profile, application registry, matching workspace, ranked results with filters, match details, side-by-side comparison, scenario lab with sensitivity analysis, shortlist and review history, evidence library, and methodology.
- **Two modes**: demo (no credentials; file-backed) and persistent (Supabase Postgres with row-level security).

## Run locally
Requirements: Node 20.9+ (tested on 22.13); Python 3 with Playwright only for the E2E tests.

```bash
npm install
```
```bash
npm run seed
```
```bash
npm run dev
```
Open http://localhost:3000. With no environment variables, the app runs in demo mode. Run `npm run seed` again at any time to reset the demo data.

## Scripts
| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development, production build, production server |
| `npm run lint` / `typecheck` | ESLint (zero warnings) / TypeScript strict |
| `npm test` | Vitest unit tests and PGlite RLS integration tests |
| `npm run test:e2e` | Playwright journey against a clean production build (`pip install playwright && playwright install chromium`) |
| `npm run seed` | Reset the demo store to the deterministic seed |
| `npm run seed:supabase` | Load reference data and synthetic materials into Supabase |
| `npm run matrix` | Print every material × application outcome |
| `npm run check` | lint + typecheck + tests + build |

## Persistent mode (Supabase)
1. Create a Supabase project and apply `supabase/migrations/20261014000000_initial_schema.sql` (`supabase db push` or the SQL editor).
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and (for seeding only) `SUPABASE_SECRET_KEY`.
3. `npm run seed:supabase`.
4. Create users in Supabase Auth, then insert a `public.profiles` row (id = user id, organisation_id) for each, using the service role. The seed prints the demo workspace organisation id.
5. `npm run dev` and sign in at `/login`.

The secret key is used only by the seed script and must never be exposed with a `NEXT_PUBLIC_` prefix. **The Supabase path is untested against a live project** (see `docs/limitations.md`).

## Deployment
Any Node host that runs `next build` / `next start` works (for example Vercel). On serverless hosts the demo file store is not durable: the app falls back to in-memory storage and says so in the UI. Use persistent mode for shared deployments, and set the environment variables in the host's settings.

## Changing the model
- Weights and anchors: `src/domain/scoring-config.ts` (bump `SCORING_MODEL_VERSION`).
- Applications and rules: `src/data/seed/applications.ts`. Every rule needs a `basis`, and source-referenced rules need a `sourceId`.
- Sources: `src/data/seed/evidence.ts`.
- Properties and units: `src/domain/properties.ts`, `src/domain/units.ts`.
- Full guidance: `docs/matching-model.md` and `.claude/skills/industrial-byproduct-matching/SKILL.md`.

CSV import template: download it from `/materials/import` (served by `/materials/import/template`).

## Documentation
- `docs/market-landscape.md`: prior art, sources and novelty hypotheses
- `docs/architecture.md`: decisions and data flow
- `docs/matching-model.md`: eligibility, formulas and assumptions
- `docs/data-provenance.md`: synthetic data and labels
- `docs/limitations.md`: what the software cannot establish

## Claude Code skills
Installed at project scope in `.claude/skills/`: `frontend-design`, `webapp-testing` (anthropics/skills), `vercel-react-best-practices` (vercel-labs/agent-skills), `supabase` and `supabase-postgres-best-practices` (supabase/agent-skills). Project domain skill: `industrial-byproduct-matching`.
