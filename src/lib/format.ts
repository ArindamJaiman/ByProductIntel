/** Deterministic formatting (fixed locale and time zone) so server and client output match. */

const LOCALE = "en-IN";

export function fmtNumber(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtTonnes(v: number | null | undefined): string {
  return v === null || v === undefined ? "Not reported" : `${fmtNumber(v)} t/yr`;
}

export function fmtInr(v: number | null | undefined, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  const sign = v < 0 ? "−" : "";
  return `${sign}₹${fmtNumber(Math.abs(v))}${suffix}`;
}

export function fmtInrCompact(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${fmtNumber(a / 1e7, 2)} crore`;
  if (a >= 1e5) return `${sign}₹${fmtNumber(a / 1e5, 1)} lakh`;
  return `${sign}₹${fmtNumber(a)}`;
}

export function fmtPct(v: number | null | undefined, digits = 0): string {
  return v === null || v === undefined ? "—" : `${fmtNumber(v * 100, digits)} %`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}
