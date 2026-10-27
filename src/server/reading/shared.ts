import "server-only";
import { readingSchema, type ReportReading } from "@/domain/report-reading";

export const READABLE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
/** Kept under Vercel's 4.5 MB request limit, with room for form overhead. */
export const MAX_REPORT_BYTES = 4 * 1024 * 1024;

/** Outside services can be switched off without removing keys, e.g. for offline tests or a locked-down demo. */
export const externalServicesDisabled = () => process.env.BPI_DISABLE_EXTERNAL_SERVICES === "1";

export class ReadingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadingError";
  }
}

export type ReaderName = "Gemini" | "Mistral";

export interface ProviderReading {
  reading: ReportReading;
  provider: ReaderName;
  model: string;
  /** Text of the document as the provider's OCR saw it, when the provider supplies one. */
  documentText: string | null;
}

/** Parse a model's JSON answer and validate its shape. Malformed output is rejected, never repaired. */
export function parseReading(text: string): ReportReading | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const checked = readingSchema.safeParse(json);
  return checked.success ? checked.data : null;
}
