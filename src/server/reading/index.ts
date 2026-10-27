import "server-only";
import { geminiConfigured, readWithGemini } from "./gemini";
import { mistralConfigured, readWithMistral } from "./mistral";
import { ReadingError, type ProviderReading, type ReaderName } from "./shared";

export { MAX_REPORT_BYTES, READABLE_TYPES, ReadingError } from "./shared";
export type { ProviderReading, ReaderName } from "./shared";

/** Configured readers, in the order they are tried. */
export function readerProviders(): ReaderName[] {
  return [geminiConfigured() && ("Gemini" as const), mistralConfigured() && ("Mistral" as const)].filter((p): p is ReaderName => Boolean(p));
}

export function readerConfigured(): boolean {
  return readerProviders().length > 0;
}

const READERS: Record<ReaderName, (bytes: Uint8Array, mimeType: string) => Promise<ProviderReading>> = {
  Gemini: readWithGemini,
  Mistral: readWithMistral,
};

/**
 * Read a report with the first reader that succeeds: Gemini, then Mistral as
 * the backup. If every configured reader fails, the error names each reason.
 */
export async function transcribeReport(bytes: Uint8Array, mimeType: string): Promise<ProviderReading> {
  const providers = readerProviders();
  if (providers.length === 0) throw new ReadingError("The lab report reader is not configured on this server.");
  const reasons: string[] = [];
  for (const name of providers) {
    try {
      return await READERS[name](bytes, mimeType);
    } catch (e) {
      const reason = e instanceof ReadingError ? e.message : `${name} failed unexpectedly.`;
      reasons.push(reason);
      if (providers.length > 1) console.warn(`[lab-report] ${name} failed: ${reason}`);
    }
  }
  const transient = reasons.every((r) => /quota|busy|too long|reached/i.test(r));
  throw new ReadingError(`The report could not be read. ${reasons.join(" ")}${transient ? " Try again in a few minutes." : ""}`);
}
