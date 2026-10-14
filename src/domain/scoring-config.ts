import type { CircularityTier, ScenarioAssumptions } from "./types";

/**
 * Central, versioned scoring configuration.
 *
 * These weights and anchors are DEMONSTRATION DEFAULTS chosen for the MVP.
 * They are not industry-validated constants. Any change to a weight, anchor
 * or rule in this file must bump SCORING_MODEL_VERSION so that stored
 * matching runs remain reproducible against the model that produced them.
 * See docs/matching-model.md.
 */
export const SCORING_MODEL_VERSION = "bpi-score-0.1.0";
export const ENGINE_VERSION = "bpi-engine-0.1.0";

export type ScoreComponentKey =
  | "technical"
  | "economic"
  | "logistics"
  | "volume"
  | "circularity"
  | "evidence";

export type ScoreWeights = Record<ScoreComponentKey, number>;

export const DEFAULT_WEIGHTS: ScoreWeights = {
  technical: 0.4,
  economic: 0.2,
  logistics: 0.15,
  volume: 0.1,
  circularity: 0.1,
  evidence: 0.05,
};

export const COMPONENT_LABELS: Record<ScoreComponentKey, string> = {
  technical: "Technical specification fit",
  economic: "Indicative economic feasibility",
  logistics: "Logistics and distance",
  volume: "Volume compatibility",
  circularity: "Potential circularity benefit",
  evidence: "Evidence completeness",
};

/**
 * Linear anchors for the economic component: a net indicative benefit at or
 * below `floor` scores 0, at or above `ceiling` scores 1.
 */
export const ECONOMIC_ANCHORS_INR_PER_T = { floor: -500, ceiling: 1000 } as const;

/**
 * Ordinal circularity values. These rank how much primary material a pathway
 * plausibly substitutes; they are not a life-cycle assessment and must not be
 * read as emissions savings.
 */
export const CIRCULARITY_TIER_VALUE: Record<CircularityTier, number> = {
  high_value_substitution: 1,
  material_substitution: 0.7,
  bulk_fill: 0.4,
};

export const CIRCULARITY_TIER_LABEL: Record<CircularityTier, string> = {
  high_value_substitution: "Substitutes a high-embodied-value input (e.g. clinker, cement)",
  material_substitution: "Substitutes a primary mineral input",
  bulk_fill: "Bulk fill or low-grade substitution",
};

/**
 * Minimum share of an application's specification requirements that must be
 * measured before a numeric technical score is considered defensible.
 */
export const MIN_TECHNICAL_COVERAGE = 0.6;

/** Great-circle → road distance factor used when no distance override exists. */
export const DEFAULT_ASSUMPTIONS: ScenarioAssumptions = {
  transportCostInrPerTonneKm: 4.5,
  roadCircuityFactor: 1.3,
  recoveryFraction: 0.9,
  distanceKmOverride: null,
  tonnesOfferedOverride: null,
  materialPriceInrPerTonneOverride: null,
  processingCostInrPerTonneOverride: null,
  currentHandlingCostInrPerTonneOverride: null,
};

/** Validate and normalise user-supplied weights so they sum to 1. */
export function normaliseWeights(weights: Partial<ScoreWeights>): ScoreWeights {
  const merged: ScoreWeights = { ...DEFAULT_WEIGHTS, ...weights };
  for (const [k, v] of Object.entries(merged)) {
    if (!Number.isFinite(v) || v < 0) {
      throw new RangeError(`Weight for ${k} must be a non-negative finite number`);
    }
  }
  const total = Object.values(merged).reduce((a, b) => a + b, 0);
  if (total <= 0) throw new RangeError("At least one weight must be positive");
  return Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, v / total]),
  ) as ScoreWeights;
}
