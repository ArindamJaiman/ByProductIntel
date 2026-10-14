import { describe, expect, it } from "vitest";
import { convert, UnitMismatchError, UnknownUnitError, unitsCompatible } from "@/domain/units";
import { materialInputSchema, unitsForProperty, validateApplication, validateMaterial } from "@/domain/validation";
import { APPLICATIONS } from "@/data/seed";
import { application, material } from "./fixtures";

describe("unit conversion", () => {
  it("converts mass fractions between % and mg/kg", () => {
    expect(convert(1450, "mg/kg", "%")).toBeCloseTo(0.145, 10);
    expect(convert(0.145, "%", "mg/kg")).toBeCloseTo(1450, 6);
    expect(convert(5, "g/kg", "%")).toBeCloseTo(0.5, 10);
    expect(convert(10, "ppm", "mg/kg")).toBe(10);
  });

  it("converts lengths and densities", () => {
    expect(convert(45, "µm", "mm")).toBeCloseTo(0.045, 10);
    expect(convert(2, "cm", "mm")).toBe(20);
    expect(convert(3350, "kg/m3", "g/cm3")).toBeCloseTo(3.35, 10);
    expect(convert(2.6, "t/m3", "g/cm3")).toBe(2.6);
  });

  it("returns the same value for identical units and suppresses float noise", () => {
    expect(convert(7.1, "%", "%")).toBe(7.1);
    expect(convert(0.3, "g/kg", "%")).toBe(0.03);
  });

  it("refuses to convert across dimensions", () => {
    expect(() => convert(1, "%", "pct")).toThrow(UnitMismatchError);
    expect(() => convert(1, "mm", "%")).toThrow(UnitMismatchError);
    expect(unitsCompatible("%", "mg/kg")).toBe(true);
    expect(unitsCompatible("%", "pct")).toBe(false);
  });

  it("rejects unknown units and non-finite values", () => {
    expect(() => convert(1, "furlong", "mm")).toThrow(UnknownUnitError);
    expect(() => convert(Number.NaN, "%", "%")).toThrow(RangeError);
    expect(() => convert(Number.POSITIVE_INFINITY, "%", "mg/kg")).toThrow(RangeError);
  });

  it("lists only dimensionally valid units for a property", () => {
    expect(unitsForProperty("chromium_total")).toEqual(expect.arrayContaining(["%", "mg/kg", "ppm", "g/kg"]));
    expect(unitsForProperty("chromium_total")).not.toContain("pct");
    expect(unitsForProperty("max_particle_size")).toEqual(["mm", "µm", "cm"]);
  });
});

describe("material validation", () => {
  it("accepts a consistent profile", () => {
    expect(validateMaterial(material()).valid).toBe(true);
  });

  it("rejects a unit that does not match the property's dimension", () => {
    const r = validateMaterial(
      material({ measurements: [{ property: "free_cao", value: 2, unit: "mm", provenance: "user_supplied", verification: "unverified" }] }),
    );
    expect(r.valid).toBe(false);
    expect(r.issues[0].message).toMatch(/not valid for this property/);
  });

  it("rejects impossible values and duplicates", () => {
    const r = validateMaterial(
      material({
        measurements: [
          { property: "loi", value: 140, unit: "%", provenance: "user_supplied", verification: "unverified" },
          { property: "moisture", value: -1, unit: "%", provenance: "user_supplied", verification: "unverified" },
          { property: "cao", value: 30, unit: "%", provenance: "user_supplied", verification: "unverified" },
          { property: "cao", value: 31, unit: "%", provenance: "user_supplied", verification: "unverified" },
        ],
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.message).join(" ")).toMatch(/outside the plausible range[\s\S]*outside the plausible range[\s\S]*more than once/);
  });

  it("rejects non-finite numbers", () => {
    const r = validateMaterial(
      material({ measurements: [{ property: "loi", value: Number.NaN, unit: "%", provenance: "user_supplied", verification: "unverified" }] }),
    );
    expect(r.valid).toBe(false);
  });

  it("rejects compositions whose oxides exceed 100 %", () => {
    const ox = (property: "cao" | "sio2" | "fe2o3", value: number) =>
      ({ property, value, unit: "%", provenance: "user_supplied", verification: "unverified" }) as const;
    const r = validateMaterial(material({ measurements: [ox("cao", 60), ox("sio2", 30), ox("fe2o3", 20)] }));
    expect(r.valid).toBe(false);
    expect(r.issues[0].message).toMatch(/exceeds 100 %/);
  });

  it("rejects free lime greater than total lime", () => {
    const r = validateMaterial(
      material({
        measurements: [
          { property: "cao", value: 2, unit: "%", provenance: "user_supplied", verification: "unverified" },
          { property: "free_cao", value: 3, unit: "%", provenance: "user_supplied", verification: "unverified" },
        ],
      }),
    );
    expect(r.valid).toBe(false);
  });

  it("warns (without rejecting) when a reported oxide sum disagrees with its parts", () => {
    const u = { unit: "%", provenance: "user_supplied", verification: "unverified" } as const;
    const r = validateMaterial(
      material({
        measurements: [
          { property: "sio2", value: 50, ...u },
          { property: "al2o3", value: 20, ...u },
          { property: "fe2o3", value: 5, ...u },
          { property: "sio2_al2o3_fe2o3", value: 85, ...u },
        ],
      }),
    );
    expect(r.valid).toBe(true);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].severity).toBe("warning");
  });

  it("rejects references to documents that do not exist", () => {
    const r = validateMaterial(
      material({
        measurements: [{ property: "loi", value: 2, unit: "%", provenance: "user_supplied", verification: "unverified", documentId: "nope" }],
      }),
    );
    expect(r.valid).toBe(false);
  });

  it("schema rejects invalid coordinates and zero volume with readable messages", () => {
    const base = material();
    const parsed = materialInputSchema.safeParse({
      ...base,
      location: { ...base.location, lat: 120 },
      volume: { ...base.volume, tonnesPerYear: 0 },
    });
    expect(parsed.success).toBe(false);
    const messages = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
    expect(messages).toContain("Latitude must be between -90 and 90");
    expect(messages).toContain("Volume must be greater than zero");
  });
});

describe("application validation", () => {
  it("every seeded application is internally valid", () => {
    for (const app of APPLICATIONS) {
      const r = validateApplication(app);
      expect(r.issues, app.id).toEqual([]);
    }
  });

  it("requires a source for source-referenced rules", () => {
    const app = application();
    app.requirements[0] = { ...app.requirements[0], basis: "source_referenced", sourceId: undefined };
    expect(validateApplication(app).valid).toBe(false);
  });

  it("rejects inverted ranges", () => {
    const app = application();
    app.requirements[0] = { ...app.requirements[0], kind: "range", min: 5, max: 1 };
    expect(validateApplication(app).valid).toBe(false);
  });
});
