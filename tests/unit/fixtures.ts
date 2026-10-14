import type { Application, Material, Scenario } from "@/domain/types";
import { DEFAULT_ASSUMPTIONS } from "@/domain/scoring-config";

/** Minimal, fully controlled fixtures — independent of the demo seed. */
export function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-test",
    code: "TEST-001",
    name: "Test slag",
    family: "steel_slag_bof",
    sourceProcess: "Test process",
    description: "",
    organisationId: "org-test",
    dataOrigin: "user_supplied",
    location: { site: "A", region: "R", country: "India", lat: 23.0, lon: 87.0 },
    volume: { tonnesPerYear: 100000, reportingPeriod: "2026", provenance: "user_supplied" },
    hazard: { status: "declared_non_hazardous", verification: "lab_reported" },
    currentHandling: { pathway: "Stockpile", kind: "disposal_or_stockpile", costInrPerTonne: 100, provenance: "user_supplied" },
    measurements: [
      { property: "free_cao", value: 2, unit: "%", provenance: "user_supplied", verification: "lab_reported" },
      { property: "volumetric_expansion", value: 1, unit: "pct", provenance: "user_supplied", verification: "lab_reported" },
    ],
    documents: [
      { id: "d1", type: "leaching_test_report", title: "Leach", status: "available_verified", provenance: "user_supplied" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-test",
    code: "APP-T",
    name: "Test application",
    industry: "Test",
    description: "",
    specStatus: "demo_assumption",
    acceptedFamilies: ["steel_slag_bof"],
    excludesDeclaredHazardous: true,
    requirements: [
      {
        id: "r-freecao",
        property: "free_cao",
        kind: "max",
        max: 4,
        unit: "%",
        enforcement: "hard",
        safetyCritical: false,
        rationale: "test",
        basis: "demo_assumption",
      },
      {
        id: "r-exp",
        property: "volumetric_expansion",
        kind: "max",
        max: 3,
        unit: "pct",
        enforcement: "soft",
        safetyCritical: false,
        rationale: "test",
        basis: "demo_assumption",
      },
    ],
    evidenceRequirements: [
      {
        id: "e-leach",
        docType: "leaching_test_report",
        label: "Leaching test report",
        enforcement: "hard",
        safetyCritical: true,
        why: "test",
        reviewer: "regulatory",
        basis: "demo_assumption",
      },
    ],
    demand: { minTonnesPerYear: 10000, maxTonnesPerYear: 200000, provenance: "synthetic_demo" },
    // ~1 degree of latitude north of the material ≈ 111 km great-circle.
    demandSites: [{ id: "s1", label: "Site", region: "R", lat: 24.0, lon: 87.0 }],
    logistics: { maxTransportKm: 300, mode: "road", basis: "demo_assumption" },
    economics: { indicativePriceInrPerTonne: 800, processingCostInrPerTonne: 100, provenance: "synthetic_demo" },
    processingSteps: [],
    circularity: { tier: "material_substitution", substitutes: "x", rationale: "x" },
    requiresRegulatoryReview: false,
    sourceIds: [],
    rulesetVersion: "test-r1",
    reviewStatus: "demo_unreviewed",
    ...overrides,
  };
}

export function scenario(overrides: Partial<Scenario["defaults"]> = {}, perApplication: Scenario["perApplication"] = {}): Scenario {
  return { label: "test", defaults: { ...DEFAULT_ASSUMPTIONS, ...overrides }, perApplication };
}
