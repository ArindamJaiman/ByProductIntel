/**
 * Executes the real Supabase migration inside PGlite (WASM Postgres) with a
 * minimal stand-in for Supabase's `auth` schema and roles, then checks that
 * row-level security isolates organisations and protects reference data.
 *
 * This verifies the SQL and policies; it does not exercise Supabase Auth,
 * PostgREST or the network path.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";
const ORG_C = "00000000-0000-0000-0000-00000000000c";
const USER_A = "10000000-0000-0000-0000-00000000000a";
const USER_B = "10000000-0000-0000-0000-00000000000b";

const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
`;

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);` : "set role anon;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

const insertMaterial = (code: string, org: string, extra = "") =>
  db.query(
    `insert into public.byproduct_materials
      (code, organisation_id, name, family, source_process, data_origin, site, region, country, lat, lon,
       tonnes_per_year, reporting_period, volume_provenance, hazard_status, hazard_verification,
       handling_pathway, handling_kind, handling_provenance ${extra ? ", " + extra.split("=")[0] : ""})
     values ($1, $2, 'Test material', 'fly_ash', 'Test', 'user_supplied', 's', 'r', 'IN', 20, 80,
       1000, '2026', 'user_supplied', 'not_declared', 'unverified', 'stockpile', 'unknown', 'user_supplied'
       ${extra ? ", '" + extra.split("=")[1] + "'" : ""})
     returning id`,
    [code, org],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB);
  // Apply every migration in filename order, as Supabase does.
  const dir = join(process.cwd(), "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(`
    insert into auth.users values ('${USER_A}'), ('${USER_B}');
    insert into public.organisations (id, name) values ('${ORG_A}', 'Org A'), ('${ORG_B}', 'Org B'), ('${ORG_C}', 'Org C');
    insert into public.profiles (id, organisation_id) values ('${USER_A}', '${ORG_A}'), ('${USER_B}', '${ORG_B}');
    insert into public.evidence_sources (id, title, organisation, url, access_date, evidence_type, claim, review_status)
      values ('src-1', 'T', 'O', 'https://example.org', '2026-10-14', 'peer_reviewed', 'c', 'full_text_reviewed');
    insert into public.applications (id, code, name, industry, description, spec_status, accepted_families,
      demand_min_t_per_yr, demand_max_t_per_yr, demand_provenance, demand_sites, max_transport_km, logistics_basis,
      economics_provenance, circularity_tier, substitutes, circularity_rationale, ruleset_version, review_status)
      values ('app-1', 'A1', 'App', 'Ind', 'd', 'demo_assumption', '{fly_ash}', 1, 10, 'synthetic_demo',
        '[{"id":"s","label":"l","region":"r","lat":1,"lon":1}]', 100, 'demo_assumption', 'synthetic_demo',
        'bulk_fill', 'x', 'x', 'r1', 'demo_unreviewed');
  `);
  // Seeded with the owner role (as the service role would): one private record per org, one shared.
  await insertMaterial("A-PRIVATE", ORG_A);
  await insertMaterial("B-PRIVATE", ORG_B);
  await insertMaterial("B-SHARED", ORG_B, "visibility=shared");
}, 60000);

describe("row-level security (PGlite)", () => {
  it("the migration applies cleanly and enables RLS on every public table", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(r.rows.length).toBeGreaterThanOrEqual(18);
    expect(r.rows.filter((x) => !x.relrowsecurity)).toEqual([]);
  });

  it("a user sees their own organisation's private records and shared records only", async () => {
    const codes = await as(USER_A, async () =>
      (await db.query<{ code: string }>("select code from public.byproduct_materials order by code")).rows.map((r) => r.code),
    );
    expect(codes).toEqual(["A-PRIVATE", "B-SHARED"]);
  });

  it("a user can read the names of organisations that share materials, and no others", async () => {
    const names = await as(USER_A, async () =>
      (await db.query<{ name: string }>("select name from public.organisations order by name")).rows.map((r) => r.name),
    );
    expect(names).toEqual(["Org A", "Org B"]);
  });

  it("anonymous sessions see nothing", async () => {
    await expect(as(null, () => db.query("select * from public.byproduct_materials"))).rejects.toThrow(/permission denied/);
  });

  it("a user cannot create a record for another organisation", async () => {
    await expect(as(USER_A, () => insertMaterial("A-SPOOF", ORG_B))).rejects.toThrow(/row-level security/);
    await expect(as(USER_A, () => insertMaterial("A-OK", ORG_A))).resolves.toBeDefined();
  });

  it("a user cannot self-assign verified status", async () => {
    await expect(as(USER_A, () => insertMaterial("A-VERIFIED", ORG_A, "data_origin=verified_evidence"))).rejects.toThrow();
    const id = (await db.query<{ id: string }>("select id from public.byproduct_materials where code = 'A-PRIVATE'")).rows[0].id;
    await expect(
      as(USER_A, () =>
        db.query(
          `insert into public.material_measurements (material_id, property, value, unit, provenance, verification)
           values ($1, 'loi', 2, '%', 'user_supplied', 'independently_verified')`,
          [id],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(USER_A, () =>
        db.query(
          `insert into public.material_measurements (material_id, property, value, unit, provenance, verification)
           values ($1, 'loi', 2, '%', 'user_supplied', 'lab_reported')`,
          [id],
        ),
      ),
    ).resolves.toBeDefined();
  });

  it("a user cannot modify another organisation's material", async () => {
    const res = await as(USER_A, () =>
      db.query("update public.byproduct_materials set name = 'hijacked' where code = 'B-SHARED'"),
    );
    expect(res.affectedRows).toBe(0);
    const name = (await db.query<{ name: string }>("select name from public.byproduct_materials where code = 'B-SHARED'")).rows[0].name;
    expect(name).toBe("Test material");
  });

  it("a user cannot move their record into another organisation", async () => {
    await expect(
      as(USER_A, () => db.query(`update public.byproduct_materials set organisation_id = '${ORG_B}' where code = 'A-PRIVATE'`)),
    ).rejects.toThrow(/row-level security/);
  });

  it("reference specifications are read-only for users", async () => {
    await expect(as(USER_A, () => db.query("update public.applications set max_transport_km = 1"))).rejects.toThrow(/permission denied/);
    await expect(
      as(USER_A, () =>
        db.query(`insert into public.application_requirements (id, application_id, property, kind, max_value, unit, enforcement, rationale, basis)
          values ('x', 'app-1', 'loi', 'max', 1, '%', 'hard', 'r', 'demo_assumption')`),
      ),
    ).rejects.toThrow(/permission denied/);
    const apps = await as(USER_A, async () => (await db.query("select id from public.applications")).rows);
    expect(apps).toHaveLength(1);
  });

  it("source-referenced requirements must cite a source (constraint)", async () => {
    await expect(
      db.query(`insert into public.application_requirements (id, application_id, property, kind, max_value, unit, enforcement, rationale, basis)
        values ('y', 'app-1', 'loi', 'max', 1, '%', 'hard', 'r', 'source_referenced')`),
    ).rejects.toThrow(/check constraint/);
  });

  it("matching runs and review decisions are isolated and append-only", async () => {
    const matId = (await db.query<{ id: string }>("select id from public.byproduct_materials where code = 'A-PRIVATE'")).rows[0].id;
    const runId = await as(USER_A, async () =>
      (
        await db.query<{ id: string }>(
          `insert into public.matching_runs (organisation_id, material_id, label, engine_version, scoring_model_version,
            ruleset_versions, weights, scenario, input_hash, material_snapshot, applications_snapshot, created_by)
           values ($1, $2, 'run', 'e', 's', '{}', '{}', '{}', 'h', '{}', '[]', $3) returning id`,
          [ORG_A, matId, USER_A],
        )
      ).rows[0].id,
    );
    await as(USER_A, () =>
      db.query(
        `insert into public.review_decisions (organisation_id, material_id, application_id, run_id, decision, actor)
         values ($1, $2, 'app-1', $3, 'under_review', $4)`,
        [ORG_A, matId, runId, USER_A],
      ),
    );
    // User B cannot see user A's runs or decisions.
    const seenByB = await as(USER_B, async () => ({
      runs: (await db.query("select id from public.matching_runs")).rows.length,
      decisions: (await db.query("select id from public.review_decisions")).rows.length,
    }));
    expect(seenByB).toEqual({ runs: 0, decisions: 0 });
    // Decisions cannot be rewritten.
    await expect(as(USER_A, () => db.query("update public.review_decisions set decision = 'rejected'"))).rejects.toThrow(/permission denied/);
    // A decision cannot be attributed to someone else.
    await expect(
      as(USER_A, () =>
        db.query(
          `insert into public.review_decisions (organisation_id, material_id, application_id, decision, actor)
           values ($1, $2, 'app-1', 'note', $3)`,
          [ORG_A, matId, USER_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("ineligible results cannot carry a score or rank", async () => {
    await expect(
      db.query(`insert into public.match_results (run_id, application_id, state, score_status, score_total, rank, confidence, headline, result)
        select id, 'app-1', 'ineligible', 'not_ranked', 80, 1, 'low', 'h', '{}' from public.matching_runs limit 1`),
    ).rejects.toThrow(/check constraint/);
  });
});
