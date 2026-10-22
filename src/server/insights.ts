import "server-only";
import { cache } from "react";
import { findPoolingOpportunities, type PoolingOpportunity } from "@/domain/engine/pooling";
import type { BridgeAction, MatchResult, MatchState } from "@/domain/engine/result-types";
import { buildTestPlan, type TestPlan } from "@/domain/engine/test-plan";
import type { Application, Material, MaterialFamily, ReviewerType } from "@/domain/types";
import { baselineScreen } from "./analysis";
import type { OrganisationRecord, Repository } from "./repository/types";

export interface MaterialPosition {
  material: Material;
  /** Rank-1 actionable pathway under baseline assumptions, if any. */
  best: MatchResult | null;
  /** When nothing is ranked: the first pathway still awaiting evidence, if any. */
  pending: MatchResult | null;
  /** The pathway the material is counted against: `best`, else `pending`. */
  lead: MatchResult | null;
  plan: TestPlan;
  invalid: string | null;
}

export interface OrganisationRollup {
  organisation: OrganisationRecord;
  materials: MaterialPosition[];
  registeredTonnes: number;
  placedEligibleTonnes: number;
  placedPendingTonnes: number;
  /** Positive indicative annual net of best pathways that are potentially eligible. A scenario figure. */
  screenedValueInr: number;
  /** Same, for best pathways still awaiting evidence. */
  pendingValueInr: number;
  openBlockingActions: number;
}

export interface FlowLink {
  family: MaterialFamily;
  /** Application id, or "unplaced" for tonnes no assessable pathway absorbs. */
  target: string;
  tonnes: number;
  state: MatchState | "unplaced";
}

export interface ReviewerLoad {
  reviewer: ReviewerType;
  blocking: number;
  total: number;
  pathways: number;
}

export interface PortfolioInsights {
  applications: Application[];
  positions: MaterialPosition[];
  organisations: OrganisationRollup[];
  pools: PoolingOpportunity[];
  flows: FlowLink[];
  workload: ReviewerLoad[];
  totals: {
    registeredTonnes: number;
    placedEligibleTonnes: number;
    placedPendingTonnes: number;
    screenedValueInr: number;
    pendingValueInr: number;
    materialsWithoutPathway: number;
    /** Road transport emissions of the lead pathways, where they can be estimated. */
    transportTco2ePerYear: number;
  };
}

const REVIEWERS: ReviewerType[] = ["laboratory", "technical_expert", "regulatory", "commercial"];
const positive = (v: number | null) => Math.max(0, v ?? 0);

/**
 * Group-level view across every visible material, computed live from the
 * baseline screen. Each material is counted once, against its best pathway,
 * so tonnes and value are never double-counted across alternatives.
 */
export const portfolioInsights = cache(async (repo: Repository): Promise<PortfolioInsights> => {
  const [{ applications, screens }, organisations] = await Promise.all([baselineScreen(repo), repo.listOrganisations()]);

  const positions: MaterialPosition[] = screens.map((s) => {
    const best = s.inScope.find((r) => r.rank === 1) ?? null;
    const pending = s.inScope.find((r) => r.rank === null && r.state === "incomplete_evidence") ?? null;
    return { material: s.material, best, pending, lead: best ?? pending, plan: buildTestPlan(s.material.id, s.inScope), invalid: s.invalid };
  });

  const blockingOf = (p: MaterialPosition): BridgeAction[] =>
    screens.find((s) => s.material.id === p.material.id)!.inScope.filter((r) => r.state !== "ineligible").flatMap((r) => r.bridge.filter((b) => b.blocking));

  const orgById = new Map(organisations.map((o) => [o.id, o]));
  const byOrg = new Map<string, MaterialPosition[]>();
  for (const p of positions) byOrg.set(p.material.organisationId, [...(byOrg.get(p.material.organisationId) ?? []), p]);

  const rollups: OrganisationRollup[] = [...byOrg].map(([orgId, ps]) => {
    const placed = (state: MatchState) => ps.reduce((s, p) => s + (p.lead?.state === state ? Math.min(p.material.volume.tonnesPerYear ?? 0, p.lead.economics.acceptedTonnes ?? 0) : 0), 0);
    const value = (state: MatchState) => ps.reduce((s, p) => s + (p.lead?.state === state ? positive(p.lead.economics.annualNetInr) : 0), 0);
    return {
      organisation: orgById.get(orgId) ?? { id: orgId, name: "Unassigned organisation", kind: "producer" },
      materials: ps,
      registeredTonnes: ps.reduce((s, p) => s + (p.material.volume.tonnesPerYear ?? 0), 0),
      placedEligibleTonnes: placed("potentially_eligible"),
      placedPendingTonnes: placed("incomplete_evidence"),
      screenedValueInr: value("potentially_eligible"),
      pendingValueInr: value("incomplete_evidence"),
      openBlockingActions: ps.reduce((s, p) => s + blockingOf(p).length, 0),
    };
  });
  rollups.sort((a, b) => b.registeredTonnes - a.registeredTonnes || a.organisation.name.localeCompare(b.organisation.name));

  const flows: FlowLink[] = [];
  for (const p of positions) {
    const reported = p.material.volume.tonnesPerYear ?? 0;
    const placedBy = p.lead;
    const placedTonnes = Math.min(reported, placedBy?.economics.acceptedTonnes ?? 0);
    if (placedBy && placedTonnes > 0) flows.push({ family: p.material.family, target: placedBy.applicationId, tonnes: placedTonnes, state: placedBy.state });
    if (reported - placedTonnes > 0) flows.push({ family: p.material.family, target: "unplaced", tonnes: reported - placedTonnes, state: "unplaced" });
  }

  const workload: ReviewerLoad[] = REVIEWERS.map((reviewer) => {
    const actions = screens.flatMap((s) => s.inScope.filter((r) => r.state !== "ineligible").map((r) => ({ r, a: r.bridge.filter((b) => b.reviewer === reviewer) })));
    return {
      reviewer,
      blocking: actions.reduce((n, x) => n + x.a.filter((b) => b.blocking).length, 0),
      total: actions.reduce((n, x) => n + x.a.length, 0),
      pathways: actions.filter((x) => x.a.length > 0).length,
    };
  });

  const resultsByMaterial = new Map(screens.filter((s) => !s.invalid).map((s) => [s.material.id, s.inScope]));
  const sum = (k: keyof Omit<OrganisationRollup, "organisation" | "materials">) => rollups.reduce((s, r) => s + r[k], 0);

  return {
    applications,
    positions,
    organisations: rollups,
    pools: findPoolingOpportunities(screens.map((s) => s.material), applications, resultsByMaterial),
    flows,
    workload,
    totals: {
      registeredTonnes: sum("registeredTonnes"),
      placedEligibleTonnes: sum("placedEligibleTonnes"),
      placedPendingTonnes: sum("placedPendingTonnes"),
      screenedValueInr: sum("screenedValueInr"),
      pendingValueInr: sum("pendingValueInr"),
      materialsWithoutPathway: positions.filter((p) => !p.lead).length,
      transportTco2ePerYear: positions.reduce((n, p) => n + (p.lead?.environment.transportEmissions?.tonnesCo2ePerYear ?? 0), 0),
    },
  };
});
