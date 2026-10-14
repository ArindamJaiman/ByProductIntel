import { describe, expect, it } from "vitest";
import { evaluateMatch } from "@/domain/engine/evaluate";
import { rankResults, runMatching } from "@/domain/engine/run";
import { DEFAULT_ASSUMPTIONS, normaliseWeights } from "@/domain/scoring-config";
import { APPLICATIONS, DEFAULT_SCENARIO, MATERIALS } from "@/data/seed";
import { application, material, scenario } from "./fixtures";

const A = DEFAULT_ASSUMPTIONS;
const seedMaterial = (code: string) => MATERIALS.find((m) => m.code === code)!;
const seedRun = (code: string, s = DEFAULT_SCENARIO) =>
  runMatching({ material: seedMaterial(code), applications: APPLICATIONS, scenario: s });
const result = (code: string, appId: string, s = DEFAULT_SCENARIO) =>
  seedRun(code, s).results.find((r) => r.applicationId === appId)!;

describe("Missing-Bridge Planner", () => {
  it("derives a blocking, safety-priority action for missing leaching evidence", () => {
    const r = evaluateMatch(material({ documents: [] }), application(), A);
    const action = r.bridge.find((b) => b.checkId === "evidence:e-leach")!;
    expect(action).toMatchObject({
      category: "contamination_leaching",
      blocking: true,
      priority: 1,
      reviewer: "regulatory",
      currentState: "Not supplied",
    });
    expect(action.nextAction).toMatch(/No threshold is assumed/);
  });

  it("creates a measurement action for every unknown requirement", () => {
    const app = application();
    app.requirements.push({ ...app.requirements[1], id: "r-wa", property: "water_absorption" });
    const r = evaluateMatch(material(), app, A);
    const a = r.bridge.find((b) => b.checkId === "spec:r-wa")!;
    expect(a.category).toBe("physical_property");
    expect(a.priority).toBe(3);
    expect(a.blocking).toBe(false);
  });

  it("offers a processing route for a failed hard rule without changing the state", () => {
    const app = application();
    app.requirements[0] = { ...app.requirements[0], remediation: "Weather the slag." };
    const m = material();
    m.measurements[0] = { ...m.measurements[0], value: 6 };
    const r = evaluateMatch(m, app, A);
    const a = r.bridge.find((b) => b.checkId === "spec:r-freecao")!;
    expect(r.state).toBe("ineligible");
    expect(a.category).toBe("processing");
    expect(a.blocking).toBe(true);
    expect(a.nextAction).toMatch(/remains ineligible/);
  });

  it("always requires human technical review for non-ineligible candidates, and regulatory review when flagged", () => {
    const r = evaluateMatch(material(), application({ requiresRegulatoryReview: true }), A);
    expect(r.bridge.map((b) => b.id)).toEqual(expect.arrayContaining(["review:technical", "review:regulatory"]));
    const inel = evaluateMatch(material({ family: "fly_ash" }), application(), A);
    expect(inel.bridge.find((b) => b.id === "review:technical")).toBeUndefined();
  });

  it("asks for independent review of unverified safety-critical documents", () => {
    const m = material();
    m.documents[0] = { ...m.documents[0], status: "available_unverified" };
    const r = evaluateMatch(m, application(), A);
    expect(r.state).toBe("potentially_eligible");
    expect(r.bridge.some((b) => b.id === "review:evidence:e-leach")).toBe(true);
  });

  it("every action traces to a check or a mandatory review", () => {
    const r = result("BPI-DEMO-FSD-001", "app-manufactured-soil");
    const checkIds = new Set(r.checks.map((c) => c.id));
    for (const a of r.bridge) {
      expect(a.checkId === null ? a.category : checkIds.has(a.checkId)).toBeTruthy();
      expect(a.priorityRule).toMatch(/^P[123]/);
    }
  });

  it("orders blocking actions first, then by priority", () => {
    const r = result("BPI-DEMO-FSD-001", "app-manufactured-soil");
    const keys = r.bridge.map((b) => [Number(!b.blocking), b.priority]);
    const sorted = [...keys].sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    expect(keys).toEqual(sorted);
  });
});

describe("ranking and reproducibility", () => {
  it("never ranks an ineligible candidate above an actionable one", () => {
    for (const m of MATERIALS) {
      const { results } = runMatching({ material: m, applications: APPLICATIONS, scenario: DEFAULT_SCENARIO });
      const firstNonActionable = results.findIndex((r) => r.rank === null);
      if (firstNonActionable >= 0) {
        expect(results.slice(firstNonActionable).every((r) => r.rank === null)).toBe(true);
      }
      expect(results.filter((r) => r.state === "ineligible").every((r) => r.rank === null)).toBe(true);
    }
  });

  it("places scored candidates before provisional ones", () => {
    const ranked = rankResults([
      { ...evaluateMatch(material({ documents: [] }), application({ id: "a-prov" }), A) },
      { ...evaluateMatch(material(), application({ id: "a-scored" }), { ...A, distanceKmOverride: 290 }) },
    ]);
    expect(ranked[0].applicationId).toBe("a-scored");
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("is deterministic: same inputs give identical output and hash", () => {
    const a = seedRun("BPI-DEMO-SLG-001");
    const b = seedRun("BPI-DEMO-SLG-001");
    expect(b).toEqual(a);
    expect(a.inputHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes the input hash when an assumption changes", () => {
    const a = seedRun("BPI-DEMO-GBS-001");
    const b = seedRun("BPI-DEMO-GBS-001", scenario({ transportCostInrPerTonneKm: 3 }));
    expect(b.inputHash).not.toBe(a.inputHash);
  });

  it("records engine, scoring and ruleset versions", () => {
    const run = seedRun("BPI-DEMO-ASH-001");
    expect(run.engineVersion).toMatch(/^bpi-engine-/);
    expect(run.scoringModelVersion).toMatch(/^bpi-score-/);
    expect(Object.keys(run.rulesetVersions)).toHaveLength(APPLICATIONS.length);
  });

  it("normalises custom weights and rejects invalid ones", () => {
    const w = normaliseWeights({ technical: 2, economic: 2, logistics: 0, volume: 0, circularity: 0, evidence: 0 });
    expect(w.technical).toBe(0.5);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(() => normaliseWeights({ technical: -1 })).toThrow(RangeError);
    expect(() => normaliseWeights({ technical: 0, economic: 0, logistics: 0, volume: 0, circularity: 0, evidence: 0 })).toThrow(RangeError);
  });
});

describe("seed dataset exercises each required outcome", () => {
  it("promising candidate blocked by missing leaching evidence", () => {
    const r = result("BPI-DEMO-SLG-001", "app-granular-subbase");
    expect(r.state).toBe("incomplete_evidence");
    expect(r.headline).toBe("Promising candidate — technical review required");
    expect(r.bridge[0].target).toBe("Leaching test report");
  });

  it("candidate blocked by an explicit technical constraint", () => {
    const r = result("BPI-DEMO-SLG-001", "app-concrete-aggregate");
    expect(r.state).toBe("ineligible");
    expect(r.checks.find((c) => c.requirementId === "concrete-free-cao")!.status).toBe("fail");
  });

  it("candidate missing a required measurement with insufficient data for a score", () => {
    const r = result("BPI-DEMO-FSD-001", "app-manufactured-soil");
    expect(r.state).toBe("incomplete_evidence");
    expect(r.score.status).toBe("insufficient_data");
    expect(r.checks.find((c) => c.id === "evidence:soil-metals")!.observed).toBe("Requested, not yet received");
  });

  it("candidate with incomplete environmental evidence", () => {
    const r = result("BPI-DEMO-MSC-001", "app-cement-iron-corrective");
    expect(r.state).toBe("incomplete_evidence");
    expect(r.checks.find((c) => c.requirementId === "iron-oil")!.status).toBe("unknown");
  });

  it("economics become unattractive at long transport distance and recover when it shortens", () => {
    const far = result("BPI-DEMO-GBS-001", "app-ggbs-cement");
    const near = result(
      "BPI-DEMO-GBS-001",
      "app-ggbs-cement",
      scenario({}, { "app-ggbs-cement": { distanceKmOverride: 250 } }),
    );
    expect(far.economics.perTonne.net!).toBeLessThan(0);
    expect(near.economics.perTonne.net!).toBeGreaterThan(0);
    expect(near.score.total!).toBeGreaterThan(far.score.total! + 15);
  });

  it("a fully potentially eligible case exists", () => {
    expect(result("BPI-DEMO-SLG-002", "app-granular-subbase").state).toBe("potentially_eligible");
    expect(result("BPI-DEMO-ASH-001", "app-scm-concrete").state).toBe("potentially_eligible");
  });

  it("all seed profiles are labelled synthetic", () => {
    expect(MATERIALS.every((m) => m.dataOrigin === "synthetic_demo")).toBe(true);
    expect(MATERIALS.every((m) => m.measurements.every((x) => x.provenance === "synthetic_demo"))).toBe(true);
  });
});
