import {
  CIRCULARITY_TIER_LABEL,
  CIRCULARITY_TIER_VALUE,
  COMPONENT_LABELS,
  ECONOMIC_ANCHORS_INR_PER_T,
  MIN_TECHNICAL_COVERAGE,
  type ScoreComponentKey,
  type ScoreWeights,
} from "../scoring-config";
import { lowerFirst } from "../labels";
import type { Application, Material } from "../types";
import type {
  Check,
  Confidence,
  EconomicsResult,
  MatchState,
  ScoreComponent,
  ScoreResult,
  TechnicalSummary,
} from "./result-types";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const pct = (v: number) => `${Math.round(v * 100)} %`;

export function summariseTechnical(checks: Check[]): TechnicalSummary {
  const spec = checks.filter((c) => c.stage === "specification" && c.requirementId);
  const passed = spec.filter((c) => c.status === "pass").length;
  const failed = spec.filter((c) => c.status === "fail").length;
  const unknown = spec.filter((c) => c.status === "unknown").length;
  return { total: spec.length, passed, failed, unknown, coverage: spec.length ? (passed + failed) / spec.length : 0 };
}

interface ComponentInput {
  material: Material;
  app: Application;
  checks: Check[];
  technical: TechnicalSummary;
  econ: EconomicsResult;
}

function technicalComponent({ technical }: ComponentInput): Pick<ScoreComponent, "value" | "explanation"> {
  if (technical.total === 0) {
    return { value: null, explanation: "The application has no validated acceptance specification, so technical fit cannot be scored." };
  }
  const known = technical.passed + technical.failed;
  if (technical.coverage < MIN_TECHNICAL_COVERAGE) {
    return {
      value: null,
      explanation: `Only ${known} of ${technical.total} specification properties are measured (${pct(technical.coverage)}); at least ${pct(MIN_TECHNICAL_COVERAGE)} is needed for a defensible technical score.`,
    };
  }
  return {
    value: technical.passed / known,
    explanation: `${technical.passed} of ${known} measured requirements pass. ${technical.unknown} unmeasured requirement(s) are excluded from this ratio and reduce evidence completeness and confidence instead.`,
  };
}

function economicComponent({ econ }: ComponentInput): Pick<ScoreComponent, "value" | "explanation"> {
  const net = econ.perTonne.net;
  if (econ.status !== "complete" || net === null) {
    return { value: null, explanation: `Missing input: ${econ.missingInputs.join(", ")}.` };
  }
  const { floor, ceiling } = ECONOMIC_ANCHORS_INR_PER_T;
  return {
    value: clamp01((net - floor) / (ceiling - floor)),
    explanation: `Net indicative benefit of ₹${net}/t mapped linearly between ₹${floor}/t (0) and ₹${ceiling}/t (1).`,
  };
}

function logisticsComponent({ app, econ }: ComponentInput): Pick<ScoreComponent, "value" | "explanation"> {
  if (econ.distanceKm === null) return { value: null, explanation: "Distance unavailable." };
  const max = app.logistics.maxTransportKm;
  return {
    value: clamp01(1 - econ.distanceKm / max),
    explanation: `1 − ${econ.distanceKm} km ÷ ${max} km maximum transport distance.`,
  };
}

function volumeComponent({ app, econ }: ComponentInput): Pick<ScoreComponent, "value" | "explanation"> {
  if (econ.offeredTonnes === null || econ.acceptedTonnes === null) {
    return { value: null, explanation: "Available volume is not reported." };
  }
  const recoverable = econ.offeredTonnes * econ.assumptions.recoveryFraction;
  const placement = recoverable > 0 ? clamp01(econ.acceptedTonnes / recoverable) : 0;
  const fill = clamp01(econ.acceptedTonnes / app.demand.maxTonnesPerYear);
  return {
    value: 0.5 * placement + 0.5 * fill,
    explanation: `Average of the share of recoverable material the recipient can absorb (${pct(placement)}) and the share of the recipient's maximum demand it fills (${pct(fill)}).`,
  };
}

function circularityComponent({ app }: ComponentInput): Pick<ScoreComponent, "value" | "explanation"> {
  return {
    value: CIRCULARITY_TIER_VALUE[app.circularity.tier],
    explanation: `Ordinal tier: ${CIRCULARITY_TIER_LABEL[app.circularity.tier]}. Not an emissions estimate.`,
  };
}

function evidenceComponent({ checks }: ComponentInput): Pick<ScoreComponent, "value" | "explanation"> {
  const items = checks.filter((c) => (c.stage === "specification" && c.requirementId) || c.stage === "evidence");
  if (items.length === 0) return { value: 0, explanation: "No evidence requirements are defined, so completeness is 0." };
  const satisfied = items.filter((c) => c.status !== "unknown").length;
  return {
    value: satisfied / items.length,
    explanation: `${satisfied} of ${items.length} required measurements and documents are available (regardless of whether they pass).`,
  };
}

const COMPONENT_FNS: Record<ScoreComponentKey, (i: ComponentInput) => Pick<ScoreComponent, "value" | "explanation">> = {
  technical: technicalComponent,
  economic: economicComponent,
  logistics: logisticsComponent,
  volume: volumeComponent,
  circularity: circularityComponent,
  evidence: evidenceComponent,
};

function confidence(input: ComponentInput): { level: Confidence; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;
  const { technical, checks, material } = input;

  if (technical.total > 0 && technical.coverage === 1) {
    points++;
    reasons.push("All specification properties are measured.");
  } else {
    reasons.push(`${technical.unknown} specification propert${technical.unknown === 1 ? "y is" : "ies are"} unmeasured.`);
  }

  const measured = checks.filter((c) => c.stage === "specification" && c.verification);
  const strong = measured.filter((c) => c.verification === "lab_reported" || c.verification === "independently_verified");
  if (measured.length > 0 && strong.length / measured.length >= 0.8) {
    points++;
    reasons.push("At least 80 % of the measured values are laboratory-reported or independently verified.");
  } else {
    reasons.push(
      measured.length === 0
        ? "No specification values are measured."
        : `${strong.length} of ${measured.length} measured values are laboratory-reported or independently verified (80 % needed for this criterion).`,
    );
  }

  const docs = checks.filter((c) => c.stage === "evidence");
  if (docs.length > 0 && docs.every((d) => d.verification === "independently_verified")) {
    points++;
    reasons.push("All required documents are independently verified.");
  } else if (docs.length > 0) {
    reasons.push("Not every required document is available and independently verified.");
  }

  let level: Confidence = points >= 3 ? "high" : points >= 1 && technical.coverage >= MIN_TECHNICAL_COVERAGE ? "medium" : "low";
  if (material.dataOrigin === "synthetic_demo" && level === "high") {
    level = "medium";
    reasons.push("Capped at medium because the profile contains synthetic demonstration data.");
  } else if (material.dataOrigin === "synthetic_demo") {
    reasons.push("The profile contains synthetic demonstration data.");
  }
  return { level, reasons };
}

/**
 * Weighted score. Hard constraints are evaluated before and outside this
 * function: an ineligible candidate is never given a total. A total is only
 * produced when every component can be computed — missing components are not
 * re-weighted away.
 */
export function computeScore(input: ComponentInput, state: MatchState, weights: ScoreWeights): ScoreResult {
  const components: ScoreComponent[] = (Object.keys(COMPONENT_FNS) as ScoreComponentKey[]).map((key) => {
    const { value, explanation } = COMPONENT_FNS[key](input);
    const weight = weights[key];
    return {
      key,
      label: COMPONENT_LABELS[key],
      weight,
      value: value === null ? null : Number(value.toFixed(4)),
      points: value === null ? null : Number((value * weight * 100).toFixed(2)),
      explanation,
    };
  });
  const conf = confidence(input);
  const base = { components, confidence: conf.level, confidenceReasons: conf.reasons, weights };

  if (state === "ineligible") {
    return { ...base, status: "not_ranked", total: null, reason: "Not ranked: one or more hard constraints fail. Component values are shown for transparency only." };
  }
  const missing = components.filter((c) => c.value === null);
  if (missing.length > 0) {
    return {
      ...base,
      status: "insufficient_data",
      total: null,
      reason: `Insufficient data for a numeric score: ${missing.map((c) => lowerFirst(c.label)).join(", ")} cannot be computed.`,
    };
  }
  const total = Number(components.reduce((s, c) => s + (c.points ?? 0), 0).toFixed(1));
  return state === "potentially_eligible"
    ? { ...base, status: "scored", total, reason: "All hard constraints pass on the available data; score is subject to technical review." }
    : { ...base, status: "provisional", total, reason: "Provisional: hard or safety-critical evidence is still missing, so this score may change or the candidate may become ineligible." };
}
