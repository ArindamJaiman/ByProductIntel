import type { Application, Material, MaterialFamily } from "../types";
import type { MatchResult } from "./result-types";

export interface PoolMember {
  materialId: string;
  organisationId: string;
  offeredTonnes: number;
  distanceKm: number;
  /** Hard or safety-critical items this source must still supply on its own. */
  outstanding: string[];
}

export interface PoolingOpportunity {
  applicationId: string;
  family: MaterialFamily;
  demandSiteId: string;
  demandSiteLabel: string;
  minTonnes: number;
  combinedTonnes: number;
  members: PoolMember[];
}

export const POOLING_CAVEATS = [
  "Each source keeps its own characterisation. The engine does not infer the properties of a blended stream.",
  "A combined supply needs a blending and quality-control plan, and its own testing agreed with the recipient.",
  "Every member must still clear its own outstanding items before the pooled supply can be assessed.",
] as const;

/**
 * Find sources that fail an application only on minimum offtake and that,
 * pooled with other sources of the same material family delivering to the
 * same demand site, would meet it.
 *
 * Only volume may fail. Any other known hard failure disqualifies a source,
 * and pooling never crosses material families.
 */
export function findPoolingOpportunities(
  materials: Material[],
  applications: Application[],
  resultsByMaterial: Map<string, MatchResult[]>,
): PoolingOpportunity[] {
  const matById = new Map(materials.map((m) => [m.id, m]));
  const out: PoolingOpportunity[] = [];

  for (const app of applications) {
    const groups = new Map<string, { family: MaterialFamily; siteId: string; siteLabel: string; members: PoolMember[] }>();
    for (const [materialId, results] of resultsByMaterial) {
      const m = matById.get(materialId);
      const r = results.find((x) => x.applicationId === app.id);
      if (!m || !r || !app.acceptedFamilies.includes(m.family)) continue;
      const hardFails = r.checks.filter((c) => c.status === "fail" && c.enforcement === "hard");
      if (hardFails.length === 0 || hardFails.some((c) => c.id !== "volume")) continue;
      const offered = r.economics.offeredTonnes;
      if (offered === null || offered <= 0 || r.economics.distanceKm === null) continue;

      const key = `${m.family}|${r.economics.demandSite.id}`;
      const g = groups.get(key) ?? { family: m.family, siteId: r.economics.demandSite.id, siteLabel: r.economics.demandSite.label, members: [] };
      g.members.push({
        materialId,
        organisationId: m.organisationId,
        offeredTonnes: offered,
        distanceKm: r.economics.distanceKm,
        outstanding: r.checks.filter((c) => c.status === "unknown" && (c.enforcement === "hard" || c.safetyCritical)).map((c) => c.label),
      });
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      if (g.members.length < 2) continue;
      const combined = g.members.reduce((s, x) => s + x.offeredTonnes, 0);
      if (combined < app.demand.minTonnesPerYear) continue;
      out.push({
        applicationId: app.id,
        family: g.family,
        demandSiteId: g.siteId,
        demandSiteLabel: g.siteLabel,
        minTonnes: app.demand.minTonnesPerYear,
        combinedTonnes: combined,
        members: g.members.sort((a, b) => a.materialId.localeCompare(b.materialId)),
      });
    }
  }
  return out.sort((a, b) => b.combinedTonnes - a.combinedTonnes || a.applicationId.localeCompare(b.applicationId));
}
