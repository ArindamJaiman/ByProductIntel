import "server-only";
import { readingInstructions, readingJsonSchema } from "@/domain/report-reading";
import { ReadingError, externalServicesDisabled, parseReading, type ProviderReading } from "./shared";

/**
 * Google Gemini reader. Server-side only: the key is read from GEMINI_API_KEY
 * and never sent to the browser. Requests go straight to the public REST
 * endpoint; no SDK is needed.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-flash-latest";
const FALLBACK_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 50_000;

export function geminiConfigured(): boolean {
  return !externalServicesDisabled() && Boolean(process.env.GEMINI_API_KEY?.trim());
}

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
 * Transcribe a lab report with Gemini, reading the file directly. Retries on
 * the fallback model when the first is overloaded, rate-limited or not
 * available to this key.
 */
export async function readWithGemini(bytes: Uint8Array, mimeType: string): Promise<ProviderReading> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || !geminiConfigured()) throw new ReadingError("Gemini is not configured.");

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
      last = (e as Error).name === "TimeoutError" ? "Gemini took too long to answer." : "Gemini could not be reached.";
      continue;
    }
    if (status === 429 || status >= 500) {
      last = status === 429 ? "Gemini's free quota is used up for now." : "Gemini is busy.";
      continue;
    }
    if ((status === 400 && /model/i.test(json.error?.message ?? "")) || status === 404) {
      // GEMINI_MODEL names a model this key cannot use; fall through to the default.
      console.warn(`[lab-report] Gemini model "${model}" is not available (HTTP ${status}); trying the next model.`);
      last = "The configured Gemini model is not available.";
      continue;
    }
    if (status !== 200) {
      console.error(`[lab-report] Gemini ${model} returned HTTP ${status}: ${json.error?.status ?? ""} ${json.error?.message?.slice(0, 300) ?? ""} (${bytes.byteLength} bytes, ${mimeType})`);
      const keyProblem = status === 401 || status === 403 || /api key/i.test(json.error?.message ?? "");
      throw new ReadingError(keyProblem ? "Gemini rejected the API key." : status === 400 ? "Gemini could not read the file." : `Gemini refused the request (HTTP ${status}).`);
    }
    if (json.promptFeedback?.blockReason) throw new ReadingError("Gemini declined to process this file.");
    const reading = parseReading(json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "");
    if (!reading) {
      last = "Gemini returned an answer that could not be used.";
      continue;
    }
    return { reading, provider: "Gemini", model: json.modelVersion ?? model, documentText: null };
  }
  throw new ReadingError(last || "Gemini could not read the report.");
}
