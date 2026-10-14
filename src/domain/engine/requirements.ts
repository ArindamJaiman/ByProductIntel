import { PROPERTIES, type PropertyKey } from "../properties";
import { convert, unitLabel } from "../units";
import { canonicalValue } from "../validation";
import type { Material, Measurement, Requirement, VerificationState } from "../types";
import type { Check } from "./result-types";

export interface ResolvedMeasurement {
  property: PropertyKey;
  /** Value in the property's canonical unit. */
  canonical: number;
  source: Measurement;
  derived: boolean;
}

const VERIFICATION_ORDER: VerificationState[] = [
  "unverified",
  "self_declared",
  "lab_reported",
  "independently_verified",
];

export function weakestVerification(states: VerificationState[]): VerificationState {
  return states.reduce<VerificationState>(
    (weakest, s) =>
      VERIFICATION_ORDER.indexOf(s) < VERIFICATION_ORDER.indexOf(weakest) ? s : weakest,
    "independently_verified",
  );
}

/**
 * Index a material's measurements by property, converting to canonical units.
 * The SiO₂+Al₂O₃+Fe₂O₃ sum is derived (and labelled as a calculated estimate
 * carrying the weakest verification of its parts) when all three oxides are
 * measured and the sum itself is not reported. Nothing else is inferred.
 */
export function resolveMeasurements(material: Pick<Material, "measurements">): Map<PropertyKey, ResolvedMeasurement> {
  const map = new Map<PropertyKey, ResolvedMeasurement>();
  for (const m of material.measurements) {
    map.set(m.property, { property: m.property, canonical: canonicalValue(m), source: m, derived: false });
  }
  const parts = (["sio2", "al2o3", "fe2o3"] as const).map((k) => map.get(k));
  if (!map.has("sio2_al2o3_fe2o3") && parts.every(Boolean)) {
    const resolved = parts as ResolvedMeasurement[];
    const sum = Number(resolved.reduce((a, p) => a + p.canonical, 0).toFixed(2));
    map.set("sio2_al2o3_fe2o3", {
      property: "sio2_al2o3_fe2o3",
      canonical: sum,
      derived: true,
      source: {
        property: "sio2_al2o3_fe2o3",
        value: sum,
        unit: "%",
        provenance: "calculated_estimate",
        verification: weakestVerification(resolved.map((p) => p.source.verification)),
        method: "Calculated as SiO₂ + Al₂O₃ + Fe₂O₃ from the reported oxides",
      },
    });
  }
  return map;
}

function fmt(value: number): string {
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return String(Number(value.toPrecision(4)));
}

export function describeRequirement(r: Requirement): string {
  const u = unitLabel(r.unit);
  switch (r.kind) {
    case "min":
      return `≥ ${fmt(r.min!)} ${u}`;
    case "max":
      return `≤ ${fmt(r.max!)} ${u}`;
    case "range":
      return `${fmt(r.min!)}–${fmt(r.max!)} ${u}`;
    case "reported":
      return "Measured value reported";
  }
}

/**
 * Evaluate one specification requirement. A missing measurement yields
 * "unknown" — never a pass, whatever the requirement.
 */
export function checkRequirement(
  r: Requirement,
  measurements: Map<PropertyKey, ResolvedMeasurement>,
): Check {
  const def = PROPERTIES[r.property];
  const base: Check = {
    id: `spec:${r.id}`,
    stage: "specification",
    label: def.label,
    status: "unknown",
    enforcement: r.enforcement,
    safetyCritical: r.safetyCritical,
    observed: null,
    required: describeRequirement(r),
    detail: "",
    basis: r.basis,
    sourceId: r.sourceId,
    requirementId: r.id,
    property: r.property,
  };

  const m = measurements.get(r.property);
  if (!m) {
    return {
      ...base,
      status: "unknown",
      detail: `${def.label} has not been reported. The requirement cannot be assessed and is not assumed to be met.`,
    };
  }

  // Express the observed value in the requirement's unit for display; compare in canonical units.
  const observedInReqUnit = convert(m.canonical, def.canonicalUnit, r.unit);
  const observed = `${fmt(observedInReqUnit)} ${unitLabel(r.unit)}${m.derived ? " (calculated)" : ""}`;
  const withMeta = { ...base, observed, provenance: m.source.provenance, verification: m.source.verification };

  if (r.kind === "reported") {
    return { ...withMeta, status: "pass", detail: `${def.label} is reported. No numeric threshold is applied by this rule.` };
  }

  // Only the bounds relevant to the requirement kind are applied.
  const usesMin = r.kind === "min" || r.kind === "range";
  const usesMax = r.kind === "max" || r.kind === "range";
  const min = usesMin && r.min !== undefined ? convert(r.min, r.unit, def.canonicalUnit) : undefined;
  const max = usesMax && r.max !== undefined ? convert(r.max, r.unit, def.canonicalUnit) : undefined;
  const belowMin = min !== undefined && m.canonical < min;
  const aboveMax = max !== undefined && m.canonical > max;

  if (belowMin || aboveMax) {
    return {
      ...withMeta,
      status: "fail",
      detail: `${def.label} of ${observed} is ${belowMin ? "below the minimum" : "above the maximum"} (${base.required}).`,
    };
  }
  return { ...withMeta, status: "pass", detail: `${def.label} of ${observed} meets ${base.required}.` };
}
