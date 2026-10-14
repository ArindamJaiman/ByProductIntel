import { isPropertyKey, PROPERTIES } from "./properties";
import { getUnit, isUnitId, type UnitId } from "./units";
import { materialInputSchema, validateMaterial, type MaterialInput } from "./validation";

/**
 * CSV import for material profiles. One row per material. Fixed columns plus
 * any number of measurement columns named `property:unit` (e.g. `cao:%`,
 * `chromium_total:mg/kg`). Empty measurement cells mean "not measured".
 *
 * Imported values are always recorded as user-supplied and unverified: a CSV
 * cannot assert laboratory or independent verification.
 */

export const CSV_FIXED_COLUMNS = [
  "name",
  "family",
  "source_process",
  "site",
  "region",
  "country",
  "lat",
  "lon",
  "tonnes_per_year",
  "reporting_period",
  "hazard_status",
  "handling_pathway",
  "handling_kind",
  "handling_cost_inr_per_t",
] as const;

export const CSV_TEMPLATE = [
  [...CSV_FIXED_COLUMNS, "cao:%", "sio2:%", "free_cao:%", "volumetric_expansion:pct", "chromium_total:mg/kg"].join(","),
  [
    '"Example BOF slag, 0–40 mm"',
    "steel_slag_bof",
    '"Basic oxygen furnace, air-cooled"',
    '"Slag yard"',
    '"Example region"',
    "India",
    "22.5",
    "86.5",
    "50000",
    "FY 2026",
    "not_declared",
    '"Stockpiled on site"',
    "disposal_or_stockpile",
    "",
    "42",
    "14",
    "3.1",
    "",
    "1200",
  ].join(","),
].join("\n");

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("Unterminated quoted field");
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export interface CsvRowError {
  row: number;
  message: string;
}

export interface CsvImportResult {
  materials: MaterialInput[];
  errors: CsvRowError[];
}

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

export function materialsFromCsv(text: string): CsvImportResult {
  const errors: CsvRowError[] = [];
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { materials: [], errors: [{ row: 0, message: (e as Error).message }] };
  }
  if (rows.length < 2) return { materials: [], errors: [{ row: 0, message: "The file needs a header row and at least one data row." }] };

  const header = rows[0].map((h) => h.trim());
  const missing = CSV_FIXED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { materials: [], errors: [{ row: 1, message: `Missing columns: ${missing.join(", ")}` }] };

  const measurementCols: { index: number; property: keyof typeof PROPERTIES; unit: UnitId }[] = [];
  header.forEach((h, index) => {
    if ((CSV_FIXED_COLUMNS as readonly string[]).includes(h)) return;
    const [property, unit] = h.split(":");
    if (!property || !unit || !isPropertyKey(property) || !isUnitId(unit)) {
      errors.push({ row: 1, message: `Column "${h}" is not a known property:unit pair` });
      return;
    }
    if (getUnit(unit).dimension !== PROPERTIES[property].dimension) {
      errors.push({ row: 1, message: `Column "${h}": unit ${unit} is not valid for ${PROPERTIES[property].label}` });
      return;
    }
    measurementCols.push({ index, property, unit });
  });
  if (errors.length) return { materials: [], errors };

  const materials: MaterialInput[] = [];
  rows.slice(1).forEach((cells, i) => {
    const rowNo = i + 2;
    const get = (c: (typeof CSV_FIXED_COLUMNS)[number]) => (cells[header.indexOf(c)] ?? "").trim();
    const measurements = measurementCols.flatMap(({ index, property, unit }) => {
      const raw = (cells[index] ?? "").trim();
      if (raw === "") return [];
      return [{ property, value: Number(raw), unit, provenance: "user_supplied" as const, verification: "unverified" as const }];
    });
    const candidate = {
      name: get("name"),
      family: get("family"),
      sourceProcess: get("source_process"),
      description: "",
      location: { site: get("site"), region: get("region"), country: get("country"), lat: num(get("lat")), lon: num(get("lon")) },
      volume: { tonnesPerYear: num(get("tonnes_per_year")), reportingPeriod: get("reporting_period"), provenance: "user_supplied" },
      hazard: { status: get("hazard_status") || "not_declared", verification: "unverified" },
      currentHandling: {
        pathway: get("handling_pathway"),
        kind: get("handling_kind") || "unknown",
        costInrPerTonne: num(get("handling_cost_inr_per_t")),
        provenance: "user_supplied",
      },
      measurements,
      documents: [],
    };
    const parsed = materialInputSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: rowNo, message: `${issue.path.join(".") || "row"}: ${issue.message}` });
      }
      return;
    }
    const domain = validateMaterial(parsed.data);
    for (const issue of domain.issues.filter((x) => x.severity === "error")) errors.push({ row: rowNo, message: issue.message });
    if (domain.valid) materials.push(parsed.data);
  });
  return { materials: errors.length ? [] : materials, errors };
}
