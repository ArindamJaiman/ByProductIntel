import "server-only";
import { readingInstructions, readingJsonSchema, readingSchema, type ReportReading } from "@/domain/report-reading";

/**
 * Google Gemini client for transcribing lab reports. Server-side only: the
 * key is read from GEMINI_API_KEY and never sent to the browser. Requests go
 * straight to the public REST endpoint; no SDK is needed.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const FALLBACK_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 50_000;

export const READABLE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
/** Kept under Vercel's 4.5 MB request limit, with room for form overhead. */
export const MAX_REPORT_BYTES = 4 * 1024 * 1024;

/** Outside services can be switched off without removing keys, e.g. for offline tests or a locked-down demo. */
export const externalServicesDisabled = () => process.env.BPI_DISABLE_EXTERNAL_SERVICES === "1";

export function geminiConfigured(): boolean {
  return !externalServicesDisabled() && Boolean(process.env.GEMINI_API_KEY?.trim());
}

export class ReadingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadingError";
  }
}

const DEFAULT_MODEL = "gemini-flash-latest";

/** Model ids to try in order. A display name such as "Gemini 3.8" is normalised; an unusable one is skipped at call time. */
function models(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim().replace(/^models\//i, "").toLowerCase().replace(/\s+/g, "-");
  return [...new Set([configured, DEFAULT_MODEL, FALLBACK_MODEL].filter((m): m is string => Boolean(m) && /^[a-z0-9][a-z0-9.-]*$/.test(m!)))];
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { code?: number; status?: string; message?: string };
}

async function call(model: string, body: unknown, key: string): Promise<{ status: number; json: GeminiResponse }> {
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as GeminiResponse };
}

/**
 * Transcribe a lab report. Retries once on the fallback model when the first
 * is overloaded or rate-limited. The model's JSON is validated before use;
 * anything malformed is rejected rather than repaired.
 */
export async function transcribeReport(bytes: Uint8Array, mimeType: string): Promise<{ reading: ReportReading; model: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || !geminiConfigured()) throw new ReadingError("The lab report reader is not configured on this server.");

  const body = {
    systemInstruction: { parts: [{ text: readingInstructions() }] },
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } },
          { text: "Transcribe the measured results in this report." },
        ],
      },
    ],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseJsonSchema: readingJsonSchema() },
  };

  let last = "";
  for (const model of models()) {
    let status: number;
    let json: GeminiResponse;
    try {
      ({ status, json } = await call(model, body, key));
    } catch (e) {
      last = (e as Error).name === "TimeoutError" ? "The reading service took too long to answer." : "The reading service could not be reached.";
      continue;
    }
    if (status === 429 || status >= 500) {
      last = status === 429 ? "The free reading quota is used up for now. Try again in a few minutes." : "The reading service is busy. Try again shortly.";
      continue;
    }
    if ((status === 400 && /model/i.test(json.error?.message ?? "")) || status === 404) {
      // GEMINI_MODEL names a model this key cannot use; fall through to the default.
      console.warn(`[lab-report] model "${model}" is not available (HTTP ${status}); trying the next model.`);
      last = "The configured reading model is not available.";
      continue;
    }
    if (status !== 200) {
      console.error(`[lab-report] ${model} returned HTTP ${status}: ${json.error?.status ?? ""} ${json.error?.message?.slice(0, 300) ?? ""} (${bytes.byteLength} bytes, ${mimeType})`);
      throw new ReadingError(status === 400 ? "The file could not be read. Upload a PDF or a clear image of the report." : `The reading service refused the request (HTTP ${status}).`);
    }
    if (json.promptFeedback?.blockReason) throw new ReadingError("The reading service declined to process this file.");
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      last = "The reading service returned an answer that could not be understood.";
      continue;
    }
    const checked = readingSchema.safeParse(parsed);
    if (!checked.success) {
      last = "The reading service returned an answer in an unexpected shape.";
      continue;
    }
    return { reading: checked.data, model: json.modelVersion ?? model };
  }
  throw new ReadingError(last || "The report could not be read.");
}
