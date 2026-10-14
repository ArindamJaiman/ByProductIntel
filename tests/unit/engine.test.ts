import { describe, expect, it } from "vitest";
import { evaluateMatch, InvalidMaterialError } from "@/domain/engine/evaluate";
import { checkRequirement, resolveMeasurements } from "@/domain/engine/requirements";
import { resolveAssumptions } from "@/domain/engine/economics";
import { DEFAULT_ASSUMPTIONS, DEFAULT_WEIGHTS } from "@/domain/scoring-config";
import type { Requirement } from "@/domain/types";
import { application, material } from "./fixtures";

const A = DEFAULT_ASSUMPTIONS;
const req = (r: Partial<Requirement>): Requirement => ({
  id: "r",
  property: "loi",
  kind: "max",
  max: 6,
  unit: "%",
  enforcement: "hard",
  safetyCritical: false,
  rationale: "",
  basis: "demo_assumption",
  ...r,
});

describe("requirement checks", () => {
  const ms = resolveMeasurements(
    material({
      measurements: [
        { property: "loi", value: 5, unit: "%", provenance: "user_supplied", verification: "lab_reported" },
        { property: "chromium_total", value: 1450, unit: "mg/kg", provenance: "user_supplied", verification: "lab_reported" },
        { property: "glass_content", value: 85, unit: "pct", provenance: "user_supplied", verification: "lab_reported" },
      ],
    }),
  );

  it("passes and fails maximum thresholds, inclusive at the boundary", () => {
    expect(checkRequirement(req({ max: 6 }), ms).status).toBe("pass");
    expect(checkRequirement(req({ max: 5 }), ms).status).toBe("pass");
    expect(checkRequirement(req({ max: 4.9 }), ms).status).toBe("fail");
  });

  it("handles minimum thresholds and intervals", () => {
    expect(checkRequirement(req({ property: "glass_content", kind: "min", min: 85, unit: "pct" }), ms).status).toBe("pass");
    expect(checkRequirement(req({ property: "glass_content", kind: "min", min: 90, unit: "pct" }), ms).status).toBe("fail");
    expect(checkRequirement(req({ kind: "range", min: 1, max: 6 }), ms).status).toBe("pass");
    expect(checkRequirement(req({ kind: "range", min: 6, max: 9 }), ms).status).toBe("fail");
  });

  it("converts requirement units before comparing", () => {
    // 1450 mg/kg = 0.145 %
    const pass = checkRequirement(req({ property: "chromium_total", kind: "max", max: 0.2, unit: "%" }), ms);
    const fail = checkRequirement(req({ property: "chromium_total", kind: "max", max: 1000, unit: "mg/kg" }), ms);
    expect(pass.status).toBe("pass");
    expect(fail.status).toBe("fail");
    expect(fail.observed).toBe("1,450 mg/kg");
  });

  it("treats a missing measurement as unknown, never as a pass", () => {
    for (const kind of ["min", "max", "range", "reported"] as const) {
      const c = checkRequirement(req({ property: "moisture", kind, min: 0, max: 100 }), ms);
      expect(c.status).toBe("unknown");
      expect(c.observed).toBeNull();
    }
  });

  it("'reported' requirements pass only when the value is present", () => {
    expect(checkRequirement(req({ property: "chromium_total", kind: "reported", unit: "mg/kg" }), ms).status).toBe("pass");
    expect(checkRequirement(req({ property: "lead_total", kind: "reported", unit: "mg/kg" }), ms).status).toBe("unknown");
  });

  it("derives the oxide sum only when all parts exist, labelled as calculated", () => {
    const u = { unit: "%", provenance: "user_supplied", verification: "independently_verified" } as const;
    const full = resolveMeasurements(
      material({
        measurements: [
          { property: "sio2", value: 50, ...u },
          { property: "al2o3", value: 20, ...u, verification: "self_declared" },
          { property: "fe2o3", value: 5, ...u },
        ],
      }),
    );
    const sum = full.get("sio2_al2o3_fe2o3")!;
    expect(sum.canonical).toBe(75);
    expect(sum.derived).toBe(true);
    expect(sum.source.provenance).toBe("calculated_estimate");
    expect(sum.source.verification).toBe("self_declared");

    const partial = resolveMeasurements(
      material({ measurements: [{ property: "sio2", value: 50, ...u }, { property: "al2o3", value: 20, ...u }] }),
    );
    expect(partial.has("sio2_al2o3_fe2o3")).toBe(false);
  });
});

describe("eligibility state machine", () => {
  it("is potentially eligible when every hard rule passes and evidence is present", () => {
    const r = evaluateMatch(material(), application(), A);
    expect(r.state).toBe("potentially_eligible");
    expect(r.headline).toBe("Potentially eligible — subject to technical review");
    expect(r.score.status).toBe("scored");
  });

  it("is ineligible when a hard technical threshold fails", () => {
    const m = material();
    m.measurements[0] = { ...m.measurements[0], value: 6 }; // free CaO 6 % > 4 % hard max
    const r = evaluateMatch(m, application(), A);
    expect(r.state).toBe("ineligible");
    expect(r.score.status).toBe("not_ranked");
    expect(r.score.total).toBeNull();
  });

  it("does not let a soft failure make a candidate ineligible", () => {
    const m = material();
    m.measurements[1] = { ...m.measurements[1], value: 5 }; // expansion 5 > soft 3
    const r = evaluateMatch(m, application(), A);
    expect(r.state).toBe("potentially_eligible");
    expect(r.technical.failed).toBe(1);
  });

  it("missing safety-critical evidence gives incomplete evidence, not a pass", () => {
    const r = evaluateMatch(material({ documents: [] }), application(), A);
    expect(r.state).toBe("incomplete_evidence");
    expect(r.headline).toBe("Promising candidate — technical review required");
    const leach = r.checks.find((c) => c.id === "evidence:e-leach")!;
    expect(leach.status).toBe("unknown");
    expect(leach.safetyCritical).toBe(true);
  });

  it("an unknown safety-critical rule blocks even when its enforcement is soft", () => {
    const app = application();
    app.requirements.push({ ...app.requirements[1], id: "r-cr", property: "chromium_total", kind: "reported", unit: "mg/kg", enforcement: "soft", safetyCritical: true });
    expect(evaluateMatch(material(), app, A).state).toBe("incomplete_evidence");
  });

  it("an undeclared hazard status is unknown and blocks; a declared hazard is excluded", () => {
    const undeclared = evaluateMatch(material({ hazard: { status: "not_declared", verification: "unverified" } }), application(), A);
    expect(undeclared.state).toBe("incomplete_evidence");
    expect(undeclared.checks.find((c) => c.id === "hazard")!.status).toBe("unknown");

    const hazardous = evaluateMatch(material({ hazard: { status: "declared_hazardous", verification: "lab_reported" } }), application(), A);
    expect(hazardous.state).toBe("ineligible");
  });

  it("excludes materials outside the application's family scope", () => {
    const r = evaluateMatch(material({ family: "fly_ash" }), application(), A);
    expect(r.state).toBe("ineligible");
    expect(r.checks.find((c) => c.id === "identity")!.status).toBe("fail");
  });

  it("treats an application without a validated specification as incomplete", () => {
    const r = evaluateMatch(material(), application({ requirements: [], specStatus: "specification_not_established" }), A);
    expect(r.state).toBe("incomplete_evidence");
    expect(r.score.status).toBe("insufficient_data");
    expect(r.bridge.some((b) => b.category === "specification" && b.blocking)).toBe(true);
  });

  it("fails the transport constraint beyond the maximum distance", () => {
    const r = evaluateMatch(material(), application(), { ...A, distanceKmOverride: 301 });
    expect(r.state).toBe("ineligible");
    expect(r.checks.find((c) => c.id === "logistics")!.status).toBe("fail");
  });

  it("fails the volume constraint below minimum offtake and blocks on unreported volume", () => {
    expect(evaluateMatch(material(), application(), { ...A, tonnesOfferedOverride: 5000 }).state).toBe("ineligible");
    const unreported = evaluateMatch(
      material({ volume: { tonnesPerYear: null, reportingPeriod: "n/a", provenance: "user_supplied" } }),
      application(),
      A,
    );
    expect(unreported.state).toBe("incomplete_evidence");
    expect(unreported.score.status).toBe("insufficient_data");
  });

  it("rejects invalid material data before evaluating", () => {
    const bad = material({ measurements: [{ property: "loi", value: -5, unit: "%", provenance: "user_supplied", verification: "unverified" }] });
    expect(() => evaluateMatch(bad, application(), A)).toThrow(InvalidMaterialError);
  });

  it("never emits an approved state", () => {
    const r = evaluateMatch(material(), application(), A);
    expect(["potentially_eligible", "incomplete_evidence", "ineligible"]).toContain(r.state);
    expect(JSON.stringify(r)).not.toMatch(/"state":"approved/);
  });
});

describe("scoring", () => {
  it("reproduces the documented weighted sum exactly", () => {
    const r = evaluateMatch(material(), application(), A);
    const sum = r.score.components.reduce((s, c) => s + (c.value ?? 0) * c.weight * 100, 0);
    expect(r.score.total).toBe(Number(sum.toFixed(1)));
    expect(r.score.components.map((c) => c.key)).toEqual(["technical", "economic", "logistics", "volume", "circularity", "evidence"]);
    expect(r.score.components.find((c) => c.key === "technical")!.weight).toBe(0.4);
  });

  it("computes each component from its documented formula", () => {
    const r = evaluateMatch(material(), application(), { ...A, distanceKmOverride: 100 });
    const byKey = Object.fromEntries(r.score.components.map((c) => [c.key, c.value]));
    // technical: 2/2 pass
    expect(byKey.technical).toBe(1);
    // net = 800 + 100 − 100×4.5 − 100 = 350 → (350+500)/1500
    expect(r.economics.perTonne.net).toBe(350);
    expect(byKey.economic).toBeCloseTo(850 / 1500, 4);
    // logistics = 1 − 100/300
    expect(byKey.logistics).toBeCloseTo(2 / 3, 4);
    // volume: accepted = min(100000×0.9, 200000) = 90000; placement 1; fill 0.45 → 0.725
    expect(byKey.volume).toBeCloseTo(0.725, 4);
    expect(byKey.circularity).toBe(0.7);
    // evidence: 2 spec + 1 doc, all available
    expect(byKey.evidence).toBe(1);
  });

  it("changing weights changes the total but not the component values", () => {
    const a = evaluateMatch(material(), application(), A);
    const b = evaluateMatch(material(), application(), A, { ...DEFAULT_WEIGHTS, technical: 0.1, economic: 0.5 });
    expect(b.score.total).not.toBe(a.score.total);
    expect(b.score.components.map((c) => c.value)).toEqual(a.score.components.map((c) => c.value));
  });

  it("does not let a high aggregate hide a hard failure", () => {
    const m = material();
    m.measurements[0] = { ...m.measurements[0], value: 4.01 };
    const r = evaluateMatch(m, application(), { ...A, distanceKmOverride: 1 });
    expect(r.state).toBe("ineligible");
    expect(r.score.total).toBeNull();
    expect(r.score.components.find((c) => c.key === "economic")!.value).toBeGreaterThan(0.8);
  });

  it("shows insufficient data instead of a number when technical coverage is too low", () => {
    const app = application();
    app.requirements.push(
      { ...app.requirements[1], id: "r3", property: "water_absorption" },
      { ...app.requirements[1], id: "r4", property: "la_abrasion" },
    ); // 2 of 4 measured = 50 % < 60 %
    const r = evaluateMatch(material(), app, A);
    expect(r.score.status).toBe("insufficient_data");
    expect(r.score.total).toBeNull();
    expect(r.score.components.find((c) => c.key === "technical")!.value).toBeNull();
  });

  it("keeps score and confidence separate", () => {
    const strong = evaluateMatch(material(), application(), A);
    const synthetic = evaluateMatch(material({ dataOrigin: "synthetic_demo" }), application(), A);
    expect(synthetic.score.total).toBe(strong.score.total);
    expect(strong.score.confidence).toBe("high");
    expect(synthetic.score.confidence).toBe("medium");
  });
});

describe("economics and transport scenarios", () => {
  it("transport cost scales linearly with distance and can turn the net negative", () => {
    const near = evaluateMatch(material(), application(), { ...A, distanceKmOverride: 50 });
    const far = evaluateMatch(material(), application(), { ...A, distanceKmOverride: 290 });
    expect(far.economics.perTonne.transport! - near.economics.perTonne.transport!).toBe(240 * 4.5);
    expect(near.economics.perTonne.net).toBeGreaterThan(0);
    expect(far.economics.perTonne.net).toBeLessThan(0);
    expect(far.score.total!).toBeLessThan(near.score.total!);
  });

  it("uses great-circle distance × circuity when no override is given", () => {
    const r = evaluateMatch(material(), application(), A);
    expect(r.economics.distanceBasis).toBe("great_circle_x_factor");
    expect(r.economics.greatCircleKm).toBeCloseTo(111.2, 0);
    expect(r.economics.distanceKm).toBeCloseTo(r.economics.greatCircleKm * 1.3, 0);
  });

  it("marks economics incomplete when the price is missing rather than inventing one", () => {
    const app = application({ economics: { indicativePriceInrPerTonne: null, processingCostInrPerTonne: 100, provenance: "synthetic_demo" } });
    const r = evaluateMatch(material(), app, A);
    expect(r.economics.status).toBe("incomplete");
    expect(r.economics.perTonne.net).toBeNull();
    expect(r.economics.annualNetInr).toBeNull();
    expect(r.score.status).toBe("insufficient_data");
    expect(r.bridge.some((b) => b.category === "economic_input")).toBe(true);
  });

  it("does not credit avoided handling cost for an existing use", () => {
    const r = evaluateMatch(
      material({ currentHandling: { pathway: "Sold", kind: "existing_use", costInrPerTonne: 500, provenance: "user_supplied" } }),
      application(),
      A,
    );
    expect(r.economics.perTonne.avoidedHandling).toBe(0);
  });

  it("caps accepted tonnes at the recipient's maximum demand", () => {
    const r = evaluateMatch(material(), application(), { ...A, tonnesOfferedOverride: 1_000_000 });
    expect(r.economics.acceptedTonnes).toBe(200000);
  });

  it("validates scenario assumptions", () => {
    expect(() => resolveAssumptions(A, { recoveryFraction: 0 })).toThrow(RangeError);
    expect(() => resolveAssumptions(A, { recoveryFraction: 1.2 })).toThrow(RangeError);
    expect(() => resolveAssumptions(A, { distanceKmOverride: -5 })).toThrow(RangeError);
    expect(() => resolveAssumptions(A, { roadCircuityFactor: 0.5 })).toThrow(RangeError);
  });
});

describe("environmental boundaries", () => {
  it("estimates diversion only for disposal or stockpile pathways, as a labelled scenario", () => {
    const r = evaluateMatch(material(), application(), A);
    expect(r.environment.diversion.status).toBe("scenario_estimate");
    expect(r.environment.diversion.tonnes).toBe(r.economics.acceptedTonnes);
  });

  it("does not claim diversion for an existing use or unknown pathway", () => {
    for (const kind of ["existing_use", "unknown"] as const) {
      const r = evaluateMatch(
        material({ currentHandling: { pathway: "x", kind, costInrPerTonne: null, provenance: "user_supplied" } }),
        application(),
        A,
      );
      expect(r.environment.diversion.status).toBe("not_applicable");
      expect(r.environment.diversion.tonnes).toBeNull();
    }
  });

  it("never produces a numeric greenhouse-gas claim", () => {
    const r = evaluateMatch(material(), application(), A);
    expect(r.environment.ghg.status).toBe("not_estimated");
    expect(Object.keys(r.environment.ghg)).not.toContain("tonnesCo2e");
  });

  it("reports transport activity in tonne-km from accepted tonnes and distance", () => {
    const r = evaluateMatch(material(), application(), { ...A, distanceKmOverride: 100 });
    expect(r.environment.transportActivityTonneKm).toBe(90000 * 100);
  });
});
