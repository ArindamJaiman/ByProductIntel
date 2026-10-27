import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MATERIALS } from "@/data/seed";
import { reviewReading, type ReportReading } from "@/domain/report-reading";
import { readerProviders, transcribeReport } from "@/server/reading";
import { readWithMistral } from "@/server/reading/mistral";

const READING: ReportReading = {
  documentType: "oil_grease_analysis",
  laboratory: "Demo Analytical Laboratory (synthetic)",
  reportDate: "08 October 2026",
  reportReference: "DAL/2026/OG-0417",
  sampleDescription: null,
  findings: [
    {
      property: "oil_content",
      printedName: "Oil and grease content",
      printedValue: "0.42",
      value: 0.42,
      printedUnit: "% (w/w)",
      method: "Solvent extraction",
      page: 1,
      quote: "Oil and grease content | Solvent extraction | % (w/w) | 0.42",
    },
  ],
  remarks: null,
};
const OCR_TEXT = "| S. No. | Parameter | Method | Unit | Result |\n|---|---|---|---|---|\n| 1 | Oil and grease content | Solvent extraction | % (w/w) | 0.42 |";
const PDF = new Uint8Array([37, 80, 68, 70]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Call = { url: string; body: Record<string, unknown> };

function mockFetch(handler: (url: string, body: Record<string, unknown>, calls: Call[]) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, body });
      return handler(url, body, calls);
    }),
  );
  return calls;
}

const mistralOk = (url: string) =>
  url.endsWith("/ocr")
    ? json({ pages: [{ index: 0, markdown: OCR_TEXT }] })
    : json({ choices: [{ message: { content: JSON.stringify(READING) } }] });

beforeEach(() => {
  vi.stubEnv("BPI_DISABLE_EXTERNAL_SERVICES", "");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini");
  vi.stubEnv("GEMINI_MODEL", "");
  vi.stubEnv("MISTRAL_API_KEY", "test-mistral");
  vi.stubEnv("MISTRAL_MODEL", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Mistral reader", () => {
  it("runs OCR on the file, then transcribes from the OCR text into the shared schema", async () => {
    const calls = mockFetch(mistralOk);
    const out = await readWithMistral(PDF, "application/pdf");
    expect(out.provider).toBe("Mistral");
    expect(out.reading.findings[0].value).toBe(0.42);
    expect(out.documentText).toContain("--- Page 1 ---");
    expect(calls[0].url).toMatch(/\/v1\/ocr$/);
    expect(calls[0].body.document).toMatchObject({ type: "document_url" });
    expect(String((calls[0].body.document as { document_url: string }).document_url)).toMatch(/^data:application\/pdf;base64,/);
    expect(calls[1].body.response_format).toMatchObject({ type: "json_schema" });
    expect(JSON.stringify(calls[1].body.messages)).toContain("Oil and grease content");
  });

  it("sends images as image_url", async () => {
    const calls = mockFetch(mistralOk);
    await readWithMistral(PDF, "image/png");
    expect(calls[0].body.document).toMatchObject({ type: "image_url" });
  });

  it("falls back to JSON mode when the strict schema form is refused", async () => {
    const calls = mockFetch((url, body) =>
      url.endsWith("/ocr")
        ? mistralOk(url)
        : (body.response_format as { type: string }).type === "json_schema"
          ? json({ message: "invalid schema" }, 400)
          : json({ choices: [{ message: { content: [{ type: "text", text: JSON.stringify(READING) }] } }] }),
    );
    const out = await readWithMistral(PDF, "application/pdf");
    expect(out.reading.reportReference).toBe("DAL/2026/OG-0417");
    expect(calls.map((c) => (c.body.response_format as { type?: string } | undefined)?.type)).toEqual([undefined, "json_schema", "json_object"]);
  });

  it("explains a missing or used-up quota, and rejects malformed answers", async () => {
    mockFetch(() => json({ message: "Rate limit exceeded" }, 429));
    await expect(readWithMistral(PDF, "application/pdf")).rejects.toThrow(/quota/);
    mockFetch((url) => (url.endsWith("/ocr") ? mistralOk(url) : json({ choices: [{ message: { content: "{\"findings\": 3}" } }] })));
    await expect(readWithMistral(PDF, "application/pdf")).rejects.toThrow(/could not be used/);
  });
});

describe("Reader fallback", () => {
  it("uses Mistral when Gemini is busy", async () => {
    const calls = mockFetch((url) => (url.includes("generativelanguage") ? json({ error: { status: "UNAVAILABLE" } }, 503) : mistralOk(url)));
    const out = await transcribeReport(PDF, "application/pdf");
    expect(out.provider).toBe("Mistral");
    expect(calls.filter((c) => c.url.includes("generativelanguage"))).toHaveLength(2);
  });

  it("keeps Gemini as the first choice when it works", async () => {
    mockFetch((url) =>
      url.includes("generativelanguage")
        ? json({ candidates: [{ content: { parts: [{ text: JSON.stringify(READING) }] } }], modelVersion: "gemini-test" })
        : json({}, 500),
    );
    const out = await transcribeReport(PDF, "application/pdf");
    expect(out).toMatchObject({ provider: "Gemini", model: "gemini-test", documentText: null });
  });

  it("names every reason when all readers fail", async () => {
    mockFetch((url) => (url.includes("generativelanguage") ? json({}, 429) : json({ message: "Rate limit exceeded" }, 429)));
    await expect(transcribeReport(PDF, "application/pdf")).rejects.toThrow(/Gemini's free quota.*Mistral's quota/);
  });

  it("says when a key is rejected rather than blaming the file", async () => {
    mockFetch((url) => (url.includes("generativelanguage") ? json({ error: { message: "API key not valid. Please pass a valid API key." } }, 400) : json({}, 401)));
    const err = await transcribeReport(PDF, "application/pdf").catch((e: Error) => e.message);
    expect(err).toMatch(/Gemini rejected the API key.*Mistral rejected the API key/);
    expect(err).not.toMatch(/Try again/);
  });

  it("lists only configured readers, and none when outside services are switched off", () => {
    expect(readerProviders()).toEqual(["Gemini", "Mistral"]);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(readerProviders()).toEqual(["Mistral"]);
    vi.stubEnv("BPI_DISABLE_EXTERNAL_SERVICES", "1");
    expect(readerProviders()).toEqual([]);
  });
});

describe("Checking results against the document's own text", () => {
  const material = MATERIALS.find((m) => m.id === "mat-mill-scale")!;

  it("accepts a result whose name and value appear in the OCR text, table marks and line breaks aside", () => {
    const [r] = reviewReading(READING, material, OCR_TEXT.replace("Oil and grease content", "Oil and grease\ncontent"));
    expect(r.flags).not.toContain("not_found_in_document");
    expect(r.selectable).toBe(true);
  });

  it("blocks a result the document does not contain", () => {
    const invented = { ...READING, findings: [{ ...READING.findings[0], printedName: "Oil content (hexane)" }] };
    const [r] = reviewReading(invented, material, OCR_TEXT);
    expect(r.flags).toContain("not_found_in_document");
    expect(r.selectable).toBe(false);
    const wrongValue = { ...READING, findings: [{ ...READING.findings[0], value: 0.24, printedValue: "0.24", quote: "Oil and grease content 0.24" }] };
    expect(reviewReading(wrongValue, material, OCR_TEXT)[0].flags).toContain("not_found_in_document");
  });

  it("skips the check when no document text is available", () => {
    expect(reviewReading(READING, material, null)[0].flags).not.toContain("not_found_in_document");
  });
});
