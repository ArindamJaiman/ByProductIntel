import { PROPERTIES, type PropertyKey } from "../properties";
import type { EvidenceDocType, ReviewerType } from "../types";
import { DOC_LABELS } from "./bridge";
import type { Check, MatchResult } from "./result-types";

/**
 * Grouping assumption: the properties a laboratory engagement of each type
 * normally reports. Used only to bundle outstanding items into packages that
 * can be commissioned together. It never marks anything as measured.
 */
export const TEST_PACKAGES: Record<EvidenceDocType, PropertyKey[]> = {
  chemical_composition_report: ["cao", "sio2", "al2o3", "fe2o3", "mgo", "so3", "sio2_al2o3_fe2o3", "fe_total", "free_cao", "loi"],
  particle_size_analysis: ["fineness_45um_retained", "max_particle_size", "clay_content"],
  volumetric_stability_test: ["volumetric_expansion"],
  strength_activity_test: ["strength_activity_index_28d"],
  heavy_metals_analysis: ["chromium_total", "lead_total"],
  oil_grease_analysis: ["oil_content"],
  leaching_test_report: [],
  hazard_classification: [],
  product_conformity_certificate: [],
};

const PACKAGE_FOR_PROPERTY = new Map<PropertyKey, EvidenceDocType>(
  (Object.entries(TEST_PACKAGES) as [EvidenceDocType, PropertyKey[]][]).flatMap(([doc, props]) => props.map((p) => [p, doc] as const)),
);

export type GapKind = "laboratory_package" | "measurement" | "declaration" | "specification";

export interface GapItem {
  key: string;
  label: string;
  kind: GapKind;
  /** The individual measurements and documents this item supplies. */
  covers: string[];
  reviewers: ReviewerType[];
  safetyCritical: boolean;
  /** Pathways where this item is an outstanding hard or safety-critical unknown. */
  gates: string[];
  /** Pathways for which this is the only outstanding item: supplying it makes them fully assessable. */
  unlocks: string[];
  /** Sum of the positive indicative annual net benefit of `unlocks`. A scenario figure, not a saving. */
  valueAtStakeInr: number;
  tonnesAtStake: number;
  /** Pathways where this item only affects the score or confidence (a soft requirement). */
  informs: string[];
}

export interface TestPlanStep {
  item: GapItem;
  /** Pathways that become fully assessable at this step. */
  completes: string[];
  cumulativeAssessable: number;
  cumulativeValueInr: number;
}

export interface TestPlan {
  materialId: string;
  /** In-scope pathways without a known hard failure. Testing cannot rescue a known failure. */
  considered: string[];
  excludedIneligible: string[];
  /** Considered pathways with nothing outstanding. */
  alreadyAssessable: string[];
  items: GapItem[];
  sequence: TestPlanStep[];
  bestSingle: GapItem | null;
}

interface ItemSpec {
  key: string;
  label: string;
  kind: GapKind;
  cover: string;
}

/** Map an outstanding check to the item that would resolve it, or null when no material-side item applies. */
export function itemForCheck(c: Check, applicationId: string): ItemSpec | null {
  switch (c.stage) {
    case "specification": {
      if (!c.property) {
        return { key: `spec:${applicationId}`, label: "Agree an acceptance specification", kind: "specification", cover: "Acceptance specification (recipient side)" };
      }
      const doc = PACKAGE_FOR_PROPERTY.get(c.property);
      const cover = PROPERTIES[c.property].label;
      return doc
        ? { key: `pkg:${doc}`, label: DOC_LABELS[doc], kind: "laboratory_package", cover }
        : { key: `prop:${c.property}`, label: `Measure ${cover}`, kind: "measurement", cover };
    }
    case "evidence":
      return c.docType ? { key: `pkg:${c.docType}`, label: DOC_LABELS[c.docType], kind: "laboratory_package", cover: DOC_LABELS[c.docType] } : null;
    case "hazard":
      return { key: "pkg:hazard_classification", label: DOC_LABELS.hazard_classification, kind: "laboratory_package", cover: "Hazard declaration for this stream" };
    case "identity":
      return { key: "decl:source_process", label: "Declare the source process", kind: "declaration", cover: "Material identity" };
    case "volume":
      return { key: "decl:volume", label: "Report available volume", kind: "declaration", cover: "Annual available volume" };
    default:
      return null;
  }
}

const blocksState = (c: Check) => c.status === "unknown" && (c.enforcement === "hard" || c.safetyCritical);
const softOnly = (c: Check) => c.status === "unknown" && c.enforcement === "soft" && !c.safetyCritical;
const positiveValue = (r: MatchResult) => Math.max(0, r.economics.annualNetInr ?? 0);

/**
 * Rank the evidence a material still needs by how many pathways each item
 * makes fully assessable, then order the items into a greedy test sequence.
 *
 * "Assessable" means no hard or safety-critical item is still unknown. It is
 * not eligibility: a new result can still fail its threshold. Pathways with a
 * known hard failure are excluded because no test changes a known failure.
 */
export function buildTestPlan(materialId: string, results: MatchResult[]): TestPlan {
  const inScope = results.filter((r) => r.checks.find((c) => c.id === "identity")?.status !== "fail");
  const considered = inScope.filter((r) => r.state !== "ineligible");
  const byApp = new Map(considered.map((r) => [r.applicationId, r]));
  const items = new Map<string, GapItem>();
  const outstanding = new Map<string, Set<string>>();

  const itemFor = (spec: ItemSpec, c: Check, r: MatchResult): GapItem => {
    let item = items.get(spec.key);
    if (!item) {
      item = { key: spec.key, label: spec.label, kind: spec.kind, covers: [], reviewers: [], safetyCritical: false, gates: [], unlocks: [], valueAtStakeInr: 0, tonnesAtStake: 0, informs: [] };
      items.set(spec.key, item);
    }
    if (!item.covers.includes(spec.cover)) item.covers.push(spec.cover);
    const reviewer = r.bridge.find((b) => b.checkId === c.id)?.reviewer;
    if (reviewer && !item.reviewers.includes(reviewer)) item.reviewers.push(reviewer);
    return item;
  };

  for (const r of considered) {
    const keys = new Set<string>();
    for (const c of r.checks) {
      if (!blocksState(c) && !softOnly(c)) continue;
      const spec = itemForCheck(c, r.applicationId);
      if (!spec) continue;
      const item = itemFor(spec, c, r);
      if (blocksState(c)) {
        keys.add(spec.key);
        item.safetyCritical ||= c.safetyCritical;
        if (!item.gates.includes(r.applicationId)) item.gates.push(r.applicationId);
      } else if (!item.informs.includes(r.applicationId)) {
        item.informs.push(r.applicationId);
      }
    }
    outstanding.set(r.applicationId, keys);
  }

  for (const [appId, keys] of outstanding) {
    if (keys.size !== 1) continue;
    const item = items.get([...keys][0])!;
    const r = byApp.get(appId)!;
    item.unlocks.push(appId);
    item.valueAtStakeInr += positiveValue(r);
    item.tonnesAtStake += r.economics.acceptedTonnes ?? 0;
  }
  for (const item of items.values()) {
    // An item that only informs the score is shown after the ones that gate a pathway.
    item.gates.sort();
    item.unlocks.sort();
    item.informs = item.informs.filter((a) => !item.gates.includes(a)).sort();
  }

  const ranked = [...items.values()].sort(
    (a, b) =>
      b.unlocks.length - a.unlocks.length ||
      b.valueAtStakeInr - a.valueAtStakeInr ||
      b.gates.length - a.gates.length ||
      Number(b.safetyCritical) - Number(a.safetyCritical) ||
      b.informs.length - a.informs.length ||
      a.key.localeCompare(b.key),
  );

  return {
    materialId,
    considered: considered.map((r) => r.applicationId).sort(),
    excludedIneligible: inScope.filter((r) => r.state === "ineligible").map((r) => r.applicationId).sort(),
    alreadyAssessable: [...outstanding].filter(([, k]) => k.size === 0).map(([a]) => a).sort(),
    items: ranked,
    sequence: greedySequence(outstanding, items, byApp),
    bestSingle: ranked.find((i) => i.gates.length > 0) ?? null,
  };
}

/**
 * Greedy order: at each step take the item that completes the most pathways
 * (ties: more value, then the pathway closest to completion, then safety-
 * critical first, then key). Deterministic for identical input.
 */
function greedySequence(
  outstanding: Map<string, Set<string>>,
  items: Map<string, GapItem>,
  byApp: Map<string, MatchResult>,
): TestPlanStep[] {
  const remaining = new Map([...outstanding].filter(([, k]) => k.size > 0).map(([a, k]) => [a, new Set(k)]));
  const steps: TestPlanStep[] = [];
  let assessable = 0;
  let value = 0;

  while (remaining.size > 0) {
    const candidates = [...new Set([...remaining.values()].flatMap((k) => [...k]))];
    const scored = candidates.map((key) => {
      const completes = [...remaining].filter(([, k]) => k.size === 1 && k.has(key)).map(([a]) => a).sort();
      const closest = Math.min(...[...remaining.values()].filter((k) => k.has(key)).map((k) => k.size));
      return { key, completes, value: completes.reduce((s, a) => s + positiveValue(byApp.get(a)!), 0), closest };
    });
    scored.sort(
      (a, b) =>
        b.completes.length - a.completes.length ||
        b.value - a.value ||
        a.closest - b.closest ||
        Number(items.get(b.key)!.safetyCritical) - Number(items.get(a.key)!.safetyCritical) ||
        a.key.localeCompare(b.key),
    );
    const pick = scored[0];
    for (const [a, k] of remaining) {
      k.delete(pick.key);
      if (k.size === 0) remaining.delete(a);
    }
    assessable += pick.completes.length;
    value += pick.value;
    steps.push({ item: items.get(pick.key)!, completes: pick.completes, cumulativeAssessable: assessable, cumulativeValueInr: value });
  }
  return steps;
}
