import { DOC_STATUS_LABELS, VERIFICATION_LABELS } from "../labels";
import { PROPERTIES } from "../properties";
import type { StoredRun } from "../records";
import { COMPONENT_LABELS, type ScoreComponentKey } from "../scoring-config";
import type { ScenarioAssumptions } from "../types";
import { unitLabel } from "../units";
import { DOC_LABELS } from "./bridge";
import type { CheckStatus, MatchState, ScoreStatus } from "./result-types";

export type InputArea = "measurement" | "document" | "profile" | "scenario" | "weights" | "ruleset" | "engine";

export interface InputChange {
  area: InputArea;
  label: string;
  before: string;
  after: string;
}

export interface CheckChange {
  checkId: string;
  label: string;
  before: CheckStatus | null;
  after: CheckStatus | null;
}

interface PathwaySide {
  state: MatchState;
  scoreStatus: ScoreStatus;
  total: number | null;
  annualNetInr: number | null;
}

export interface PathwayChange {
  applicationId: string;
  /** False when the material family is outside the application's scope in both runs. */
  inScope: boolean;
  before: PathwaySide | null;
  after: PathwaySide | null;
  stateChanged: boolean;
  scoreDelta: number | null;
  checkChanges: CheckChange[];
}

export interface RunDiff {
  sameMaterial: boolean;
  inputChanges: InputChange[];
  pathways: PathwayChange[];
  /** Pathways whose state, score or checks changed. */
  changedCount: number;
}

const NONE = "None";
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "Not reported" : v.toLocaleString("en-IN", { maximumFractionDigits: 3 }));

const ASSUMPTION_LABELS: Record<keyof ScenarioAssumptions, string> = {
  transportCostInrPerTonneKm: "Freight rate (₹/t·km)",
  roadCircuityFactor: "Road circuity factor",
  recoveryFraction: "Recovery fraction",
  distanceKmOverride: "Distance override (km)",
  tonnesOfferedOverride: "Tonnes offered override",
  materialPriceInrPerTonneOverride: "Material price override (₹/t)",
  processingCostInrPerTonneOverride: "Processing cost override (₹/t)",
  currentHandlingCostInrPerTonneOverride: "Avoided handling override (₹/t)",
};

function inputChanges(a: StoredRun, b: StoredRun): InputChange[] {
  const out: InputChange[] = [];
  const push = (area: InputArea, label: string, before: string, after: string) => {
    if (before !== after) out.push({ area, label, before, after });
  };
  const ma = a.materialSnapshot;
  const mb = b.materialSnapshot;

  const measures = (m: typeof ma) => new Map(m.measurements.map((x) => [x.property, x]));
  const [xa, xb] = [measures(ma), measures(mb)];
  for (const p of [...new Set([...xa.keys(), ...xb.keys()])].sort()) {
    const desc = (x: (typeof ma.measurements)[number] | undefined) =>
      x ? `${fmt(x.value)} ${unitLabel(x.unit)} (${VERIFICATION_LABELS[x.verification].toLowerCase()})` : "Not measured";
    push("measurement", PROPERTIES[p].label, desc(xa.get(p)), desc(xb.get(p)));
  }

  const docs = (m: typeof ma) => new Map(m.documents.map((d) => [d.type, DOC_STATUS_LABELS[d.status]]));
  const [da, db] = [docs(ma), docs(mb)];
  for (const t of [...new Set([...da.keys(), ...db.keys()])].sort()) {
    push("document", DOC_LABELS[t], da.get(t) ?? "Not on file", db.get(t) ?? "Not on file");
  }

  push("profile", "Annual volume (t/yr)", fmt(ma.volume.tonnesPerYear), fmt(mb.volume.tonnesPerYear));
  push("profile", "Hazard declaration", ma.hazard.status.replaceAll("_", " "), mb.hazard.status.replaceAll("_", " "));
  push("profile", "Current handling cost (₹/t)", fmt(ma.currentHandling.costInrPerTonne), fmt(mb.currentHandling.costInrPerTonne));
  push("profile", "Location", `${ma.location.lat}, ${ma.location.lon}`, `${mb.location.lat}, ${mb.location.lon}`);
  push("profile", "Source process", ma.sourceProcess, mb.sourceProcess);

  for (const k of Object.keys(ASSUMPTION_LABELS) as (keyof ScenarioAssumptions)[]) {
    push("scenario", ASSUMPTION_LABELS[k], fmt(a.scenario.defaults[k]), fmt(b.scenario.defaults[k]));
  }
  for (const appId of [...new Set([...Object.keys(a.scenario.perApplication), ...Object.keys(b.scenario.perApplication)])].sort()) {
    const name = b.applicationsSnapshot.find((x) => x.id === appId)?.name ?? a.applicationsSnapshot.find((x) => x.id === appId)?.name ?? appId;
    const desc = (o: Partial<ScenarioAssumptions> | undefined) => {
      const set = Object.entries(o ?? {}).filter(([, v]) => v !== null && v !== undefined);
      return set.length ? set.map(([k, v]) => `${ASSUMPTION_LABELS[k as keyof ScenarioAssumptions]} ${fmt(v as number)}`).sort().join("; ") : NONE;
    };
    push("scenario", `Overrides for ${name}`, desc(a.scenario.perApplication[appId]), desc(b.scenario.perApplication[appId]));
  }

  for (const k of Object.keys(COMPONENT_LABELS) as ScoreComponentKey[]) {
    push("weights", COMPONENT_LABELS[k], `${Math.round(a.weights[k] * 100)} %`, `${Math.round(b.weights[k] * 100)} %`);
  }
  for (const appId of [...new Set([...Object.keys(a.rulesetVersions), ...Object.keys(b.rulesetVersions)])].sort()) {
    const name = b.applicationsSnapshot.find((x) => x.id === appId)?.name ?? appId;
    push("ruleset", `Rules for ${name}`, a.rulesetVersions[appId] ?? NONE, b.rulesetVersions[appId] ?? NONE);
  }
  push("engine", "Engine version", a.engineVersion, b.engineVersion);
  push("engine", "Scoring model version", a.scoringModelVersion, b.scoringModelVersion);
  return out;
}

/**
 * Explain what changed between two stored runs: which inputs differ (material
 * record, assumptions, weights, rule versions) and how each pathway's state,
 * score and individual checks moved. `before` is the earlier run.
 */
export function diffRuns(before: StoredRun, after: StoredRun): RunDiff {
  const ra = new Map(before.results.map((r) => [r.applicationId, r]));
  const rb = new Map(after.results.map((r) => [r.applicationId, r]));
  const side = (r: (typeof before.results)[number] | undefined): PathwaySide | null =>
    r ? { state: r.state, scoreStatus: r.score.status, total: r.score.total, annualNetInr: r.economics.annualNetInr } : null;

  const pathways: PathwayChange[] = [...new Set([...ra.keys(), ...rb.keys()])].sort().map((appId) => {
    const a = ra.get(appId);
    const b = rb.get(appId);
    const ca = new Map((a?.checks ?? []).map((c) => [c.id, c]));
    const cb = new Map((b?.checks ?? []).map((c) => [c.id, c]));
    const checkChanges = [...new Set([...ca.keys(), ...cb.keys()])]
      .map((id) => ({ checkId: id, label: (cb.get(id) ?? ca.get(id))!.label, before: ca.get(id)?.status ?? null, after: cb.get(id)?.status ?? null }))
      .filter((c) => c.before !== c.after);
    const sa = side(a);
    const sb = side(b);
    const scoped = (r: typeof a) => r !== undefined && r.checks.find((c) => c.id === "identity")?.status !== "fail";
    return {
      applicationId: appId,
      inScope: scoped(a) || scoped(b),
      before: sa,
      after: sb,
      stateChanged: sa?.state !== sb?.state,
      scoreDelta: sa?.total != null && sb?.total != null ? Number((sb.total - sa.total).toFixed(1)) : null,
      checkChanges,
    };
  });

  return {
    sameMaterial: before.materialId === after.materialId,
    inputChanges: inputChanges(before, after),
    pathways,
    changedCount: pathways.filter(
      (p) => p.stateChanged || (p.scoreDelta !== null && p.scoreDelta !== 0) || p.checkChanges.length > 0 || p.before?.total !== p.after?.total,
    ).length,
  };
}
