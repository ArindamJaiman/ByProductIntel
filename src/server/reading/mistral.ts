import "server-only";
import { readingInstructions, readingJsonSchema } from "@/domain/report-reading";
import { ReadingError, externalServicesDisabled, parseReading, type ProviderReading } from "./shared";

/**
 * Mistral reader, used when Gemini cannot answer. Two steps: Mistral OCR turns
 * the file into page-marked text, then a chat model transcribes the results
 * from that text into the same schema. Keeping the OCR text lets the app check
 * that every result it was given really appears in the document.
 */

const BASE = "https://api.mistral.ai/v1";
const OCR_MODEL = "mistral-ocr-latest";
const DEFAULT_CHAT_MODEL = "mistral-small-latest";
const TIMEOUT_MS = 45_000;
const MAX_TEXT_CHARS = 120_000;

export function mistralConfigured(): boolean {
  return !externalServicesDisabled() && Boolean(process.env.MISTRAL_API_KEY?.trim());
}

function chatModel(): string {
  const m = process.env.MISTRAL_MODEL?.trim().toLowerCase().replace(/\s+/g, "-");
  return m && /^[a-z0-9][a-z0-9.-]*$/.test(m) ? m : DEFAULT_CHAT_MODEL;
}

interface MistralError {
  message?: string;
  detail?: unknown;
}

async function post<T>(path: string, body: unknown, key: string): Promise<{ status: number; json: T & MistralError }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T & MistralError };
}

function failure(step: string, status: number): ReadingError {
  if (status === 429) return new ReadingError("Mistral's quota is used up or not active for this key.");
  if (status === 401 || status === 403) return new ReadingError("Mistral rejected the API key.");
  return new ReadingError(`Mistral could not ${step} (HTTP ${status}).`);
}

type ChatContent = string | { type?: string; text?: string }[] | null | undefined;
const contentText = (c: ChatContent) => (typeof c === "string" ? c : (c ?? []).map((p) => p.text ?? "").join(""));

export async function readWithMistral(bytes: Uint8Array, mimeType: string): Promise<ProviderReading> {
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (!key || !mistralConfigured()) throw new ReadingError("Mistral is not configured.");

  const dataUri = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  const document = mimeType === "application/pdf" ? { type: "document_url", document_url: dataUri } : { type: "image_url", image_url: dataUri };

  let ocr;
  try {
    ocr = await post<{ pages?: { index: number; markdown?: string }[] }>("/ocr", { model: OCR_MODEL, document }, key);
  } catch {
    throw new ReadingError("Mistral could not be reached.");
  }
  if (ocr.status !== 200) throw failure("read the file", ocr.status);
  const text = (ocr.json.pages ?? [])
    .map((p) => `--- Page ${p.index + 1} ---\n${p.markdown ?? ""}`)
    .join("\n\n")
    .slice(0, MAX_TEXT_CHARS);
  if (!text.replace(/--- Page \d+ ---/g, "").trim()) throw new ReadingError("Mistral found no text in the file.");

  const model = chatModel();
  const instructions = `${readingInstructions()}\nThe report is supplied as text from optical character recognition, with page markers. Take page numbers from the markers and copy quotes from this text exactly.`;
  const messages = (extra = "") => [
    { role: "system", content: instructions + extra },
    { role: "user", content: `Transcribe the measured results in this report.\n\n${text}` },
  ];
  const schema = readingJsonSchema();

  const attempts = [
    { messages: messages(), response_format: { type: "json_schema", json_schema: { name: "lab_report", schema, strict: true } } },
    // Fallback for when the strict schema form is refused: plain JSON mode with the schema stated in the instructions.
    { messages: messages(`\nReturn only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`), response_format: { type: "json_object" } },
  ];
  for (const [i, attempt] of attempts.entries()) {
    let chat;
    try {
      chat = await post<{ choices?: { message?: { content?: ChatContent } }[] }>("/chat/completions", { model, temperature: 0, ...attempt }, key);
    } catch {
      throw new ReadingError("Mistral could not be reached.");
    }
    if ((chat.status === 400 || chat.status === 422) && i === 0) continue;
    if (chat.status !== 200) throw failure("transcribe the report", chat.status);
    const reading = parseReading(contentText(chat.json.choices?.[0]?.message?.content));
    if (reading) return { reading, provider: "Mistral", model: `${OCR_MODEL} + ${model}`, documentText: text };
  }
  throw new ReadingError("Mistral returned an answer that could not be used.");
}
