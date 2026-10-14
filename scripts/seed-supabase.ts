/**
 * Load reference data and the synthetic demo materials into a Supabase project.
 *   npm run seed:supabase
 *
 * Requires (server-side only, never NEXT_PUBLIC_):
 *   NEXT_PUBLIC_SUPABASE_URL   project URL
 *   SUPABASE_SECRET_KEY        secret / service-role key — bypasses RLS, keep it out of the browser
 *
 * Idempotent: rows are upserted by deterministic ids. Synthetic materials are
 * inserted as `visibility = 'shared'` so every organisation can see the demo set.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { APPLICATIONS, EVIDENCE_SOURCES, MATERIALS, ORGANISATIONS } from "@/data/seed";

/** Deterministic UUID (v5-style layout) from a stable slug. */
export function slugUuid(slug: string): string {
  const h = createHash("sha1").update(`byproduct-intelligence:${slug}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (server-side secret) before seeding.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const check = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`${label}: ${error.message}`);
  };

  check(
    "organisations",
    (await db.from("organisations").upsert(ORGANISATIONS.map((o) => ({ id: slugUuid(o.id), name: o.name, kind: o.kind })))).error,
  );

  check(
    "evidence_sources",
    (
      await db.from("evidence_sources").upsert(
        EVIDENCE_SOURCES.map((s) => ({
          id: s.id,
          title: s.title,
          organisation: s.organisation,
          url: s.url,
          publication_date: s.publicationDate,
          access_date: s.accessDate,
          evidence_type: s.evidenceType,
          relevant_to: s.relevantTo,
          claim: s.claim,
          review_status: s.reviewStatus,
          caveat: s.caveat ?? null,
        })),
      )
    ).error,
  );

  for (const a of APPLICATIONS) {
    check(
      `application ${a.id}`,
      (
        await db.from("applications").upsert({
          id: a.id,
          code: a.code,
          name: a.name,
          industry: a.industry,
          description: a.description,
          spec_status: a.specStatus,
          accepted_families: a.acceptedFamilies,
          excludes_declared_hazardous: a.excludesDeclaredHazardous,
          demand_min_t_per_yr: a.demand.minTonnesPerYear,
          demand_max_t_per_yr: a.demand.maxTonnesPerYear,
          demand_provenance: a.demand.provenance,
          demand_sites: a.demandSites,
          max_transport_km: a.logistics.maxTransportKm,
          logistics_basis: a.logistics.basis,
          price_inr_per_t: a.economics.indicativePriceInrPerTonne,
          processing_cost_inr_per_t: a.economics.processingCostInrPerTonne,
          economics_provenance: a.economics.provenance,
          processing_steps: a.processingSteps,
          circularity_tier: a.circularity.tier,
          substitutes: a.circularity.substitutes,
          circularity_rationale: a.circularity.rationale,
          requires_regulatory_review: a.requiresRegulatoryReview,
          source_ids: a.sourceIds,
          ruleset_version: a.rulesetVersion,
          review_status: a.reviewStatus,
        })
      ).error,
    );
    check(`requirements ${a.id}`, (await db.from("application_requirements").delete().eq("application_id", a.id)).error);
    if (a.requirements.length) {
      check(
        `requirements ${a.id}`,
        (
          await db.from("application_requirements").insert(
            a.requirements.map((r, i) => ({
              id: r.id,
              application_id: a.id,
              property: r.property,
              kind: r.kind,
              min_value: r.min ?? null,
              max_value: r.max ?? null,
              unit: r.unit,
              enforcement: r.enforcement,
              safety_critical: r.safetyCritical,
              rationale: r.rationale,
              basis: r.basis,
              source_id: r.sourceId ?? null,
              remediation: r.remediation ?? null,
              sort_order: i,
            })),
          )
        ).error,
      );
    }
    check(`evidence requirements ${a.id}`, (await db.from("application_evidence_requirements").delete().eq("application_id", a.id)).error);
    if (a.evidenceRequirements.length) {
      check(
        `evidence requirements ${a.id}`,
        (
          await db.from("application_evidence_requirements").insert(
            a.evidenceRequirements.map((e, i) => ({
              id: e.id,
              application_id: a.id,
              doc_type: e.docType,
              label: e.label,
              enforcement: e.enforcement,
              safety_critical: e.safetyCritical,
              why: e.why,
              reviewer: e.reviewer,
              basis: e.basis,
              source_id: e.sourceId ?? null,
              sort_order: i,
            })),
          )
        ).error,
      );
    }
  }

  for (const m of MATERIALS) {
    const id = slugUuid(m.id);
    check(
      `material ${m.code}`,
      (
        await db.from("byproduct_materials").upsert({
          id,
          code: m.code,
          organisation_id: slugUuid(m.organisationId),
          name: m.name,
          family: m.family,
          source_process: m.sourceProcess,
          description: m.description,
          data_origin: m.dataOrigin,
          visibility: "shared",
          site: m.location.site,
          region: m.location.region,
          country: m.location.country,
          lat: m.location.lat,
          lon: m.location.lon,
          tonnes_per_year: m.volume.tonnesPerYear,
          reporting_period: m.volume.reportingPeriod,
          volume_provenance: m.volume.provenance,
          hazard_status: m.hazard.status,
          hazard_basis: m.hazard.basis ?? null,
          hazard_verification: m.hazard.verification,
          handling_pathway: m.currentHandling.pathway,
          handling_kind: m.currentHandling.kind,
          handling_cost_inr_per_t: m.currentHandling.costInrPerTonne,
          handling_provenance: m.currentHandling.provenance,
        })
      ).error,
    );
    check(`documents ${m.code}`, (await db.from("material_documents").delete().eq("material_id", id)).error);
    check(`measurements ${m.code}`, (await db.from("material_measurements").delete().eq("material_id", id)).error);
    if (m.documents.length) {
      check(
        `documents ${m.code}`,
        (
          await db.from("material_documents").insert(
            m.documents.map((d) => ({
              material_id: id,
              doc_key: d.id,
              doc_type: d.type,
              title: d.title,
              status: d.status,
              issued_by: d.issuedBy ?? null,
              issued_on: d.date ?? null,
              provenance: d.provenance,
              note: d.note ?? null,
            })),
          )
        ).error,
      );
    }
    check(
      `measurements ${m.code}`,
      (
        await db.from("material_measurements").insert(
          m.measurements.map((x) => ({
            material_id: id,
            property: x.property,
            value: x.value,
            unit: x.unit,
            provenance: x.provenance,
            verification: x.verification,
            method: x.method ?? null,
            doc_key: x.documentId ?? null,
            note: x.note ?? null,
          })),
        )
      ).error,
    );
  }

  console.log(
    `Seeded ${ORGANISATIONS.length} organisations, ${EVIDENCE_SOURCES.length} sources, ${APPLICATIONS.length} applications and ${MATERIALS.length} synthetic materials.`,
  );
  console.log(`Demo workspace organisation id: ${slugUuid("org-demo-user")} (assign users to it in public.profiles).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
