/**
 * Unit registry and tested conversion functions.
 *
 * Every measurement in the system carries a unit. Comparisons between a
 * material measurement and an application requirement are only made after
 * converting both into the property's canonical unit. Converting between
 * different physical dimensions throws — it is never silently coerced.
 */

export type Dimension =
  | "mass_fraction" // composition: %, mg/kg, g/kg, ppm
  | "percent" // test results expressed as a percentage that is NOT a mass fraction (expansion, absorption, SAI…)
  | "length"
  | "density"
  | "dimensionless"
  | "annual_mass"
  | "currency_per_tonne"
  | "currency_per_tonne_km"
  | "distance";

export interface UnitDef {
  id: string;
  label: string;
  dimension: Dimension;
  /** Multiply a value in this unit by `toCanonical` to obtain the dimension's canonical unit. */
  toCanonical: number;
}

export const UNITS = {
  "%": { id: "%", label: "%", dimension: "mass_fraction", toCanonical: 1 },
  "g/kg": { id: "g/kg", label: "g/kg", dimension: "mass_fraction", toCanonical: 0.1 },
  "mg/kg": { id: "mg/kg", label: "mg/kg", dimension: "mass_fraction", toCanonical: 0.0001 },
  ppm: { id: "ppm", label: "ppm (mass)", dimension: "mass_fraction", toCanonical: 0.0001 },
  "pct": { id: "pct", label: "%", dimension: "percent", toCanonical: 1 },
  mm: { id: "mm", label: "mm", dimension: "length", toCanonical: 1 },
  "µm": { id: "µm", label: "µm", dimension: "length", toCanonical: 0.001 },
  cm: { id: "cm", label: "cm", dimension: "length", toCanonical: 10 },
  "g/cm3": { id: "g/cm3", label: "g/cm³", dimension: "density", toCanonical: 1 },
  "kg/m3": { id: "kg/m3", label: "kg/m³", dimension: "density", toCanonical: 0.001 },
  "t/m3": { id: "t/m3", label: "t/m³", dimension: "density", toCanonical: 1 },
  "-": { id: "-", label: "(ratio)", dimension: "dimensionless", toCanonical: 1 },
  "t/yr": { id: "t/yr", label: "t/yr", dimension: "annual_mass", toCanonical: 1 },
  "kt/yr": { id: "kt/yr", label: "kt/yr", dimension: "annual_mass", toCanonical: 1000 },
  "INR/t": { id: "INR/t", label: "₹/t", dimension: "currency_per_tonne", toCanonical: 1 },
  "INR/t-km": { id: "INR/t-km", label: "₹/t·km", dimension: "currency_per_tonne_km", toCanonical: 1 },
  km: { id: "km", label: "km", dimension: "distance", toCanonical: 1 },
} as const satisfies Record<string, UnitDef>;

export type UnitId = keyof typeof UNITS;

export const UNIT_IDS = Object.keys(UNITS) as UnitId[];

export class UnitMismatchError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Cannot convert ${from} to ${to}: incompatible dimensions`);
    this.name = "UnitMismatchError";
  }
}

export class UnknownUnitError extends Error {
  constructor(public readonly unit: string) {
    super(`Unknown unit "${unit}"`);
    this.name = "UnknownUnitError";
  }
}

export function isUnitId(value: string): value is UnitId {
  return Object.prototype.hasOwnProperty.call(UNITS, value);
}

export function getUnit(id: string): UnitDef {
  if (!isUnitId(id)) throw new UnknownUnitError(id);
  return UNITS[id];
}

export function unitsCompatible(a: string, b: string): boolean {
  if (!isUnitId(a) || !isUnitId(b)) return false;
  return UNITS[a].dimension === UNITS[b].dimension;
}

/**
 * Convert `value` from one unit to another. Throws on unknown units, on
 * incompatible dimensions and on non-finite input.
 */
export function convert(value: number, from: string, to: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Cannot convert non-finite value ${value}`);
  }
  const f = getUnit(from);
  const t = getUnit(to);
  if (f.dimension !== t.dimension) throw new UnitMismatchError(from, to);
  if (f.id === t.id) return value;
  // Round to 12 significant digits to suppress binary floating point noise
  // (e.g. 0.1 * 3) without materially changing any engineering value.
  return Number(((value * f.toCanonical) / t.toCanonical).toPrecision(12));
}

export function unitLabel(id: string): string {
  return isUnitId(id) ? UNITS[id].label : id;
}
