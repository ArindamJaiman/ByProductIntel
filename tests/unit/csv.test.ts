import { describe, expect, it } from "vitest";
import { CSV_TEMPLATE, materialsFromCsv, parseCsv } from "@/domain/csv";

describe("CSV parsing", () => {
  it("handles quotes, escaped quotes, commas and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b')).toThrow(/Unterminated/);
  });
});

describe("material CSV import", () => {
  it("imports the documented template as user-supplied, unverified data", () => {
    const r = materialsFromCsv(CSV_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.materials).toHaveLength(1);
    const m = r.materials[0];
    expect(m.family).toBe("steel_slag_bof");
    // Empty cells are not measured — never zero.
    expect(m.measurements.map((x) => x.property)).toEqual(["cao", "sio2", "free_cao", "chromium_total"]);
    expect(m.measurements.every((x) => x.provenance === "user_supplied" && x.verification === "unverified")).toBe(true);
    expect(m.currentHandling.costInrPerTonne).toBeNull();
  });

  it("rejects unknown property or incompatible unit columns", () => {
    const bad = CSV_TEMPLATE.replace("cao:%", "unobtainium:%").replace("chromium_total:mg/kg", "chromium_total:mm");
    const r = materialsFromCsv(bad);
    expect(r.materials).toEqual([]);
    expect(r.errors.map((e) => e.message).join(" ")).toMatch(/unobtainium[\s\S]*not valid for Total chromium/);
  });

  it("reports row-level validation errors and imports nothing (atomic)", () => {
    const lines = CSV_TEMPLATE.split("\n");
    const badRow = lines[1].replace(",22.5,", ",222.5,").replace(",42,", ",420,");
    const r = materialsFromCsv([lines[0], lines[1], badRow].join("\n"));
    expect(r.materials).toEqual([]);
    expect(r.errors.every((e) => e.row === 3)).toBe(true);
    expect(r.errors.map((e) => e.message).join(" ")).toMatch(/Latitude/);
  });

  it("requires every fixed column", () => {
    const r = materialsFromCsv("name,family\nx,fly_ash");
    expect(r.errors[0].message).toMatch(/Missing columns/);
  });
});
