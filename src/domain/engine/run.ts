import {
  DEFAULT_WEIGHTS,
  ENGINE_VERSION,
  SCORING_MODEL_VERSION,
  normaliseWeights,
  type ScoreWeights,
} from "../scoring-config";
import type { Application, Material, Scenario } from "../types";
import { resolveAssumptions } from "./economics";
import { evaluateMatch } from "./evaluate";
import type { MatchResult, ScoreStatus } from "./result-types";

const STATUS_ORDER: Record<ScoreStatus, number> = {
  scored: 0,
  provisional: 1,
  insufficient_data: 2,
  not_ranked: 3,
};

/**
 * Order results so that an ineligible candidate can never appear above an
 * eligible or reviewable one, whatever its component values:
 *   scored (desc) → provisional (desc) → insufficient data → not ranked.
 * Ties are broken by application id for determinism.
 */
export function rankResults(results: MatchResult[]): MatchResult[] {
  const sorted = [...results].sort(
    (a, b) =>
      STATUS_ORDER[a.score.status] - STATUS_ORDER[b.score.status] ||
      (b.score.total ?? -1) - (a.score.total ?? -1) ||
      a.applicationId.localeCompare(b.applicationId),
  );
  let rank = 0;
  return sorted.map((r) =>
    r.score.status === "scored" || r.score.status === "provisional" ? { ...r, rank: ++rank } : { ...r, rank: null },
  );
}

export interface MatchingRunInput {
  material: Material;
  applications: Application[];
  scenario: Scenario;
  weights?: Partial<ScoreWeights>;
}

export interface MatchingRunOutput {
  engineVersion: string;
  scoringModelVersion: string;
  weights: ScoreWeights;
  rulesetVersions: Record<string, string>;
  inputHash: string;
  results: MatchResult[];
}

/** Stable JSON serialisation (sorted keys) for hashing. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

/** FNV-1a 32-bit hash. Used to fingerprint run inputs, not for security. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Run the full engine for one material against a set of applications. The
 * output records every version identifier and an input fingerprint so a run
 * can be reproduced from its stored inputs.
 */
export function runMatching({ material, applications, scenario, weights }: MatchingRunInput): MatchingRunOutput {
  const w = weights ? normaliseWeights(weights) : DEFAULT_WEIGHTS;
  const results = applications.map((app) =>
    evaluateMatch(material, app, resolveAssumptions(scenario.defaults, scenario.perApplication[app.id]), w),
  );
  const inputHash = fnv1a(
    stableStringify({ material, applications, scenario, weights: w, ENGINE_VERSION, SCORING_MODEL_VERSION }),
  );
  return {
    engineVersion: ENGINE_VERSION,
    scoringModelVersion: SCORING_MODEL_VERSION,
    weights: w,
    rulesetVersions: Object.fromEntries(applications.map((a) => [a.id, a.rulesetVersion])),
    inputHash,
    results: rankResults(results),
  };
}
