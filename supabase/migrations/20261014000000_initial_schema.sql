-- ByProduct Intelligence — initial schema
-- Reference data (applications, requirements, evidence sources) is read-only
-- for user sessions and is written only with the service role (seed script).
-- Organisation-owned data is isolated by row-level security. Matching runs,
-- results and review decisions are append-only for user sessions.

-- gen_random_uuid() is built into Postgres 13+; no extension required.
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Organisations and profiles
-- ---------------------------------------------------------------------------
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 200),
  kind text not null default 'producer' check (kind in ('producer', 'recipient', 'workspace', 'research')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  display_name text,
  -- Assigned by an administrator with the service role; users cannot change it.
  role text not null default 'member' check (role in ('member', 'reviewer', 'admin')),
  created_at timestamptz not null default now()
);
create index profiles_organisation_id_idx on public.profiles (organisation_id);

-- Resolves the caller's organisation. SECURITY DEFINER so policies on profiles
-- do not recurse; kept in the unexposed private schema and checks auth.uid().
create or replace function private.user_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organisation_id from public.profiles p where p.id = (select auth.uid());
$$;
revoke execute on function private.user_org_id() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.user_org_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Evidence sources and applications (reference data)
-- ---------------------------------------------------------------------------
create table public.evidence_sources (
  id text primary key,
  title text not null,
  organisation text not null,
  url text not null check (url ~ '^https?://'),
  publication_date text,
  access_date date not null,
  evidence_type text not null check (evidence_type in (
    'standard_reference', 'regulation', 'government_guidance', 'peer_reviewed',
    'company_publication', 'project_report', 'trade_press', 'secondary_summary')),
  relevant_to text[] not null default '{}',
  claim text not null,
  review_status text not null check (review_status in ('abstract_or_summary_reviewed', 'full_text_reviewed', 'secondary_only')),
  caveat text
);

create table public.applications (
  id text primary key,
  code text not null unique,
  name text not null,
  industry text not null,
  description text not null,
  spec_status text not null check (spec_status in ('source_referenced', 'demo_assumption', 'specification_not_established')),
  accepted_families text[] not null,
  excludes_declared_hazardous boolean not null default true,
  demand_min_t_per_yr numeric not null check (demand_min_t_per_yr >= 0),
  demand_max_t_per_yr numeric not null,
  demand_provenance text not null,
  -- Small, variable list of illustrative locations; not queried relationally.
  demand_sites jsonb not null check (jsonb_typeof(demand_sites) = 'array' and jsonb_array_length(demand_sites) > 0),
  max_transport_km numeric not null check (max_transport_km > 0),
  logistics_basis text not null check (logistics_basis in ('source_referenced', 'demo_assumption')),
  price_inr_per_t numeric check (price_inr_per_t >= 0),
  processing_cost_inr_per_t numeric check (processing_cost_inr_per_t >= 0),
  economics_provenance text not null,
  processing_steps text[] not null default '{}',
  circularity_tier text not null check (circularity_tier in ('high_value_substitution', 'material_substitution', 'bulk_fill')),
  substitutes text not null,
  circularity_rationale text not null,
  requires_regulatory_review boolean not null default true,
  source_ids text[] not null default '{}',
  ruleset_version text not null,
  review_status text not null check (review_status in ('demo_unreviewed', 'source_checked')),
  check (demand_max_t_per_yr >= demand_min_t_per_yr)
);

create table public.application_requirements (
  id text primary key,
  application_id text not null references public.applications (id) on delete cascade,
  property text not null,
  kind text not null check (kind in ('min', 'max', 'range', 'reported')),
  min_value numeric,
  max_value numeric,
  unit text not null,
  enforcement text not null check (enforcement in ('hard', 'soft')),
  safety_critical boolean not null default false,
  rationale text not null,
  basis text not null check (basis in ('source_referenced', 'demo_assumption')),
  source_id text references public.evidence_sources (id),
  remediation text,
  sort_order int not null default 0,
  check (kind not in ('min', 'range') or min_value is not null),
  check (kind not in ('max', 'range') or max_value is not null),
  check (kind <> 'range' or min_value <= max_value),
  check (basis <> 'source_referenced' or source_id is not null)
);
create index application_requirements_application_id_idx on public.application_requirements (application_id);
create index application_requirements_source_id_idx on public.application_requirements (source_id);

create table public.application_evidence_requirements (
  id text primary key,
  application_id text not null references public.applications (id) on delete cascade,
  doc_type text not null,
  label text not null,
  enforcement text not null check (enforcement in ('hard', 'soft')),
  safety_critical boolean not null default false,
  why text not null,
  reviewer text not null check (reviewer in ('laboratory', 'technical_expert', 'regulatory', 'commercial')),
  basis text not null check (basis in ('source_referenced', 'demo_assumption')),
  source_id text references public.evidence_sources (id),
  sort_order int not null default 0,
  check (basis <> 'source_referenced' or source_id is not null)
);
create index application_evidence_requirements_application_id_idx on public.application_evidence_requirements (application_id);
create index application_evidence_requirements_source_id_idx on public.application_evidence_requirements (source_id);

-- ---------------------------------------------------------------------------
-- Materials (organisation-owned)
-- ---------------------------------------------------------------------------
create table public.byproduct_materials (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  name text not null check (length(name) between 3 and 140),
  family text not null check (family in (
    'steel_slag_bof', 'steel_slag_eaf', 'blast_furnace_slag_granulated', 'fly_ash', 'foundry_sand', 'mill_scale')),
  source_process text not null,
  description text not null default '',
  data_origin text not null check (data_origin in ('synthetic_demo', 'user_supplied', 'verified_evidence')),
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  site text not null,
  region text not null,
  country text not null,
  lat numeric not null check (lat between -90 and 90),
  lon numeric not null check (lon between -180 and 180),
  -- NULL means "not reported"; never stored as 0.
  tonnes_per_year numeric check (tonnes_per_year > 0),
  reporting_period text not null,
  volume_provenance text not null,
  hazard_status text not null check (hazard_status in ('declared_non_hazardous', 'declared_hazardous', 'not_declared')),
  hazard_basis text,
  hazard_verification text not null,
  handling_pathway text not null,
  handling_kind text not null check (handling_kind in ('disposal_or_stockpile', 'existing_use', 'unknown')),
  handling_cost_inr_per_t numeric check (handling_cost_inr_per_t >= 0),
  handling_provenance text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index byproduct_materials_organisation_id_idx on public.byproduct_materials (organisation_id);
create index byproduct_materials_family_idx on public.byproduct_materials (family);
create index byproduct_materials_updated_at_idx on public.byproduct_materials (updated_at desc);
create index byproduct_materials_created_by_idx on public.byproduct_materials (created_by);

create table public.material_documents (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.byproduct_materials (id) on delete cascade,
  doc_key text not null,
  doc_type text not null,
  title text not null,
  status text not null check (status in ('available_unverified', 'available_verified', 'requested')),
  issued_by text,
  issued_on text,
  provenance text not null,
  note text,
  unique (material_id, doc_key)
);
create index material_documents_material_id_idx on public.material_documents (material_id);

create table public.material_measurements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.byproduct_materials (id) on delete cascade,
  property text not null,
  value numeric not null,
  unit text not null,
  provenance text not null check (provenance in ('verified_source', 'user_supplied', 'synthetic_demo', 'calculated_estimate', 'hypothesis')),
  verification text not null check (verification in ('unverified', 'self_declared', 'lab_reported', 'independently_verified')),
  method text,
  doc_key text,
  note text,
  unique (material_id, property)
);
-- (material_id, property) unique index also serves material_id lookups.

-- ---------------------------------------------------------------------------
-- Matching runs and results (append-only)
-- ---------------------------------------------------------------------------
create table public.matching_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  material_id uuid not null references public.byproduct_materials (id) on delete cascade,
  label text not null,
  engine_version text not null,
  scoring_model_version text not null,
  ruleset_versions jsonb not null,
  weights jsonb not null,
  scenario jsonb not null,
  input_hash text not null,
  -- Exact inputs, so a run can be reproduced from its recorded inputs.
  material_snapshot jsonb not null,
  applications_snapshot jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index matching_runs_org_created_idx on public.matching_runs (organisation_id, created_at desc);
create index matching_runs_material_id_idx on public.matching_runs (material_id);
create index matching_runs_created_by_idx on public.matching_runs (created_by);

create table public.match_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.matching_runs (id) on delete cascade,
  application_id text not null references public.applications (id),
  state text not null check (state in ('potentially_eligible', 'incomplete_evidence', 'ineligible')),
  score_status text not null check (score_status in ('scored', 'provisional', 'insufficient_data', 'not_ranked')),
  score_total numeric check (score_total between 0 and 100),
  rank int,
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  headline text not null,
  -- Full explanation snapshot as produced by the engine (derived, immutable).
  result jsonb not null,
  unique (run_id, application_id),
  check (state <> 'ineligible' or (score_total is null and rank is null))
);
create index match_results_application_id_idx on public.match_results (application_id);

create table public.match_checks (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.match_results (id) on delete cascade,
  check_key text not null,
  stage text not null,
  status text not null check (status in ('pass', 'fail', 'unknown')),
  enforcement text not null,
  safety_critical boolean not null,
  observed text,
  required text,
  detail text not null
);
create index match_checks_result_id_idx on public.match_checks (result_id);

create table public.missing_bridge_actions (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.match_results (id) on delete cascade,
  action_key text not null,
  category text not null,
  target text not null,
  current_state text not null,
  next_action text not null,
  reviewer text,
  blocking boolean not null,
  priority smallint not null check (priority between 1 and 3)
);
create index missing_bridge_actions_result_id_idx on public.missing_bridge_actions (result_id);
create index missing_bridge_actions_open_blocking_idx on public.missing_bridge_actions (category) where blocking;

create table public.match_evidence_links (
  result_id uuid not null references public.match_results (id) on delete cascade,
  source_id text not null references public.evidence_sources (id),
  primary key (result_id, source_id)
);
create index match_evidence_links_source_id_idx on public.match_evidence_links (source_id);

-- ---------------------------------------------------------------------------
-- Scenarios, shortlists, reviews, audit
-- ---------------------------------------------------------------------------
create table public.scenario_assumptions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  material_id uuid references public.byproduct_materials (id) on delete cascade,
  label text not null,
  scenario jsonb not null,
  weights jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index scenario_assumptions_org_idx on public.scenario_assumptions (organisation_id);
create index scenario_assumptions_material_id_idx on public.scenario_assumptions (material_id);
create index scenario_assumptions_created_by_idx on public.scenario_assumptions (created_by);

create table public.saved_shortlists (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  material_id uuid not null references public.byproduct_materials (id) on delete cascade,
  application_id text not null references public.applications (id),
  run_id uuid not null references public.matching_runs (id) on delete cascade,
  -- Review state only. There is deliberately no 'approved' value.
  status text not null check (status in ('shortlisted', 'under_review', 'parked', 'rejected')),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, material_id, application_id)
);
create index saved_shortlists_material_id_idx on public.saved_shortlists (material_id);
create index saved_shortlists_application_id_idx on public.saved_shortlists (application_id);
create index saved_shortlists_run_id_idx on public.saved_shortlists (run_id);
create index saved_shortlists_created_by_idx on public.saved_shortlists (created_by);

create table public.review_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  material_id uuid not null references public.byproduct_materials (id) on delete cascade,
  application_id text not null references public.applications (id),
  run_id uuid references public.matching_runs (id) on delete set null,
  decision text not null check (decision in ('shortlisted', 'under_review', 'parked', 'rejected', 'removed', 'note')),
  note text,
  actor uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index review_decisions_org_pair_idx on public.review_decisions (organisation_id, material_id, application_id, created_at desc);
create index review_decisions_material_id_idx on public.review_decisions (material_id);
create index review_decisions_application_id_idx on public.review_decisions (application_id);
create index review_decisions_run_id_idx on public.review_decisions (run_id);
create index review_decisions_actor_idx on public.review_decisions (actor);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index audit_events_org_created_idx on public.audit_events (organisation_id, created_at desc);
create index audit_events_actor_idx on public.audit_events (actor);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.evidence_sources enable row level security;
alter table public.applications enable row level security;
alter table public.application_requirements enable row level security;
alter table public.application_evidence_requirements enable row level security;
alter table public.byproduct_materials enable row level security;
alter table public.material_documents enable row level security;
alter table public.material_measurements enable row level security;
alter table public.matching_runs enable row level security;
alter table public.match_results enable row level security;
alter table public.match_checks enable row level security;
alter table public.missing_bridge_actions enable row level security;
alter table public.match_evidence_links enable row level security;
alter table public.scenario_assumptions enable row level security;
alter table public.saved_shortlists enable row level security;
alter table public.review_decisions enable row level security;
alter table public.audit_events enable row level security;

-- Organisations and profiles: read own only. No user writes (service role only).
create policy "read own organisation" on public.organisations for select to authenticated
  using (id = (select private.user_org_id()));
create policy "read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Reference data: readable by signed-in users, never writable by them.
create policy "read evidence sources" on public.evidence_sources for select to authenticated using (true);
create policy "read applications" on public.applications for select to authenticated using (true);
create policy "read application requirements" on public.application_requirements for select to authenticated using (true);
create policy "read application evidence requirements" on public.application_evidence_requirements for select to authenticated using (true);

-- Materials: own organisation's records plus records explicitly shared.
create policy "read own or shared materials" on public.byproduct_materials for select to authenticated
  using (organisation_id = (select private.user_org_id()) or visibility = 'shared');
create policy "create own materials" on public.byproduct_materials for insert to authenticated
  with check (organisation_id = (select private.user_org_id()) and data_origin = 'user_supplied');
create policy "update own materials" on public.byproduct_materials for update to authenticated
  using (organisation_id = (select private.user_org_id()))
  with check (organisation_id = (select private.user_org_id()) and data_origin = 'user_supplied');

-- Child rows follow their material. Users cannot self-assign verified states.
create policy "read material documents" on public.material_documents for select to authenticated
  using (exists (select 1 from public.byproduct_materials m where m.id = material_id
    and (m.organisation_id = (select private.user_org_id()) or m.visibility = 'shared')));
create policy "write own material documents" on public.material_documents for all to authenticated
  using (exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())))
  with check (status <> 'available_verified' and provenance <> 'verified_source'
    and exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())));

create policy "read material measurements" on public.material_measurements for select to authenticated
  using (exists (select 1 from public.byproduct_materials m where m.id = material_id
    and (m.organisation_id = (select private.user_org_id()) or m.visibility = 'shared')));
create policy "write own material measurements" on public.material_measurements for all to authenticated
  using (exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())))
  with check (verification <> 'independently_verified' and provenance <> 'verified_source'
    and exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())));

-- Runs and their derived rows: own organisation; insert-only.
create policy "read own runs" on public.matching_runs for select to authenticated
  using (organisation_id = (select private.user_org_id()));
create policy "create own runs" on public.matching_runs for insert to authenticated
  with check (organisation_id = (select private.user_org_id()) and created_by = (select auth.uid()));

create policy "read own results" on public.match_results for select to authenticated
  using (exists (select 1 from public.matching_runs r where r.id = run_id and r.organisation_id = (select private.user_org_id())));
create policy "create own results" on public.match_results for insert to authenticated
  with check (exists (select 1 from public.matching_runs r where r.id = run_id and r.organisation_id = (select private.user_org_id())));

create policy "read own checks" on public.match_checks for select to authenticated
  using (exists (select 1 from public.match_results x join public.matching_runs r on r.id = x.run_id
    where x.id = result_id and r.organisation_id = (select private.user_org_id())));
create policy "create own checks" on public.match_checks for insert to authenticated
  with check (exists (select 1 from public.match_results x join public.matching_runs r on r.id = x.run_id
    where x.id = result_id and r.organisation_id = (select private.user_org_id())));

create policy "read own actions" on public.missing_bridge_actions for select to authenticated
  using (exists (select 1 from public.match_results x join public.matching_runs r on r.id = x.run_id
    where x.id = result_id and r.organisation_id = (select private.user_org_id())));
create policy "create own actions" on public.missing_bridge_actions for insert to authenticated
  with check (exists (select 1 from public.match_results x join public.matching_runs r on r.id = x.run_id
    where x.id = result_id and r.organisation_id = (select private.user_org_id())));

create policy "read own evidence links" on public.match_evidence_links for select to authenticated
  using (exists (select 1 from public.match_results x join public.matching_runs r on r.id = x.run_id
    where x.id = result_id and r.organisation_id = (select private.user_org_id())));
create policy "create own evidence links" on public.match_evidence_links for insert to authenticated
  with check (exists (select 1 from public.match_results x join public.matching_runs r on r.id = x.run_id
    where x.id = result_id and r.organisation_id = (select private.user_org_id())));

create policy "manage own scenarios" on public.scenario_assumptions for all to authenticated
  using (organisation_id = (select private.user_org_id()))
  with check (organisation_id = (select private.user_org_id()));

create policy "read own shortlist" on public.saved_shortlists for select to authenticated
  using (organisation_id = (select private.user_org_id()));
create policy "create own shortlist" on public.saved_shortlists for insert to authenticated
  with check (organisation_id = (select private.user_org_id()) and created_by = (select auth.uid()));
create policy "update own shortlist" on public.saved_shortlists for update to authenticated
  using (organisation_id = (select private.user_org_id()))
  with check (organisation_id = (select private.user_org_id()));
create policy "delete own shortlist" on public.saved_shortlists for delete to authenticated
  using (organisation_id = (select private.user_org_id()));

-- Review history is append-only.
create policy "read own decisions" on public.review_decisions for select to authenticated
  using (organisation_id = (select private.user_org_id()));
create policy "append own decisions" on public.review_decisions for insert to authenticated
  with check (organisation_id = (select private.user_org_id()) and actor = (select auth.uid()));

create policy "read own audit events" on public.audit_events for select to authenticated
  using (organisation_id = (select private.user_org_id()));
create policy "append own audit events" on public.audit_events for insert to authenticated
  with check (organisation_id = (select private.user_org_id()) and actor = (select auth.uid()));

-- Table privileges (RLS still applies). anon gets nothing.
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
grant insert, update on public.byproduct_materials, public.material_documents, public.material_measurements to authenticated;
grant delete on public.material_documents, public.material_measurements, public.saved_shortlists to authenticated;
grant insert on public.matching_runs, public.match_results, public.match_checks, public.missing_bridge_actions,
  public.match_evidence_links, public.review_decisions, public.audit_events to authenticated;
grant insert, update, delete on public.scenario_assumptions to authenticated;
grant insert, update on public.saved_shortlists to authenticated;

-- Keep updated_at honest.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger byproduct_materials_touch before update on public.byproduct_materials
  for each row execute function private.touch_updated_at();
create trigger saved_shortlists_touch before update on public.saved_shortlists
  for each row execute function private.touch_updated_at();
