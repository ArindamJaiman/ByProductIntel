import { describe, expect, it } from "vitest";
import { APPLICATIONS, DEFAULT_SCENARIO, MATERIALS } from "@/data/seed";
import { diffRuns } from "@/domain/engine/diff";
import { evaluateMatch } from "@/domain/engine/evaluate";
import { findPoolingOpportunities } from "@/domain/engine/pooling";
import { rankRobustness, weightVariants } from "@/domain/engine/robustness";
import { runMatching } from "@/domain/engine/run";
import { breakEven, sensitivity } from "@/domain/engine/sensitivity";
import { buildTestPlan } from "@/domain/engine/test-plan";
import type { StoredRun } from "@/domain/records";
import { DEFAULT_ASSUMPTIONS, DEFAULT_WEIGHTS } from "@/domain/scoring-config";
import { application, material, scenario } from "./fixtures";

const A = DEFAULT_ASSUMPTIONS;
const seed = (code: string) => MATERIALS.find((m) => m.code === code)!;
const app = (id: string) => APPLICATIONS.find((a) => a.id === id)!;
const results = (code: string, s = DEFAULT_SCENARIO) =>
  runMatching({ material: seed(code), applications: APPLICATIONS, scenario: s }).results;

function storedRun(code: string, s = DEFAULT_SCENARIO, overrides: Partial<StoredRun> = {}): StoredRun {
  const m = seed(code);
  const out = runMatching({ material: m, applications: APPLICATIONS, scenario: s });
  return {
    id: `run-${code}`,
    label: "test",
    materialId: m.id,
    createdAt: "2026-10-01T00:00:00.000Z",
    createdBy: "test",
    engineVersion: out.engineVersion,
    scoringModelVersion: out.scoringModelVersion,
    rulesetVersions: out.rulesetVersions,
    weights: out.weights,
    scenario: s,
    inputHash: out.inputHash,
    materialSnapshot: m,
    applicationsSnapshot: APPLICATIONS,
    results: out.results,
    ...overrides,
  };
}

describe("Test planner", () => {
  it("names the single item that makes a promising pathway assessable", () => {
    const plan = buildTestPlan("mat-bof-slag-weathered", results("BPI-DEMO-SLG-001"));
    expect(plan.bestSingle?.key).toBe("pkg:leaching_test_report");
    expect(plan.bestSingle?.unlocks).toEqual(["app-granular-subbase"]);
    expect(plan.bestSingle?.valueAtStakeInr).toBeGreaterThan(0);
    expect(plan.excludedIneligible).toContain("app-concrete-aggregate");
    expect(plan.alreadyAssessable).toContain("app-clinker-lime");
  });

  it("bundles a measurement and its report into one laboratory package", () => {
    const plan = buildTestPlan("mat-mill-scale", results("BPI-DEMO-MSC-001"));
    const oil = plan.items.find((i) => i.key === "pkg:oil_grease_analysis")!;
    expect(oil.covers).toEqual(expect.arrayContaining(["Oil and grease content", "Oil and grease analysis"]));
    expect(oil.unlocks).toEqual(["app-cement-iron-corrective"]);
    expect(plan.sequence).toHaveLength(1);
  });

  it("orders a multi-item gap into a sequence that ends with the pathway assessable", () => {
    const plan = buildTestPlan("mat-foundry-sand", results("BPI-DEMO-FSD-001"));
    expect(plan.bestSingle?.unlocks).toEqual([]);
    expect(plan.items.map((i) => i.key).sort()).toEqual(["pkg:hazard_classification", "pkg:heavy_metals_analysis", "pkg:leaching_test_report"]);
    const last = plan.sequence.at(-1)!;
    expect(last.completes).toEqual(["app-manufactured-soil"]);
    expect(last.cumulativeAssessable).toBe(1);
    expect(plan.sequence.slice(0, -1).every((s) => s.completes.length === 0)).toBe(true);
  });

  it("never treats a soft gap as blocking", () => {
    const plan = buildTestPlan("mat-gbfs", results("BPI-DEMO-GBS-001"));
    const cert = plan.items.find((i) => i.key === "pkg:product_conformity_certificate")!;
    expect(cert.gates).toEqual([]);
    expect(cert.informs).toEqual(["app-ggbs-cement"]);
    expect(plan.sequence).toHaveLength(0);
  });

  it("is deterministic", () => {
    const r = results("BPI-DEMO-FSD-001");
    expect(buildTestPlan("x", r)).toEqual(buildTestPlan("x", r));
  });
});

describe("Break-even and sensitivity", () => {
  it("solves the distance at which the GGBS pathway breaks even", () => {
    const r = results("BPI-DEMO-GBS-001").find((x) => x.applicationId === "app-ggbs-cement")!;
    const b = breakEven(r, app("app-ggbs-cement"));
    // net = 1600 + 80 − 4.5·km − 0 → zero at 373.3 km
    expect(b.marginBeforeTransportInr).toBe(1680);
    expect(b.breakEvenDistanceKm).toBe(373.3);
    expect(b.binding).toBe("economics");
    expect(b.minimumPriceInr! + b.marginBeforeTransportInr! - 1600).toBeCloseTo(r.economics.perTonne.transport!, 0);
  });

  it("re-runs with the break-even distance and gets a net of about zero", () => {
    const b = breakEven(results("BPI-DEMO-GBS-001").find((x) => x.applicationId === "app-ggbs-cement")!, app("app-ggbs-cement"));
    const r = evaluateMatch(seed("BPI-DEMO-GBS-001"), app("app-ggbs-cement"), { ...A, distanceKmOverride: b.breakEvenDistanceKm });
    expect(Math.abs(r.economics.perTonne.net!)).toBeLessThanOrEqual(1);
  });

  it("reports when break-even cannot be computed", () => {
    const r = results("BPI-DEMO-SLG-001").find((x) => x.applicationId === "app-mineral-wool")!;
    expect(breakEven(r, app("app-mineral-wool")).status).toBe("not_computable");
  });

  it("flags an input whose movement crosses a hard limit", () => {
    // A pathway just inside its transport limit becomes ineligible when distance rises 20 %.
    const a = application({ logistics: { maxTransportKm: 100, mode: "road", basis: "demo_assumption" } });
    const bars = sensitivity(material(), a, { ...A, distanceKmOverride: 90 }, DEFAULT_WEIGHTS);
    const distance = bars.find((b) => b.key === "distance")!;
    expect(distance.flipsState).toBe(true);
    expect(distance.high.state).toBe("ineligible");
    expect(bars[0].key).toBe("distance");
  });

  it("skips inputs that are zero or unknown", () => {
    const bars = sensitivity(seed("BPI-DEMO-GBS-001"), app("app-ggbs-cement"), A, DEFAULT_WEIGHTS);
    expect(bars.map((b) => b.key)).not.toContain("processing");
  });
});

describe("Rank robustness", () => {
  it("tests the run weights, equal weights and each component halved and raised", () => {
    const v = weightVariants(DEFAULT_WEIGHTS);
    expect(v).toHaveLength(2 + 6 * 2);
    for (const x of v) expect(Object.values(x.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("keeps a scored leader ahead of provisional candidates under every variant", () => {
    const r = rankRobustness(results("BPI-DEMO-SLG-001"), DEFAULT_WEIGHTS);
    expect(r.leader).toBe("app-clinker-lime");
    expect(r.status).toBe("stable");
  });

  it("detects a leader that depends on the weights", () => {
    const a = application({ id: "app-a" });
    const b = application({ id: "app-b", circularity: { tier: "bulk_fill", substitutes: "", rationale: "" }, logistics: { maxTransportKm: 2000, mode: "road", basis: "demo_assumption" } });
    const rs = [evaluateMatch(material(), a, A), evaluateMatch(material(), b, A)];
    const out = rankRobustness(rs, DEFAULT_WEIGHTS);
    expect(out.status).not.toBe("not_applicable");
    expect(out.candidates).toHaveLength(2);
    expect(out.candidates.every((c) => c.minScore <= c.maxScore)).toBe(true);
  });

  it("is not applicable with fewer than two ranked candidates", () => {
    expect(rankRobustness(results("BPI-DEMO-FSD-001"), DEFAULT_WEIGHTS).status).toBe("not_applicable");
  });
});

describe("Pooling finder", () => {
  const byMaterial = new Map(MATERIALS.map((m) => [m.id, results(m.code)]));

  it("pools two mill scale sources that each fall short of the sinter plant's minimum", () => {
    const pools = findPoolingOpportunities(MATERIALS, APPLICATIONS, byMaterial);
    const sinter = pools.find((p) => p.applicationId === "app-sinter-feed")!;
    expect(sinter.members.map((m) => m.materialId)).toEqual(["mat-mill-scale", "mat-mill-scale-bar"]);
    expect(sinter.combinedTonnes).toBe(55000);
    expect(sinter.combinedTonnes).toBeGreaterThanOrEqual(sinter.minTonnes);
    expect(sinter.members.find((m) => m.materialId === "mat-mill-scale")!.outstanding).toContain("Oil and grease content");
  });

  it("never pools a source with another hard failure, or across families", () => {
    const pools = findPoolingOpportunities(MATERIALS, APPLICATIONS, byMaterial);
    for (const p of pools) {
      for (const m of p.members) {
        const r = byMaterial.get(m.materialId)!.find((x) => x.applicationId === p.applicationId)!;
        expect(r.checks.filter((c) => c.status === "fail" && c.enforcement === "hard").map((c) => c.id)).toEqual(["volume"]);
        expect(MATERIALS.find((x) => x.id === m.materialId)!.family).toBe(p.family);
      }
    }
    // BOF slag also fails the sinter plant on iron and distance, so it is not a pool member.
    expect(pools.flatMap((p) => p.members.map((m) => m.materialId))).not.toContain("mat-bof-slag-weathered");
  });
});

describe("Run comparison", () => {
  it("attributes a state change to the new evidence that caused it", () => {
    const before = storedRun("BPI-DEMO-SLG-001");
    const m = structuredClone(seed("BPI-DEMO-SLG-001"));
    m.documents.push({ id: "doc-new-leach", type: "leaching_test_report", title: "Leaching test", status: "available_unverified", provenance: "user_supplied" });
    const out = runMatching({ material: m, applications: APPLICATIONS, scenario: DEFAULT_SCENARIO });
    const after = storedRun("BPI-DEMO-SLG-001", DEFAULT_SCENARIO, { id: "run-after", materialSnapshot: m, results: out.results, inputHash: out.inputHash });

    const d = diffRuns(before, after);
    expect(d.inputChanges).toEqual([{ area: "document", label: "Leaching test report", before: "Not on file", after: "On file, unverified" }]);
    const sub = d.pathways.find((p) => p.applicationId === "app-granular-subbase")!;
    expect(sub.stateChanged).toBe(true);
    expect(sub.before?.state).toBe("incomplete_evidence");
    expect(sub.after?.state).toBe("potentially_eligible");
    expect(sub.checkChanges).toEqual([{ checkId: "evidence:subbase-leaching", label: "Leaching test report", before: "unknown", after: "pass" }]);
  });

  it("reports scenario changes and score movement", () => {
    const before = storedRun("BPI-DEMO-GBS-001");
    const s = scenario({}, { "app-ggbs-cement": { distanceKmOverride: 250 } });
    const after = storedRun("BPI-DEMO-GBS-001", s, { id: "run-after" });
    const d = diffRuns(before, after);
    expect(d.inputChanges.map((c) => c.area)).toEqual(["scenario"]);
    expect(d.pathways.find((p) => p.applicationId === "app-ggbs-cement")!.scoreDelta).toBe(24);
  });

  it("finds no changes between identical runs", () => {
    const r = storedRun("BPI-DEMO-ASH-001");
    const d = diffRuns(r, r);
    expect(d.inputChanges).toEqual([]);
    expect(d.changedCount).toBe(0);
  });
});
