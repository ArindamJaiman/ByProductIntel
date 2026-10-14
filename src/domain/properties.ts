import type { Dimension, UnitId } from "./units";

/**
 * Catalogue of measurable material properties. A property must be registered
 * here before a material measurement or an application requirement can refer
 * to it. The catalogue defines the canonical unit, the plausible numeric range
 * used for input validation, and the group that drives Missing-Bridge action
 * categories.
 */

export type PropertyGroup =
  | "composition"
  | "physical"
  | "stability"
  | "performance"
  | "contamination";

export interface PropertyDef {
  key: string;
  label: string;
  dimension: Dimension;
  canonicalUnit: UnitId;
  group: PropertyGroup;
  /** Physically plausible bounds in the canonical unit. Values outside are rejected as invalid input. */
  range: { min: number; max: number };
  /** Plain-language explanation shown as a tooltip. */
  help: string;
}

const P = <K extends string>(defs: Record<K, Omit<PropertyDef, "key">>) =>
  Object.fromEntries(
    Object.entries(defs).map(([key, def]) => [key, { key, ...(def as object) }]),
  ) as Record<K, PropertyDef>;

export const PROPERTIES = P({
  cao: {
    label: "Calcium oxide (CaO)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Total calcium expressed as CaO, typically from XRF analysis.",
  },
  sio2: {
    label: "Silicon dioxide (SiO₂)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Total silicon expressed as SiO₂.",
  },
  al2o3: {
    label: "Aluminium oxide (Al₂O₃)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Total aluminium expressed as Al₂O₃.",
  },
  fe2o3: {
    label: "Iron oxide (Fe₂O₃)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Total iron expressed as Fe₂O₃.",
  },
  mgo: {
    label: "Magnesium oxide (MgO)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Total magnesium expressed as MgO. Periclase (free MgO) can contribute to long-term expansion.",
  },
  so3: {
    label: "Sulfur trioxide (SO₃)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Sulfur expressed as SO₃.",
  },
  sio2_al2o3_fe2o3: {
    label: "SiO₂ + Al₂O₃ + Fe₂O₃",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Sum of the three oxides. Calculated automatically when all three are measured and the sum is not reported.",
  },
  fe_total: {
    label: "Total iron (Fe)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Total metallic and oxidised iron expressed as elemental Fe.",
  },
  free_cao: {
    label: "Free lime (free CaO)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "stability",
    range: { min: 0, max: 100 },
    help: "Unreacted lime that can hydrate and expand in the presence of moisture. A key volume-stability indicator for steel slags.",
  },
  loi: {
    label: "Loss on ignition (LOI)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "composition",
    range: { min: 0, max: 100 },
    help: "Mass lost on heating; for fly ash this mostly reflects unburnt carbon.",
  },
  moisture: {
    label: "Moisture content",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "physical",
    range: { min: 0, max: 100 },
    help: "Free water content as received.",
  },
  fineness_45um_retained: {
    label: "Retained on 45 µm sieve",
    dimension: "percent",
    canonicalUnit: "pct",
    group: "physical",
    range: { min: 0, max: 100 },
    help: "Share of particles retained on a 45 µm sieve after wet sieving. Lower means finer.",
  },
  strength_activity_index_28d: {
    label: "Strength activity index, 28 d",
    dimension: "percent",
    canonicalUnit: "pct",
    group: "performance",
    range: { min: 0, max: 200 },
    help: "Mortar strength with the material relative to a control mix at 28 days.",
  },
  volumetric_expansion: {
    label: "Volumetric expansion",
    dimension: "percent",
    canonicalUnit: "pct",
    group: "stability",
    range: { min: 0, max: 100 },
    help: "Expansion measured in an accelerated volume-stability test. The method used materially affects the result.",
  },
  water_absorption: {
    label: "Water absorption",
    dimension: "percent",
    canonicalUnit: "pct",
    group: "physical",
    range: { min: 0, max: 100 },
    help: "Water absorbed by aggregate particles, by mass.",
  },
  la_abrasion: {
    label: "Los Angeles abrasion loss",
    dimension: "percent",
    canonicalUnit: "pct",
    group: "physical",
    range: { min: 0, max: 100 },
    help: "Mass loss in the Los Angeles abrasion test. Lower means more abrasion resistant.",
  },
  specific_gravity: {
    label: "Specific gravity",
    dimension: "dimensionless",
    canonicalUnit: "-",
    group: "physical",
    range: { min: 0.5, max: 8 },
    help: "Particle density relative to water.",
  },
  glass_content: {
    label: "Glass content",
    dimension: "percent",
    canonicalUnit: "pct",
    group: "performance",
    range: { min: 0, max: 100 },
    help: "Share of amorphous (glassy) phase, which governs latent hydraulic reactivity in granulated slag.",
  },
  max_particle_size: {
    label: "Maximum particle size",
    dimension: "length",
    canonicalUnit: "mm",
    group: "physical",
    range: { min: 0, max: 1000 },
    help: "Upper size of the supplied grading.",
  },
  clay_content: {
    label: "Clay / fines content",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "physical",
    range: { min: 0, max: 100 },
    help: "Fine clay binder content, relevant for spent green foundry sand.",
  },
  chromium_total: {
    label: "Total chromium (Cr)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "contamination",
    range: { min: 0, max: 100 },
    help: "Total chromium content. Total content alone does not establish leachability or speciation.",
  },
  lead_total: {
    label: "Total lead (Pb)",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "contamination",
    range: { min: 0, max: 100 },
    help: "Total lead content. Total content alone does not establish leachability.",
  },
  oil_content: {
    label: "Oil and grease content",
    dimension: "mass_fraction",
    canonicalUnit: "%",
    group: "contamination",
    range: { min: 0, max: 100 },
    help: "Residual rolling oil and grease, relevant to handling, thermal processing emissions and storage run-off.",
  },
} satisfies Record<string, Omit<PropertyDef, "key">>);

export type PropertyKey = keyof typeof PROPERTIES;

export const PROPERTY_KEYS = Object.keys(PROPERTIES) as PropertyKey[];

export function isPropertyKey(value: string): value is PropertyKey {
  return Object.prototype.hasOwnProperty.call(PROPERTIES, value);
}

export function getProperty(key: PropertyKey): PropertyDef {
  return PROPERTIES[key];
}

/** Oxides that participate in the composition-closure consistency check. */
export const CLOSURE_OXIDES: PropertyKey[] = ["cao", "sio2", "al2o3", "fe2o3", "mgo", "so3"];
