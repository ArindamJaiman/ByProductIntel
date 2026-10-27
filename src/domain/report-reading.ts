import { z } from "zod";
import { DOC_LABELS } from "./engine/bridge";
import { TEST_PACKAGES } from "./engine/test-plan";
import { PROPERTIES, PROPERTY_KEYS, isPropertyKey, type PropertyKey } from "./properties";
import type { EvidenceDocType, Material, MaterialDocument, Measurement } from "./types";
import { UNITS, convert, type UnitId } from "./units";
import type { MaterialInput } from "./validation";

/**
 * Lab report reading. An AI model transcribes what a report prints; this
 * module decides what that transcription may become. Nothing is saved until
 * a person confirms each value, and every value must be traceable to a quoted
 * line of the report.
 */

export const DOC_TYPES = Object.keys(DOC_LABELS) as EvidenceDocType[];

const finding = z.object({
  property: z.string(),
  printedName: z.string().max(200),
  printedValue: z.string().max(80),
  value: z.number().nullable(),
  printedUnit: z.string().max(60),
  method: z.string().max(200).nullable(),
  page: z.number().int().min(1).max(1000).nullable(),
  quote: z.string().max(400),
});

/** Shape the model must return. Validated again here: model output is untrusted. */
export const readingSchema = z.object({
  documentType: z.string(),
  laboratory: z.string().max(200).nullable(),
  reportDate: z.string().max(40).nullable(),
  reportReference: z.string().max(120).nullable(),
  sampleDescription: z.string().max(300).nullable(),
  findings: z.array(finding).max(80),
  remarks: z.string().max(600).nullable(),
});

export type ReportReading = z.infer<typeof readingSchema>;
export type RawFinding = z.infer<typeof finding>;

/** JSON Schema sent to the model for structured output. */
export function readingJsonSchema() {
  const str = (description: string) => ({ type: "string", description });
  const nullableStr = (description: string) => ({ type: ["string", "null"], description });
  return {
    type: "object",
    properties: {
      documentType: { type: "string", enum: [...DOC_TYPES, "other"], description: "The kind of report." },
      laboratory: nullableStr("Issuing laboratory exactly as printed, or null."),
      reportDate: nullableStr("Report or issue date as printed, or null."),
      reportReference: nullableStr("Report or certificate number as printed, or null."),
      sampleDescription: nullableStr("Sample description as printed, or null."),
      findings: {
        type: "array",
        description: "One entry per measured result printed in the report. Never include specification limits, targets or acceptance criteria.",
        items: {
          type: "object",
          properties: {
            property: { type: "string", enum: [...PROPERTY_KEYS, "none"], description: "Catalogue key that the printed parameter clearly means, or none." },
            printedName: str("Parameter name exactly as printed."),
            printedValue: str("Result exactly as printed, including any < or > sign."),
            value: { type: ["number", "null"], description: "The printed result as a plain number. Null if it is not a single number (for example <0.05, ND, BDL or a range)." },
            printedUnit: str("Unit exactly as printed, or an empty string if none is printed."),
            method: nullableStr("Test method as printed, or null."),
            page: { type: ["integer", "null"], description: "1-based page number where the result appears." },
            quote: str("The full line or table row the result was read from, copied exactly."),
          },
          required: ["property", "printedName", "printedValue", "value", "printedUnit", "method", "page", "quote"],
        },
      },
      remarks: nullableStr("Anything that limits the use of these results (for example a sampling note), or null."),
    },
    required: ["documentType", "laboratory", "reportDate", "reportReference", "sampleDescription", "findings", "remarks"],
  };
}

/** Instructions for the model. It transcribes; it never judges, converts or infers. */
export function readingInstructions(): string {
  const catalogue = PROPERTY_KEYS.map((k) => `- ${k}: ${PROPERTIES[k].label}. ${PROPERTIES[k].help}`).join("\n");
  return [
    "You transcribe results from an industrial laboratory test report. You do not interpret them.",
    "Rules:",
    "1. Copy only results that are printed in the document. Never calculate, convert units, average, round or infer a value.",
    "2. Ignore specification limits, targets, acceptance criteria, typical values and method detection limits. Only measured results.",
    "3. Map a parameter to a catalogue key only when the printed name clearly means that property. Otherwise use none.",
    "4. If a result is not a single number (for example <0.05, ND, BDL, a range or text), set value to null and keep printedValue exactly as printed.",
    "5. quote must be the exact text of the row or line the result comes from. page is the 1-based page number.",
    "6. If the document is not a laboratory report, return an empty findings list and say so in remarks.",
    "Property catalogue:",
    catalogue,
  ].join("\n");
}

/* ------------------------------------------------------------------------ */
/* Deterministic checks on the transcription                                */
/* ------------------------------------------------------------------------ */

/**
 * Map a unit as printed to a registered unit valid for the property, or null.
 * Done in code rather than by the model, because "%" means a mass fraction for
 * composition but a plain percentage for test results such as expansion.
 */
export function resolveUnit(property: PropertyKey, printed: string): UnitId | null {
  const dim = PROPERTIES[property].dimension;
  const u = printed.toLowerCase().replace(/\s+/g, "").replace(/[()[\]]/g, "");
  const pick = (id: UnitId) => (UNITS[id].dimension === dim ? id : null);
  if (u === "" || u === "-" || u === "ratio") return pick("-");
  if (/mg\/kg|mgkg-?1|mg\.kg/.test(u)) return pick("mg/kg");
  if (/^ppm/.test(u)) return pick("ppm");
  if (/^g\/kg/.test(u)) return pick("g/kg");
  if (/^(µm|μm|um|micron)/.test(u)) return pick("µm");
  if (u === "mm") return pick("mm");
  if (u === "cm") return pick("cm");
  if (/^g\/(cm3|cm³|cc)/.test(u)) return pick("g/cm3");
  if (/^kg\/m(3|³)/.test(u)) return pick("kg/m3");
  if (/^t\/m(3|³)/.test(u)) return pick("t/m3");
  if (u.startsWith("%") || u.startsWith("percent") || u.startsWith("wt%") || u.startsWith("mass%")) {
    return dim === "mass_fraction" ? "%" : dim === "percent" ? "pct" : null;
  }
  return null;
}

/** Numbers printed in a line, read with either "." or "," as the decimal mark. */
function numbersIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d,.]*\d|\d|\.\d+/g)) {
    const t = m[0];
    const candidates = [t.replace(/,/g, ""), t.replace(/\./g, "").replace(",", "."), t.replace(/,/g, ".")];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n)) out.push(n);
    }
  }
  return out;
}

/** True when the value is printed in the quoted line (guards against a value the model made up). */
export function valueAppearsInQuote(value: number, quote: string): boolean {
  return numbersIn(quote).some((n) => Math.abs(n - value) <= 1e-9 * Math.max(1, Math.abs(value)));
}

export type FindingFlag =
  | "not_in_catalogue"
  | "not_a_single_number"
  | "unit_not_recognised"
  | "out_of_range"
  | "value_not_in_quote"
  | "not_found_in_document"
  | "reported_twice"
  | "differs_from_record";

export const FLAG_TEXT: Record<FindingFlag, string> = {
  not_in_catalogue: "This parameter is not one the engine uses.",
  not_a_single_number: "Printed as a limit, range or text, not a single number. Decide how to record it and enter it by hand if needed.",
  unit_not_recognised: "The printed unit does not fit this property.",
  out_of_range: "Outside the physically plausible range for this property.",
  value_not_in_quote: "The number was not found in the quoted line. Check it against the report.",
  not_found_in_document: "The parameter name or value was not found in the text of the report. Check it against the report.",
  reported_twice: "The report gives this property more than once. Choose one.",
  differs_from_record: "Differs from the value already on the profile.",
};

const BLOCKING: FindingFlag[] = ["not_in_catalogue", "not_a_single_number", "unit_not_recognised", "out_of_range", "value_not_in_quote", "not_found_in_document"];

/** Lower-case text with markdown table and emphasis marks and all whitespace removed, for loose containment checks. */
const compact = (t: string) => t.normalize("NFKC").toLowerCase().replace(/[|*_#`>\\]/g, " ").replace(/\s+/g, "");

export interface ReviewedFinding {
  index: number;
  raw: RawFinding;
  property: PropertyKey | null;
  unit: UnitId | null;
  flags: FindingFlag[];
  /** Can be saved once a person ticks it. */
  selectable: boolean;
  /** Ticked by default: selectable and not ambiguous. */
  suggested: boolean;
  existing: Pick<Measurement, "value" | "unit" | "verification"> | null;
}

/**
 * Apply the deterministic checks to every transcribed result. When the
 * provider supplies the document's own text (from OCR), each result's printed
 * name and value must also appear in it.
 */
export function reviewReading(reading: ReportReading, material: Pick<Material, "measurements">, documentText: string | null = null): ReviewedFinding[] {
  const doc = documentText === null ? null : compact(documentText);
  const counts = new Map<string, number>();
  for (const f of reading.findings) if (isPropertyKey(f.property)) counts.set(f.property, (counts.get(f.property) ?? 0) + 1);

  return reading.findings.map((raw, index) => {
    const flags: FindingFlag[] = [];
    const property = isPropertyKey(raw.property) ? raw.property : null;
    if (!property) flags.push("not_in_catalogue");
    if (raw.value === null || /[<>≤≥]|\bnd\b|\bbdl\b|n\.d\./i.test(raw.printedValue)) flags.push("not_a_single_number");
    const unit = property ? resolveUnit(property, raw.printedUnit) : null;
    if (property && !unit) flags.push("unit_not_recognised");
    if (property && unit && raw.value !== null) {
      const def = PROPERTIES[property];
      const canonical = convert(raw.value, unit, def.canonicalUnit);
      if (canonical < def.range.min || canonical > def.range.max) flags.push("out_of_range");
    }
    if (raw.value !== null && !valueAppearsInQuote(raw.value, raw.quote)) flags.push("value_not_in_quote");
    if (doc !== null && documentText !== null && (!doc.includes(compact(raw.printedName)) || (raw.value !== null && !valueAppearsInQuote(raw.value, documentText)))) {
      flags.push("not_found_in_document");
    }
    if (property && (counts.get(property) ?? 0) > 1) flags.push("reported_twice");
    const prev = property ? material.measurements.find((m) => m.property === property) : undefined;
    if (prev && unit && raw.value !== null && (prev.value !== raw.value || prev.unit !== unit)) flags.push("differs_from_record");

    const selectable = !flags.some((f) => BLOCKING.includes(f));
    return {
      index,
      raw,
      property,
      unit,
      flags,
      selectable,
      suggested: selectable && !flags.includes("reported_twice"),
      existing: prev ? { value: prev.value, unit: prev.unit, verification: prev.verification } : null,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* Turning confirmed values into a profile update                            */
/* ------------------------------------------------------------------------ */

export interface ConfirmedValue {
  property: PropertyKey;
  value: number;
  unit: UnitId;
  method: string | null;
  page: number | null;
}

export interface ReportDocument {
  /** Every kind of evidence the report provides. One combined report can be several. */
  types: EvidenceDocType[];
  laboratory: string | null;
  date: string | null;
  reference: string | null;
}

/** Document types to suggest: the model's classification plus the report types that normally carry the properties found. */
export function suggestDocTypes(reading: Pick<ReportReading, "documentType">, properties: PropertyKey[]): EvidenceDocType[] {
  const out = new Set<EvidenceDocType>();
  if ((DOC_TYPES as string[]).includes(reading.documentType)) out.add(reading.documentType as EvidenceDocType);
  for (const p of properties) {
    for (const [doc, props] of Object.entries(TEST_PACKAGES) as [EvidenceDocType, PropertyKey[]][]) if (props.includes(p)) out.add(doc);
  }
  return DOC_TYPES.filter((t) => out.has(t));
}

/** The editable part of a stored material, ready to be modified and saved. */
export function toMaterialInput(m: Material): MaterialInput {
  const { name, family, sourceProcess, description, location, volume, hazard, currentHandling, measurements, documents } = structuredClone(m);
  return { name, family, sourceProcess, description, location, volume, hazard, currentHandling, measurements, documents };
}

/**
 * Merge confirmed values into a material. Each confirmed value replaces any
 * earlier value for the same property and is recorded as user-supplied,
 * laboratory-reported, with a note saying how it was transcribed. Each kind
 * of evidence the report provides becomes a document record, replacing a
 * matching "requested" placeholder where one exists.
 */
export function applyConfirmedValues(
  material: Material,
  values: ConfirmedValue[],
  doc: ReportDocument | null,
  context: { documentId: string; fileName: string; confirmedBy: string; confirmedOn: string },
): MaterialInput {
  const input = toMaterialInput(material);
  const recorded: MaterialDocument[] = [];

  for (const [i, type] of (doc?.types ?? []).entries()) {
    const requested = input.documents.find((d) => d.type === type && d.status === "requested");
    const record: MaterialDocument = {
      id: requested?.id ?? (i === 0 ? context.documentId : `${context.documentId}-${i + 1}`),
      type,
      title: `${DOC_LABELS[type]}${doc!.reference ? `, ${doc!.reference}` : ""}`.slice(0, 200),
      status: "available_unverified",
      issuedBy: doc!.laboratory?.slice(0, 200) || undefined,
      date: doc!.date?.slice(0, 40) || undefined,
      provenance: "user_supplied",
      note: `Uploaded as "${context.fileName}" and read with AI assistance; values confirmed by ${context.confirmedBy} on ${context.confirmedOn}.`.slice(0, 500),
    };
    input.documents = requested ? input.documents.map((d) => (d.id === requested.id ? record : d)) : [...input.documents, record];
    recorded.push(record);
  }
  // Link each value to the recorded document that normally carries it, else to the first one.
  const documentFor = (p: PropertyKey) => (recorded.find((d) => TEST_PACKAGES[d.type].includes(p)) ?? recorded[0])?.id;

  for (const v of values) {
    const measurement: Measurement = {
      property: v.property,
      value: v.value,
      unit: v.unit,
      provenance: "user_supplied",
      verification: "lab_reported",
      method: v.method?.slice(0, 200) || undefined,
      documentId: documentFor(v.property),
      note: `Transcribed with AI assistance from "${context.fileName}"${v.page ? `, page ${v.page}` : ""}; checked and confirmed by ${context.confirmedBy} on ${context.confirmedOn}.`.slice(0, 500),
    };
    input.measurements = [...input.measurements.filter((m) => m.property !== v.property), measurement];
  }
  return input;
}
