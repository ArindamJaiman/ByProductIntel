import { z } from "zod";
import { CLOSURE_OXIDES, PROPERTIES, isPropertyKey, type PropertyKey } from "./properties";
import { UNIT_IDS, convert, getUnit, isUnitId, type UnitId } from "./units";
import type { Application, Material, Measurement } from "./types";

/* -------------------------------------------------------------------------- */
/* Zod schemas (structural validation of untrusted input)                     */
/* -------------------------------------------------------------------------- */

const provenance = z.enum([
  "verified_source",
  "user_supplied",
  "synthetic_demo",
  "calculated_estimate",
  "hypothesis",
]);
const verification = z.enum(["unverified", "self_declared", "lab_reported", "independently_verified"]);
const unit = z.enum(UNIT_IDS as [UnitId, ...UnitId[]]);
const family = z.enum([
  "steel_slag_bof",
  "steel_slag_eaf",
  "blast_furnace_slag_granulated",
  "fly_ash",
  "foundry_sand",
  "mill_scale",
]);
const finite = z.number().refine(Number.isFinite, "Must be a finite number");

export const measurementSchema = z.object({
  property: z.string().refine(isPropertyKey, "Unknown property"),
  value: finite,
  unit,
  provenance,
  verification,
  method: z.string().max(200).optional(),
  documentId: z.string().max(80).optional(),
  note: z.string().max(500).optional(),
});

export const documentSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum([
    "chemical_composition_report",
    "leaching_test_report",
    "volumetric_stability_test",
    "strength_activity_test",
    "heavy_metals_analysis",
    "hazard_classification",
    "particle_size_analysis",
    "product_conformity_certificate",
    "oil_grease_analysis",
  ]),
  title: z.string().trim().min(1, "Give the document a title").max(200),
  status: z.enum(["available_unverified", "available_verified", "requested"]),
  issuedBy: z.string().max(200).optional(),
  date: z.string().max(40).optional(),
  provenance,
  note: z.string().max(500).optional(),
});

/** Schema for the user-editable part of a material profile. */
export const materialInputSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(140),
  family,
  sourceProcess: z.string().trim().min(3, "Describe the source process").max(200),
  description: z.string().trim().max(1000).default(""),
  location: z.object({
    site: z.string().trim().min(2, "Site is required").max(140),
    region: z.string().trim().min(2, "Region is required").max(140),
    country: z.string().trim().min(2).max(80),
    lat: finite.min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90"),
    lon: finite.min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180"),
  }),
  volume: z.object({
    tonnesPerYear: finite.positive("Volume must be greater than zero").nullable(),
    reportingPeriod: z.string().trim().min(2, "Reporting period is required").max(60),
    provenance,
  }),
  hazard: z.object({
    status: z.enum(["declared_non_hazardous", "declared_hazardous", "not_declared"]),
    basis: z.string().max(300).optional(),
    verification,
  }),
  currentHandling: z.object({
    pathway: z.string().trim().min(2, "Describe the current handling pathway").max(200),
    kind: z.enum(["disposal_or_stockpile", "existing_use", "unknown"]),
    costInrPerTonne: finite.min(0, "Cost cannot be negative").nullable(),
    provenance,
  }),
  measurements: z.array(measurementSchema).max(80),
  documents: z.array(documentSchema).max(40),
});

export type MaterialInput = z.infer<typeof materialInputSchema>;

/* -------------------------------------------------------------------------- */
/* Domain validation (Stage 1 of the engine)                                  */
/* -------------------------------------------------------------------------- */

export interface ValidationIssue {
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/** Canonical value of a measurement; throws on unit mismatch. */
export function canonicalValue(m: Pick<Measurement, "property" | "value" | "unit">): number {
  const def = PROPERTIES[m.property];
  return convert(m.value, m.unit, def.canonicalUnit);
}

/** Units that may be used for a given property. */
export function unitsForProperty(property: PropertyKey): UnitId[] {
  const dim = PROPERTIES[property].dimension;
  return UNIT_IDS.filter((u) => getUnit(u).dimension === dim);
}

const COMPOSITION_TOLERANCE_PCT = 0.5;
const SUM_CONSISTENCY_TOLERANCE_PCT = 1.0;

/**
 * Validate a material profile's measurements for unit correctness, numeric
 * plausibility, duplicates and composition consistency. Missing measurements
 * are NOT errors here — absence is handled by the engine as "unknown".
 */
export function validateMaterial(material: Pick<Material, "measurements" | "documents" | "volume">): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const canonical = new Map<PropertyKey, number>();
  const docIds = new Set(material.documents.map((d) => d.id));

  material.measurements.forEach((m, i) => {
    const path = `measurements[${i}]`;
    if (!isPropertyKey(m.property)) {
      issues.push({ path, message: `Unknown property "${m.property}"`, severity: "error" });
      return;
    }
    const def = PROPERTIES[m.property];
    if (!Number.isFinite(m.value)) {
      issues.push({ path, message: `${def.label}: value must be a finite number`, severity: "error" });
      return;
    }
    if (!isUnitId(m.unit) || getUnit(m.unit).dimension !== def.dimension) {
      issues.push({
        path,
        message: `${def.label}: unit "${m.unit}" is not valid for this property (expected one of ${unitsForProperty(m.property).join(", ")})`,
        severity: "error",
      });
      return;
    }
    if (seen.has(m.property)) {
      issues.push({ path, message: `${def.label} is reported more than once`, severity: "error" });
      return;
    }
    seen.add(m.property);
    const v = canonicalValue(m);
    if (v < def.range.min || v > def.range.max) {
      issues.push({
        path,
        message: `${def.label}: ${v} ${def.canonicalUnit} is outside the plausible range ${def.range.min}–${def.range.max}`,
        severity: "error",
      });
      return;
    }
    if (m.documentId && !docIds.has(m.documentId)) {
      issues.push({ path, message: `${def.label}: referenced document "${m.documentId}" does not exist`, severity: "error" });
    }
    canonical.set(m.property, v);
  });

  // Composition closure: listed oxides cannot sum above 100 %.
  const closure = CLOSURE_OXIDES.reduce((sum, k) => sum + (canonical.get(k) ?? 0), 0);
  if (closure > 100 + COMPOSITION_TOLERANCE_PCT) {
    issues.push({
      path: "measurements",
      message: `Major oxides sum to ${closure.toFixed(1)} %, which exceeds 100 %. Check units and values.`,
      severity: "error",
    });
  }

  // Reported oxide sum should agree with its components when all are present.
  const parts = (["sio2", "al2o3", "fe2o3"] as const).map((k) => canonical.get(k));
  const reportedSum = canonical.get("sio2_al2o3_fe2o3");
  if (reportedSum !== undefined && parts.every((p) => p !== undefined)) {
    const calc = (parts as number[]).reduce((a, b) => a + b, 0);
    if (Math.abs(calc - reportedSum) > SUM_CONSISTENCY_TOLERANCE_PCT) {
      issues.push({
        path: "measurements",
        message: `Reported SiO₂+Al₂O₃+Fe₂O₃ (${reportedSum} %) differs from the sum of the individual oxides (${calc.toFixed(1)} %).`,
        severity: "warning",
      });
    }
  }

  // Free lime cannot exceed total CaO.
  const freeCao = canonical.get("free_cao");
  const cao = canonical.get("cao");
  if (freeCao !== undefined && cao !== undefined && freeCao > cao) {
    issues.push({ path: "measurements", message: "Free CaO cannot exceed total CaO.", severity: "error" });
  }

  if (material.volume.tonnesPerYear !== null && !(material.volume.tonnesPerYear > 0)) {
    issues.push({ path: "volume.tonnesPerYear", message: "Volume must be greater than zero or left unreported.", severity: "error" });
  }

  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

/** Validate that an application's rules are internally consistent. */
export function validateApplication(app: Application): ValidationResult {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  app.requirements.forEach((r, i) => {
    const path = `requirements[${i}]`;
    if (ids.has(r.id)) issues.push({ path, message: `Duplicate requirement id ${r.id}`, severity: "error" });
    ids.add(r.id);
    const def = PROPERTIES[r.property];
    if (!def) {
      issues.push({ path, message: `Unknown property ${r.property}`, severity: "error" });
      return;
    }
    if (!isUnitId(r.unit) || getUnit(r.unit).dimension !== def.dimension) {
      issues.push({ path, message: `Unit ${r.unit} incompatible with ${def.label}`, severity: "error" });
    }
    if ((r.kind === "min" || r.kind === "range") && !Number.isFinite(r.min)) {
      issues.push({ path, message: `${r.id}: a ${r.kind} requirement needs a numeric minimum`, severity: "error" });
    }
    if ((r.kind === "max" || r.kind === "range") && !Number.isFinite(r.max)) {
      issues.push({ path, message: `${r.id}: a ${r.kind} requirement needs a numeric maximum`, severity: "error" });
    }
    if (r.kind === "range" && r.min! > r.max!) {
      issues.push({ path, message: `${r.id}: minimum exceeds maximum`, severity: "error" });
    }
    if (r.basis === "source_referenced" && !r.sourceId) {
      issues.push({ path, message: `${r.id}: a source-referenced rule must cite a source`, severity: "error" });
    }
  });
  if (app.demand.minTonnesPerYear > app.demand.maxTonnesPerYear) {
    issues.push({ path: "demand", message: "Minimum demand exceeds maximum demand", severity: "error" });
  }
  if (app.demandSites.length === 0) {
    issues.push({ path: "demandSites", message: "At least one demand site is required", severity: "error" });
  }
  return { valid: !issues.some((i) => i.severity === "error"), issues };
}
