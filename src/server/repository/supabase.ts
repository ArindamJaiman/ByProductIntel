import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, ReviewDecision, ShortlistEntry, StoredRun } from "@/domain/records";
import type {
  Application,
  EvidenceDocType,
  EvidenceSource,
  Material,
  Measurement,
  MaterialDocument,
  Requirement,
  EvidenceRequirement,
} from "@/domain/types";
import type { MaterialInput } from "@/domain/validation";
import { summariseRun, type Actor, type Repository } from "./types";

/**
 * Supabase/Postgres adapter. Every query runs with the signed-in user's
 * session, so row-level security (supabase/migrations) is the access-control
 * boundary. Organisation ids come from the server-resolved Actor, never from
 * the client.
 *
 * Status: type-checked and mapped against the migration schema; the SQL and
 * policies are tested in PGlite, but this adapter has not been exercised
 * against a live Supabase project yet.
 */

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function fail(error: { message: string } | null, context: string): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function toMaterial(r: Row): Material {
  const docs = (r.material_documents as Row[] | null) ?? [];
  const measurements = (r.material_measurements as Row[] | null) ?? [];
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    family: r.family as Material["family"],
    sourceProcess: String(r.source_process),
    description: String(r.description ?? ""),
    organisationId: String(r.organisation_id),
    dataOrigin: r.data_origin as Material["dataOrigin"],
    location: { site: String(r.site), region: String(r.region), country: String(r.country), lat: Number(r.lat), lon: Number(r.lon) },
    volume: { tonnesPerYear: n(r.tonnes_per_year), reportingPeriod: String(r.reporting_period), provenance: r.volume_provenance as Material["volume"]["provenance"] },
    hazard: { status: r.hazard_status as Material["hazard"]["status"], basis: s(r.hazard_basis), verification: r.hazard_verification as Material["hazard"]["verification"] },
    currentHandling: {
      pathway: String(r.handling_pathway),
      kind: r.handling_kind as Material["currentHandling"]["kind"],
      costInrPerTonne: n(r.handling_cost_inr_per_t),
      provenance: r.handling_provenance as Material["currentHandling"]["provenance"],
    },
    measurements: measurements.map(
      (m): Measurement => ({
        property: m.property as Measurement["property"],
        value: Number(m.value),
        unit: m.unit as Measurement["unit"],
        provenance: m.provenance as Measurement["provenance"],
        verification: m.verification as Measurement["verification"],
        method: s(m.method),
        documentId: s(m.doc_key),
        note: s(m.note),
      }),
    ),
    documents: docs.map(
      (d): MaterialDocument => ({
        id: String(d.doc_key),
        type: d.doc_type as EvidenceDocType,
        title: String(d.title),
        status: d.status as MaterialDocument["status"],
        issuedBy: s(d.issued_by),
        date: s(d.issued_on),
        provenance: d.provenance as MaterialDocument["provenance"],
        note: s(d.note),
      }),
    ),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function materialRow(input: MaterialInput) {
  return {
    name: input.name,
    family: input.family,
    source_process: input.sourceProcess,
    description: input.description,
    site: input.location.site,
    region: input.location.region,
    country: input.location.country,
    lat: input.location.lat,
    lon: input.location.lon,
    tonnes_per_year: input.volume.tonnesPerYear,
    reporting_period: input.volume.reportingPeriod,
    volume_provenance: input.volume.provenance,
    hazard_status: input.hazard.status,
    hazard_basis: input.hazard.basis ?? null,
    hazard_verification: input.hazard.verification,
    handling_pathway: input.currentHandling.pathway,
    handling_kind: input.currentHandling.kind,
    handling_cost_inr_per_t: input.currentHandling.costInrPerTonne,
    handling_provenance: input.currentHandling.provenance,
  };
}

function toApplication(r: Row): Application {
  const reqs = ((r.application_requirements as Row[]) ?? []).sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const evid = ((r.application_evidence_requirements as Row[]) ?? []).sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    industry: String(r.industry),
    description: String(r.description),
    specStatus: r.spec_status as Application["specStatus"],
    acceptedFamilies: r.accepted_families as Application["acceptedFamilies"],
    excludesDeclaredHazardous: Boolean(r.excludes_declared_hazardous),
    requirements: reqs.map(
      (q): Requirement => ({
        id: String(q.id),
        property: q.property as Requirement["property"],
        kind: q.kind as Requirement["kind"],
        min: q.min_value === null ? undefined : Number(q.min_value),
        max: q.max_value === null ? undefined : Number(q.max_value),
        unit: q.unit as Requirement["unit"],
        enforcement: q.enforcement as Requirement["enforcement"],
        safetyCritical: Boolean(q.safety_critical),
        rationale: String(q.rationale),
        basis: q.basis as Requirement["basis"],
        sourceId: s(q.source_id),
        remediation: s(q.remediation),
      }),
    ),
    evidenceRequirements: evid.map(
      (e): EvidenceRequirement => ({
        id: String(e.id),
        docType: e.doc_type as EvidenceDocType,
        label: String(e.label),
        enforcement: e.enforcement as EvidenceRequirement["enforcement"],
        safetyCritical: Boolean(e.safety_critical),
        why: String(e.why),
        reviewer: e.reviewer as EvidenceRequirement["reviewer"],
        basis: e.basis as EvidenceRequirement["basis"],
        sourceId: s(e.source_id),
      }),
    ),
    demand: { minTonnesPerYear: Number(r.demand_min_t_per_yr), maxTonnesPerYear: Number(r.demand_max_t_per_yr), provenance: r.demand_provenance as Application["demand"]["provenance"] },
    demandSites: r.demand_sites as Application["demandSites"],
    logistics: { maxTransportKm: Number(r.max_transport_km), mode: "road", basis: r.logistics_basis as Application["logistics"]["basis"] },
    economics: {
      indicativePriceInrPerTonne: n(r.price_inr_per_t),
      processingCostInrPerTonne: n(r.processing_cost_inr_per_t),
      provenance: r.economics_provenance as Application["economics"]["provenance"],
    },
    processingSteps: (r.processing_steps as string[]) ?? [],
    circularity: { tier: r.circularity_tier as Application["circularity"]["tier"], substitutes: String(r.substitutes), rationale: String(r.circularity_rationale) },
    requiresRegulatoryReview: Boolean(r.requires_regulatory_review),
    sourceIds: (r.source_ids as string[]) ?? [],
    rulesetVersion: String(r.ruleset_version),
    reviewStatus: r.review_status as Application["reviewStatus"],
  };
}

function toEvidence(r: Row): EvidenceSource {
  return {
    id: String(r.id),
    title: String(r.title),
    organisation: String(r.organisation),
    url: String(r.url),
    publicationDate: s(r.publication_date) ?? null,
    accessDate: String(r.access_date),
    evidenceType: r.evidence_type as EvidenceSource["evidenceType"],
    relevantTo: (r.relevant_to as string[]) ?? [],
    claim: String(r.claim),
    reviewStatus: r.review_status as EvidenceSource["reviewStatus"],
    caveat: s(r.caveat),
  };
}

function toRun(r: Row, results: Row[]): StoredRun {
  return {
    id: String(r.id),
    label: String(r.label),
    materialId: String(r.material_id),
    createdAt: String(r.created_at),
    createdBy: String(r.created_by ?? "unknown"),
    engineVersion: String(r.engine_version),
    scoringModelVersion: String(r.scoring_model_version),
    rulesetVersions: r.ruleset_versions as StoredRun["rulesetVersions"],
    weights: r.weights as StoredRun["weights"],
    scenario: r.scenario as StoredRun["scenario"],
    inputHash: String(r.input_hash),
    materialSnapshot: r.material_snapshot as StoredRun["materialSnapshot"],
    applicationsSnapshot: r.applications_snapshot as StoredRun["applicationsSnapshot"],
    results: results
      .map((x) => x.result as StoredRun["results"][number])
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.applicationId.localeCompare(b.applicationId)),
  };
}

const MATERIAL_SELECT = "*, material_measurements(*), material_documents(*)";
const APPLICATION_SELECT = "*, application_requirements(*), application_evidence_requirements(*)";

async function writeChildren(db: SupabaseClient, materialId: string, input: MaterialInput) {
  fail((await db.from("material_measurements").delete().eq("material_id", materialId)).error, "Replacing measurements");
  fail((await db.from("material_documents").delete().eq("material_id", materialId)).error, "Replacing documents");
  if (input.documents.length) {
    const { error } = await db.from("material_documents").insert(
      input.documents.map((d) => ({
        material_id: materialId,
        doc_key: d.id,
        doc_type: d.type,
        title: d.title,
        status: d.status,
        issued_by: d.issuedBy ?? null,
        issued_on: d.date ?? null,
        provenance: d.provenance,
        note: d.note ?? null,
      })),
    );
    fail(error, "Saving documents");
  }
  if (input.measurements.length) {
    const { error } = await db.from("material_measurements").insert(
      input.measurements.map((m) => ({
        material_id: materialId,
        property: m.property,
        value: m.value,
        unit: m.unit,
        provenance: m.provenance,
        verification: m.verification,
        method: m.method ?? null,
        doc_key: m.documentId ?? null,
        note: m.note ?? null,
      })),
    );
    fail(error, "Saving measurements");
  }
}

async function appendAudit(db: SupabaseClient, actor: Actor, e: Omit<AuditEvent, "id" | "createdAt" | "actor">) {
  const { error } = await db.from("audit_events").insert({
    organisation_id: actor.organisationId,
    actor: actor.id,
    event_type: e.eventType,
    entity_type: e.entityType,
    entity_id: e.entityId,
    summary: e.summary,
  });
  fail(error, "Writing audit event");
}

export function supabaseRepository(db: SupabaseClient): Repository {
  const repo: Repository = {
    mode: "supabase",
    persistence: "database",

    async listOrganisations() {
      const { data, error } = await db.from("organisations").select("id, name, kind");
      fail(error, "Loading organisations");
      return (data ?? []).map((o) => ({ id: String(o.id), name: String(o.name), kind: String(o.kind) }));
    },

    async listMaterials() {
      const { data, error } = await db.from("byproduct_materials").select(MATERIAL_SELECT).order("updated_at", { ascending: false });
      fail(error, "Loading materials");
      return (data ?? []).map(toMaterial);
    },

    async getMaterial(id) {
      const { data, error } = await db.from("byproduct_materials").select(MATERIAL_SELECT).eq("id", id).maybeSingle();
      fail(error, "Loading material");
      return data ? toMaterial(data) : null;
    },

    async createMaterial(input, actor) {
      const { count } = await db.from("byproduct_materials").select("id", { count: "exact", head: true });
      const code = `BPI-USR-${String((count ?? 0) + 1).padStart(3, "0")}-${actor.organisationId.slice(0, 4)}`;
      const { data, error } = await db
        .from("byproduct_materials")
        .insert({ ...materialRow(input), code, organisation_id: actor.organisationId, data_origin: "user_supplied", created_by: actor.id })
        .select("id")
        .single();
      fail(error, "Creating material");
      const id = String(data!.id);
      await writeChildren(db, id, input);
      await appendAudit(db, actor, { eventType: "material_created", entityType: "material", entityId: id, summary: `Created ${code} ${input.name}` });
      return (await repo.getMaterial(id))!;
    },

    async updateMaterial(id, input, actor) {
      const { error } = await db.from("byproduct_materials").update(materialRow(input)).eq("id", id);
      fail(error, "Updating material");
      await writeChildren(db, id, input);
      await appendAudit(db, actor, { eventType: "material_updated", entityType: "material", entityId: id, summary: `Updated ${input.name}` });
      const updated = await repo.getMaterial(id);
      if (!updated) throw new Error("Material not found or not editable");
      return updated;
    },

    async listApplications() {
      const { data, error } = await db.from("applications").select(APPLICATION_SELECT).order("code");
      fail(error, "Loading applications");
      return (data ?? []).map(toApplication);
    },

    async getApplication(id) {
      const { data, error } = await db.from("applications").select(APPLICATION_SELECT).eq("id", id).maybeSingle();
      fail(error, "Loading application");
      return data ? toApplication(data) : null;
    },

    async listEvidence() {
      const { data, error } = await db.from("evidence_sources").select("*").order("title");
      fail(error, "Loading evidence");
      return (data ?? []).map(toEvidence);
    },

    async createRun(run, actor) {
      const { data, error } = await db
        .from("matching_runs")
        .insert({
          organisation_id: actor.organisationId,
          material_id: run.materialId,
          label: run.label,
          engine_version: run.engineVersion,
          scoring_model_version: run.scoringModelVersion,
          ruleset_versions: run.rulesetVersions,
          weights: run.weights,
          scenario: run.scenario,
          input_hash: run.inputHash,
          material_snapshot: run.materialSnapshot,
          applications_snapshot: run.applicationsSnapshot,
          created_by: actor.id,
        })
        .select("id")
        .single();
      fail(error, "Creating run");
      const runId = String(data!.id);

      const { data: inserted, error: resErr } = await db
        .from("match_results")
        .insert(
          run.results.map((r) => ({
            run_id: runId,
            application_id: r.applicationId,
            state: r.state,
            score_status: r.score.status,
            score_total: r.score.total,
            rank: r.rank,
            confidence: r.score.confidence,
            headline: r.headline,
            result: r,
          })),
        )
        .select("id, application_id");
      fail(resErr, "Saving results");
      const idByApp = new Map((inserted ?? []).map((x) => [String(x.application_id), String(x.id)]));

      const checks = run.results.flatMap((r) =>
        r.checks.map((c) => ({
          result_id: idByApp.get(r.applicationId),
          check_key: c.id,
          stage: c.stage,
          status: c.status,
          enforcement: c.enforcement,
          safety_critical: c.safetyCritical,
          observed: c.observed,
          required: c.required,
          detail: c.detail,
        })),
      );
      const actions = run.results.flatMap((r) =>
        r.bridge.map((a) => ({
          result_id: idByApp.get(r.applicationId),
          action_key: a.id,
          category: a.category,
          target: a.target,
          current_state: a.currentState,
          next_action: a.nextAction,
          reviewer: a.reviewer,
          blocking: a.blocking,
          priority: a.priority,
        })),
      );
      const links = run.results.flatMap((r) =>
        [...new Set(r.checks.map((c) => c.sourceId).filter(Boolean) as string[])].map((sourceId) => ({
          result_id: idByApp.get(r.applicationId),
          source_id: sourceId,
        })),
      );
      const [c1, c2, c3] = await Promise.all([
        checks.length ? db.from("match_checks").insert(checks) : Promise.resolve({ error: null }),
        actions.length ? db.from("missing_bridge_actions").insert(actions) : Promise.resolve({ error: null }),
        links.length ? db.from("match_evidence_links").insert(links) : Promise.resolve({ error: null }),
      ]);
      fail(c1.error, "Saving checks");
      fail(c2.error, "Saving bridge actions");
      fail(c3.error, "Saving evidence links");
      await appendAudit(db, actor, {
        eventType: "run_created",
        entityType: "run",
        entityId: runId,
        summary: `Ran matching for ${run.materialSnapshot.code} (${run.results.length} applications, ${run.scenario.label})`,
      });
      return (await repo.getRun(runId))!;
    },

    async getRun(id) {
      const [{ data: run, error }, { data: results, error: rErr }] = await Promise.all([
        db.from("matching_runs").select("*").eq("id", id).maybeSingle(),
        db.from("match_results").select("result").eq("run_id", id),
      ]);
      fail(error, "Loading run");
      fail(rErr, "Loading results");
      return run ? toRun(run, results ?? []) : null;
    },

    async listRuns(filter = {}) {
      let q = db.from("matching_runs").select("*, match_results(result)").order("created_at", { ascending: false }).limit(filter.limit ?? 50);
      if (filter.materialId) q = q.eq("material_id", filter.materialId);
      const { data, error } = await q;
      fail(error, "Loading runs");
      return (data ?? []).map((r) => summariseRun(toRun(r, (r.match_results as Row[]) ?? [])));
    },

    async listShortlist() {
      const { data, error } = await db.from("saved_shortlists").select("*").order("updated_at", { ascending: false });
      fail(error, "Loading shortlist");
      return (data ?? []).map(
        (r): ShortlistEntry => ({
          id: String(r.id),
          materialId: String(r.material_id),
          applicationId: String(r.application_id),
          runId: String(r.run_id),
          status: r.status,
          note: r.note ?? null,
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        }),
      );
    },

    async setShortlistStatus(entry, actor) {
      const { data, error } = await db
        .from("saved_shortlists")
        .upsert(
          {
            organisation_id: actor.organisationId,
            material_id: entry.materialId,
            application_id: entry.applicationId,
            run_id: entry.runId,
            status: entry.status,
            note: entry.note,
            created_by: actor.id,
          },
          { onConflict: "organisation_id,material_id,application_id" },
        )
        .select("*")
        .single();
      fail(error, "Saving shortlist entry");
      await repo.addDecision({ ...entry, decision: entry.status }, actor);
      await appendAudit(db, actor, { eventType: "shortlist_changed", entityType: "shortlist", entityId: String(data!.id), summary: `${entry.status.replace("_", " ")}: ${entry.applicationId}` });
      return {
        id: String(data!.id),
        materialId: entry.materialId,
        applicationId: entry.applicationId,
        runId: entry.runId,
        status: entry.status,
        note: entry.note,
        createdAt: String(data!.created_at),
        updatedAt: String(data!.updated_at),
      };
    },

    async removeShortlist(materialId, applicationId, actor) {
      const { error } = await db.from("saved_shortlists").delete().eq("material_id", materialId).eq("application_id", applicationId);
      fail(error, "Removing shortlist entry");
      await repo.addDecision({ materialId, applicationId, runId: null, decision: "removed", note: null }, actor);
    },

    async listDecisions(filter = {}) {
      let q = db.from("review_decisions").select("*").order("created_at", { ascending: false });
      if (filter.materialId) q = q.eq("material_id", filter.materialId);
      if (filter.applicationId) q = q.eq("application_id", filter.applicationId);
      const { data, error } = await q;
      fail(error, "Loading decisions");
      return (data ?? []).map(
        (r): ReviewDecision => ({
          id: String(r.id),
          materialId: String(r.material_id),
          applicationId: String(r.application_id),
          runId: r.run_id ?? null,
          decision: r.decision,
          note: r.note ?? null,
          actor: String(r.actor ?? "unknown"),
          createdAt: String(r.created_at),
        }),
      );
    },

    async addDecision(d, actor) {
      const { data, error } = await db
        .from("review_decisions")
        .insert({
          organisation_id: actor.organisationId,
          material_id: d.materialId,
          application_id: d.applicationId,
          run_id: d.runId,
          decision: d.decision,
          note: d.note,
          actor: actor.id,
        })
        .select("*")
        .single();
      fail(error, "Recording decision");
      return { ...d, id: String(data!.id), actor: actor.label, createdAt: String(data!.created_at) };
    },

    async listAudit(limit = 20) {
      const { data, error } = await db.from("audit_events").select("*").order("created_at", { ascending: false }).limit(limit);
      fail(error, "Loading audit events");
      return (data ?? []).map(
        (r): AuditEvent => ({
          id: String(r.id),
          eventType: r.event_type,
          entityType: r.entity_type,
          entityId: String(r.entity_id),
          summary: String(r.summary),
          actor: String(r.actor ?? "unknown"),
          createdAt: String(r.created_at),
        }),
      );
    },
  };
  return repo;
}
