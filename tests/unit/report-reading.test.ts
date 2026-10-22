import { describe, expect, it } from "vitest";
import { APPLICATIONS, DEFAULT_SCENARIO, MATERIALS } from "@/data/seed";
import { INDIA_ROAD_FREIGHT_HCV } from "@/domain/emission-factors";
import { runMatching } from "@/domain/engine/run";
import {
  applyConfirmedValues,
  readingJsonSchema,
  readingSchema,
  resolveUnit,
  reviewReading,
  suggestDocTypes,
  valueAppearsInQuote,
  type RawFinding,
  type ReportReading,
} from "@/domain/report-reading";
import { materialInputSchema, validateMaterial } from "@/domain/validation";

const millScale = MATERIALS.find((m) => m.id === "mat-mill-scale")!;
const sand = MATERIALS.find((m) => m.id === "mat-foundry-sand")!;

const f = (over: Partial<RawFinding>): RawFinding => ({
  property: "oil_content",
  printedName: "Oil and grease content",
  printedValue: "0.42",
  value: 0.42,
  printedUnit: "% (w/w)",
  method: "Solvent extraction",
  page: 1,
  quote: "1 Oil and grease content Solvent extraction % (w/w) 0.42 ≤ 1.0",
  ...over,
});

const reading = (findings: RawFinding[], documentType = "oil_grease_analysis"): ReportReading => ({
  documentType,
  laboratory: "Demo Analytical Laboratory (synthetic)",
  reportDate: "08 October 2026",
  reportReference: "DAL/2026/OG-0417",
  sampleDescription: null,
  findings,
  remarks: null,
});

describe("Unit mapping is done in code, not by the model", () => {
  it("keeps composition and test percentages apart", () => {
    expect(resolveUnit("oil_content", "% (w/w)")).toBe("%");
    expect(resolveUnit("water_absorption", "%")).toBe("pct");
    expect(resolveUnit("chromium_total", "mg/kg")).toBe("mg/kg");
    expect(resolveUnit("max_particle_size", "µm")).toBe("µm");
    expect(resolveUnit("specific_gravity", "")).toBe("-");
  });

  it("rejects a unit that does not fit the property", () => {
    expect(resolveUnit("max_particle_size", "%")).toBeNull();
    expect(resolveUnit("oil_content", "mm")).toBeNull();
    expect(resolveUnit("oil_content", "furlongs")).toBeNull();
  });
});

describe("Every value must be traceable to the quoted line", () => {
  it("finds values printed with either decimal mark or a thousands separator", () => {
    expect(valueAppearsInQuote(0.42, "Oil and grease 0.42 %")).toBe(true);
    expect(valueAppearsInQuote(0.42, "Oil and grease 0,42 %")).toBe(true);
    expect(valueAppearsInQuote(1450, "Total chromium 1,450 mg/kg")).toBe(true);
    expect(valueAppearsInQuote(71.2, "Total iron (Fe) Titrimetric % 71.2 ≥ 50")).toBe(true);
  });

  it("does not merge neighbouring numbers or accept a value that is not printed", () => {
    expect(valueAppearsInQuote(71.27, "Total iron 71.2 70.0")).toBe(false);
    expect(valueAppearsInQuote(0.5, "Oil and grease 0.42 %")).toBe(false);
  });
});

describe("Review of a transcription", () => {
  it("accepts a clean result and ticks it by default", () => {
    const [r] = reviewReading(reading([f({})]), millScale);
    expect(r).toMatchObject({ property: "oil_content", unit: "%", flags: [], selectable: true, suggested: true });
  });

  it("blocks values the model may have invented, limits, unknown parameters and implausible values", () => {
    const out = reviewReading(
      reading([
        f({ value: 0.5 }),
        f({ printedValue: "< 0.01", value: null, property: "none", printedName: "Chloride", quote: "Chloride < 0.01 %" }),
        f({ printedValue: "<0.05", value: 0.05, quote: "Oil <0.05 %" }),
        f({ value: 140, printedValue: "140", quote: "Oil 140 %" }),
        f({ property: "max_particle_size", printedUnit: "%", value: 6, printedValue: "6", quote: "Size 6 %" }),
      ]),
      millScale,
    );
    expect(out[0].flags).toContain("value_not_in_quote");
    expect(out[1].flags).toEqual(expect.arrayContaining(["not_in_catalogue", "not_a_single_number"]));
    expect(out[2].flags).toContain("not_a_single_number");
    expect(out[3].flags).toContain("out_of_range");
    expect(out[4].flags).toContain("unit_not_recognised");
    expect(out.every((r) => !r.selectable)).toBe(true);
  });

  it("flags a property reported twice, and a value that differs from the record, without blocking them", () => {
    const out = reviewReading(
      reading([f({}), f({ value: 0.44, printedValue: "0.44", quote: "Oil and grease, repeat 0.44 %" }), f({ property: "fe_total", printedName: "Total iron", value: 71.2, printedValue: "71.2", printedUnit: "%", quote: "Total iron 71.2 %" })]),
      millScale,
    );
    expect(out[0].flags).toEqual(["reported_twice"]);
    expect(out[0].selectable).toBe(true);
    expect(out[0].suggested).toBe(false);
    expect(out[2].flags).toEqual(["differs_from_record"]);
    expect(out[2].existing?.value).toBe(71.5);
  });

  it("rejects malformed model output", () => {
    expect(readingSchema.safeParse({ findings: "none" }).success).toBe(false);
    expect(readingSchema.safeParse(reading([f({})])).success).toBe(true);
    expect(JSON.stringify(readingJsonSchema())).toContain("oil_content");
  });
});

describe("Saving confirmed values", () => {
  const ctx = { documentId: "doc-new", fileName: "report.pdf", confirmedBy: "Demo user", confirmedOn: "22 Oct 2026" };

  it("records values as user-supplied and lab-reported, never independently verified, with a traceable note", () => {
    const input = applyConfirmedValues(millScale, [{ property: "oil_content", value: 0.42, unit: "%", method: "Solvent extraction", page: 1 }], { types: ["oil_grease_analysis"], laboratory: "Demo lab", date: "08 October 2026", reference: "R-1" }, ctx);
    const m = input.measurements.find((x) => x.property === "oil_content")!;
    expect(m).toMatchObject({ value: 0.42, unit: "%", provenance: "user_supplied", verification: "lab_reported", documentId: "doc-new" });
    expect(m.note).toMatch(/AI assistance.*page 1.*confirmed by Demo user/);
    expect(input.documents.find((d) => d.id === "doc-new")).toMatchObject({ type: "oil_grease_analysis", status: "available_unverified", provenance: "user_supplied" });
    expect(materialInputSchema.safeParse(input).success).toBe(true);
    expect(validateMaterial(input).valid).toBe(true);
  });

  it("replaces an earlier value and fills a requested document placeholder", () => {
    const input = applyConfirmedValues(sand, [{ property: "chromium_total", value: 120, unit: "mg/kg", method: null, page: 2 }], { types: ["heavy_metals_analysis"], laboratory: null, date: null, reference: null }, ctx);
    const docs = input.documents.filter((d) => d.type === "heavy_metals_analysis");
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ id: "doc-fsd-metals", status: "available_unverified" });
    const again = applyConfirmedValues({ ...sand, ...input } as typeof sand, [{ property: "chromium_total", value: 130, unit: "mg/kg", method: null, page: 2 }], null, ctx);
    expect(again.measurements.filter((m) => m.property === "chromium_total").map((m) => m.value)).toEqual([130]);
  });

  it("records one combined report as every kind of evidence it provides, and links each value to the right one", () => {
    expect(suggestDocTypes({ documentType: "chemical_composition_report" }, ["oil_content", "fe_total", "moisture"])).toEqual([
      "chemical_composition_report",
      "oil_grease_analysis",
    ]);
    expect(suggestDocTypes({ documentType: "other" }, ["chromium_total"])).toEqual(["heavy_metals_analysis"]);
    const input = applyConfirmedValues(
      millScale,
      [
        { property: "oil_content", value: 0.42, unit: "%", method: null, page: 1 },
        { property: "fe_total", value: 71.2, unit: "%", method: null, page: 1 },
      ],
      { types: ["chemical_composition_report", "oil_grease_analysis"], laboratory: null, date: null, reference: "R-1" },
      ctx,
    );
    const added = input.documents.filter((d) => d.id.startsWith("doc-new"));
    expect(added.map((d) => d.type)).toEqual(["chemical_composition_report", "oil_grease_analysis"]);
    expect(input.measurements.find((m) => m.property === "oil_content")!.documentId).toBe(added[1].id);
    expect(input.measurements.find((m) => m.property === "fe_total")!.documentId).toBe(added[0].id);
    expect(validateMaterial(input).valid).toBe(true);
  });

  it("moves the mill scale's iron corrective pathway from incomplete to potentially eligible", () => {
    const input = applyConfirmedValues(millScale, [{ property: "oil_content", value: 0.42, unit: "%", method: null, page: 1 }], { types: ["oil_grease_analysis"], laboratory: null, date: null, reference: null }, ctx);
    const before = runMatching({ material: millScale, applications: APPLICATIONS, scenario: DEFAULT_SCENARIO }).results.find((r) => r.applicationId === "app-cement-iron-corrective")!;
    const after = runMatching({ material: { ...millScale, ...input }, applications: APPLICATIONS, scenario: DEFAULT_SCENARIO }).results.find((r) => r.applicationId === "app-cement-iron-corrective")!;
    expect(before.state).toBe("incomplete_evidence");
    expect(after.state).toBe("potentially_eligible");
  });
});

describe("Transport emissions", () => {
  it("multiplies tonne-km by the cited Indian heavy-truck factor", () => {
    const r = runMatching({ material: MATERIALS.find((m) => m.id === "mat-gbfs")!, applications: APPLICATIONS, scenario: DEFAULT_SCENARIO }).results.find(
      (x) => x.applicationId === "app-ggbs-cement",
    )!;
    const e = r.environment.transportEmissions!;
    expect(e.status).toBe("estimated");
    expect(e.kgCo2ePerTonneKm).toBe(INDIA_ROAD_FREIGHT_HCV.kgCo2ePerTonneKm);
    expect(e.tonnesCo2ePerYear).toBe(Math.round((r.environment.transportActivityTonneKm! * 0.0509) / 1000));
    expect(e.sourceId).toBe("src-glec-v32-india-road");
    expect(r.environment.ghg.status).toBe("not_estimated");
  });

  it("is not computed when volume is unknown", () => {
    const m = { ...millScale, volume: { ...millScale.volume, tonnesPerYear: null } };
    const r = runMatching({ material: m, applications: APPLICATIONS, scenario: DEFAULT_SCENARIO }).results[0];
    expect(r.environment.transportEmissions).toMatchObject({ status: "not_computed", tonnesCo2ePerYear: null });
  });
});
