import type { ScoreWeights } from "../scoring-config";
import type { Application, Material, ScenarioAssumptions } from "../types";
import { evaluateMatch } from "./evaluate";
import type { MatchResult, MatchState } from "./result-types";

const round = (v: number, dp = 0) => Number(v.toFixed(dp));

export interface BreakEven {
  status: "computed" | "not_computable";
  reason: string | null;
  /** Price + avoided handling − processing: what is left per tonne to pay for transport. */
  marginBeforeTransportInr: number | null;
  /** Road distance at which the net indicative benefit reaches zero. Null when no distance breaks even. */
  breakEvenDistanceKm: number | null;
  /** Freight rate at which the net indicative benefit reaches zero at the current distance. */
  breakEvenFreightInrPerTonneKm: number | null;
  /** Lowest material price that still breaks even at the current distance. */
  minimumPriceInr: number | null;
  /** Highest processing cost that still breaks even at the current distance. */
  maximumProcessingInr: number | null;
  currentDistanceKm: number | null;
  ruleLimitKm: number;
  /** Which distance limit binds first: the economics or the application's transport rule. */
  binding: "economics" | "transport_rule" | null;
}

/**
 * Closed-form break-even points from the economics formula
 *   net = price + avoided − distance × rate − processing.
 * Every figure is derived from the same illustrative inputs as the net value
 * and inherits their status: assumptions, not quotations.
 */
export function breakEven(result: MatchResult, app: Application): BreakEven {
  const e = result.economics;
  const { price, processing, transport } = e.perTonne;
  const avoided = e.perTonne.avoidedHandling ?? 0;
  const rate = e.assumptions.transportCostInrPerTonneKm;
  const base = {
    currentDistanceKm: e.distanceKm,
    ruleLimitKm: app.logistics.maxTransportKm,
  };
  if (e.status !== "complete" || price === null || processing === null || transport === null || e.distanceKm === null) {
    return {
      ...base,
      status: "not_computable",
      reason: `Break-even points need every economic input. Missing: ${e.missingInputs.join(", ") || "distance"}.`,
      marginBeforeTransportInr: null,
      breakEvenDistanceKm: null,
      breakEvenFreightInrPerTonneKm: null,
      minimumPriceInr: null,
      maximumProcessingInr: null,
      binding: null,
    };
  }
  const margin = price + avoided - processing;
  const distance = margin <= 0 ? null : rate > 0 ? round(margin / rate, 1) : null;
  const binding = margin <= 0 ? "economics" : rate === 0 || (distance ?? Infinity) >= app.logistics.maxTransportKm ? "transport_rule" : "economics";
  return {
    ...base,
    status: "computed",
    reason:
      margin <= 0
        ? "Price plus avoided handling does not cover processing, so no transport distance breaks even."
        : rate === 0
          ? "With a zero freight rate the economics break even at any distance; the transport rule is the only distance limit."
          : null,
    marginBeforeTransportInr: round(margin),
    breakEvenDistanceKm: distance,
    breakEvenFreightInrPerTonneKm: e.distanceKm > 0 ? round(margin / e.distanceKm, 2) : null,
    minimumPriceInr: round(transport + processing - avoided),
    maximumProcessingInr: round(price + avoided - transport),
    binding,
  };
}

export type SensitivityKey = "freight" | "distance" | "price" | "processing" | "handling" | "recovery";

export interface SensitivityPoint {
  input: number;
  annualNetInr: number | null;
  netPerTonneInr: number | null;
  score: number | null;
  state: MatchState;
}

export interface SensitivityBar {
  key: SensitivityKey;
  label: string;
  unit: string;
  base: number;
  low: SensitivityPoint;
  high: SensitivityPoint;
  /** |high − low| of the indicative annual net benefit. */
  swingInr: number;
  /** True when the feasibility state changes at either end. */
  flipsState: boolean;
}

const LABELS: Record<SensitivityKey, { label: string; unit: string }> = {
  freight: { label: "Transport cost per t·km", unit: "₹/t·km" },
  distance: { label: "Transport distance", unit: "km" },
  price: { label: "Material price", unit: "₹/t" },
  processing: { label: "Processing cost", unit: "₹/t" },
  handling: { label: "Avoided handling cost", unit: "₹/t" },
  recovery: { label: "Recovery fraction", unit: "" },
};

/** How far each input moves in a one-at-a-time sensitivity test. */
export const SENSITIVITY_DELTA = 0.25;

/**
 * One-at-a-time sensitivity: move each economic input by ±`delta` (25 % by
 * default), re-run the full engine and record the annual net, score and
 * state. Hard constraints are re-applied, so a move that crosses a transport
 * limit shows up as a state change. Inputs that are unknown are skipped.
 */
export function sensitivity(
  material: Material,
  app: Application,
  assumptions: ScenarioAssumptions,
  weights: ScoreWeights,
  delta = SENSITIVITY_DELTA,
): SensitivityBar[] {
  const base = evaluateMatch(material, app, assumptions, weights);
  const p = base.economics.perTonne;
  const bases: [SensitivityKey, number | null, (v: number) => Partial<ScenarioAssumptions>][] = [
    ["freight", assumptions.transportCostInrPerTonneKm, (v) => ({ transportCostInrPerTonneKm: v })],
    ["distance", base.economics.distanceKm, (v) => ({ distanceKmOverride: v })],
    ["price", p.price, (v) => ({ materialPriceInrPerTonneOverride: v })],
    ["processing", p.processing, (v) => ({ processingCostInrPerTonneOverride: v })],
    ["handling", p.avoidedHandling, (v) => ({ currentHandlingCostInrPerTonneOverride: v })],
    ["recovery", assumptions.recoveryFraction, (v) => ({ recoveryFraction: v })],
  ];

  const point = (input: number, patch: Partial<ScenarioAssumptions>): SensitivityPoint => {
    const r = evaluateMatch(material, app, { ...assumptions, ...patch }, weights);
    return { input, annualNetInr: r.economics.annualNetInr, netPerTonneInr: r.economics.perTonne.net, score: r.score.total, state: r.state };
  };

  const bars: SensitivityBar[] = [];
  for (const [key, value, patch] of bases) {
    if (value === null || value === 0) continue;
    const cap = key === "recovery" ? 1 : Infinity;
    const lo = round(value * (1 - delta), key === "recovery" ? 3 : 2);
    const hi = round(Math.min(cap, value * (1 + delta)), key === "recovery" ? 3 : 2);
    const low = point(lo, patch(lo));
    const high = point(hi, patch(hi));
    bars.push({
      key,
      ...LABELS[key],
      base: value,
      low,
      high,
      swingInr: Math.abs((high.annualNetInr ?? 0) - (low.annualNetInr ?? 0)),
      flipsState: low.state !== base.state || high.state !== base.state,
    });
  }
  return bars.sort((a, b) => Number(b.flipsState) - Number(a.flipsState) || b.swingInr - a.swingInr || a.key.localeCompare(b.key));
}
