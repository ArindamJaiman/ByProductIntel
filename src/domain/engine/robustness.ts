import { COMPONENT_LABELS, normaliseWeights, type ScoreComponentKey, type ScoreWeights } from "../scoring-config";
import type { MatchResult } from "./result-types";

export interface WeightVariant {
  label: string;
  weights: ScoreWeights;
}

/**
 * The weight sets a ranking is tested against: the run's own weights, equal
 * weights, and each component halved and raised by half (re-normalised).
 */
export function weightVariants(base: ScoreWeights): WeightVariant[] {
  const keys = Object.keys(base) as ScoreComponentKey[];
  const variants: WeightVariant[] = [
    { label: "Run weights", weights: base },
    { label: "Equal weights", weights: normaliseWeights(Object.fromEntries(keys.map((k) => [k, 1])) as ScoreWeights) },
  ];
  for (const k of keys) {
    if (base[k] === 0) continue;
    for (const f of [0.5, 1.5]) {
      variants.push({ label: `${COMPONENT_LABELS[k]} ×${f}`, weights: normaliseWeights({ ...base, [k]: base[k] * f }) });
    }
  }
  return variants;
}

export interface CandidateRobustness {
  applicationId: string;
  bestRank: number;
  worstRank: number;
  timesFirst: number;
  minScore: number;
  maxScore: number;
}

export interface RankRobustness {
  status: "stable" | "sensitive" | "not_applicable";
  variants: number;
  leader: string | null;
  leaderTimesFirst: number;
  candidates: CandidateRobustness[];
  /** Variants under which a different candidate is ranked first. */
  overturnedBy: string[];
}

const STATUS_ORDER = { scored: 0, provisional: 1 } as const;

/**
 * Re-rank the actionable candidates of one run under every weight variant.
 * Component values are reused as computed; only the weights change, so hard
 * constraints and eligibility states are untouched. A ranking is "stable"
 * when the same candidate leads under every variant.
 */
export function rankRobustness(results: MatchResult[], base: ScoreWeights): RankRobustness {
  const actionable = results.filter(
    (r) => (r.score.status === "scored" || r.score.status === "provisional") && r.score.components.every((c) => c.value !== null),
  );
  const variants = weightVariants(base);
  if (actionable.length < 2) {
    return { status: "not_applicable", variants: variants.length, leader: actionable[0]?.applicationId ?? null, leaderTimesFirst: actionable.length ? variants.length : 0, candidates: [], overturnedBy: [] };
  }

  const stats = new Map<string, CandidateRobustness>(
    actionable.map((r) => [r.applicationId, { applicationId: r.applicationId, bestRank: Infinity, worstRank: 0, timesFirst: 0, minScore: Infinity, maxScore: -Infinity }]),
  );
  const firsts: string[] = [];
  for (const v of variants) {
    const scored = actionable
      .map((r) => ({
        r,
        total: Number(r.score.components.reduce((s, c) => s + (c.value ?? 0) * v.weights[c.key] * 100, 0).toFixed(1)),
      }))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.r.score.status as keyof typeof STATUS_ORDER] - STATUS_ORDER[b.r.score.status as keyof typeof STATUS_ORDER] ||
          b.total - a.total ||
          a.r.applicationId.localeCompare(b.r.applicationId),
      );
    scored.forEach(({ r, total }, i) => {
      const s = stats.get(r.applicationId)!;
      s.bestRank = Math.min(s.bestRank, i + 1);
      s.worstRank = Math.max(s.worstRank, i + 1);
      s.minScore = Math.min(s.minScore, total);
      s.maxScore = Math.max(s.maxScore, total);
      if (i === 0) s.timesFirst++;
    });
    firsts.push(scored[0].r.applicationId);
  }

  const leader = firsts[0];
  const overturnedBy = variants.filter((_, i) => firsts[i] !== leader).map((v) => v.label);
  return {
    status: overturnedBy.length === 0 ? "stable" : "sensitive",
    variants: variants.length,
    leader,
    leaderTimesFirst: stats.get(leader)!.timesFirst,
    candidates: [...stats.values()].sort((a, b) => a.bestRank - b.bestRank || a.applicationId.localeCompare(b.applicationId)),
    overturnedBy,
  };
}
