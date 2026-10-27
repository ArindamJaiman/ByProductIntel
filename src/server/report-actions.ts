"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isPropertyKey } from "@/domain/properties";
import {
  DOC_TYPES,
  applyConfirmedValues,
  reviewReading,
  type ConfirmedValue,
  type ReportDocument,
  type ReportReading,
  type ReviewedFinding,
} from "@/domain/report-reading";
import { isUnitId } from "@/domain/units";
import { materialInputSchema, validateMaterial } from "@/domain/validation";
import { fmtDate } from "@/lib/format";
import type { FormState } from "./actions";
import { getContext } from "./context";
import { MAX_REPORT_BYTES, READABLE_TYPES, ReadingError, readerConfigured, transcribeReport } from "./reading";
import { allow } from "./rate-limit";

export interface ReadState {
  ok: boolean;
  message?: string;
  result?: { fileName: string; provider: string; model: string; readAt: string; reading: ReportReading; reviewed: ReviewedFinding[] };
}

async function signedIn() {
  const ctx = await getContext();
  if (!ctx.actor) throw new Error("Sign in to read reports.");
  return ctx as typeof ctx & { actor: NonNullable<typeof ctx.actor> };
}

/** Send an uploaded report to the reading service and check what comes back. Nothing is saved. */
export async function readReportAction(_prev: ReadState, formData: FormData): Promise<ReadState> {
  const { repo, actor } = await signedIn();
  if (!readerConfigured()) return { ok: false, message: "The lab report reader is not configured on this server." };

  const material = await repo.getMaterial(String(formData.get("materialId") ?? ""));
  if (!material) return { ok: false, message: "This material no longer exists." };

  const file = formData.get("report");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a report to read." };
  if (file.size > MAX_REPORT_BYTES) return { ok: false, message: "The file is larger than 4 MB. Upload a smaller PDF or image." };
  if (!(READABLE_TYPES as readonly string[]).includes(file.type)) return { ok: false, message: "Upload a PDF, PNG, JPEG or WebP file." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allow(`report:${actor.id}:${ip}`, 5, 10 * 60_000) || !allow("report:all", 60, 60 * 60_000)) {
    return { ok: false, message: "Too many reports read in a short time. Wait a few minutes and try again." };
  }

  try {
    const { reading, provider, model, documentText } = await transcribeReport(new Uint8Array(await file.arrayBuffer()), file.type);
    return {
      ok: true,
      result: { fileName: file.name.slice(0, 200), provider, model, readAt: new Date().toISOString(), reading, reviewed: reviewReading(reading, material, documentText) },
    };
  } catch (e) {
    return { ok: false, message: e instanceof ReadingError ? e.message : "The report could not be read." };
  }
}

const confirmSchema = z.object({
  materialId: z.string().min(1),
  fileName: z.string().min(1).max(200),
  confirmed: z.literal(true),
  values: z
    .array(
      z.object({
        property: z.string().refine(isPropertyKey, "Unknown property"),
        value: z.number().refine(Number.isFinite, "Must be a number"),
        unit: z.string().refine(isUnitId, "Unknown unit"),
        method: z.string().max(200).nullable(),
        page: z.number().int().min(1).nullable(),
      }),
    )
    .min(1, "Select at least one value to save.")
    .max(80),
  document: z
    .object({
      types: z.array(z.enum(DOC_TYPES as [string, ...string[]])).min(1, "Choose at least one report type, or untick the report record.").max(DOC_TYPES.length),
      laboratory: z.string().max(200).nullable(),
      date: z.string().max(40).nullable(),
      reference: z.string().max(120).nullable(),
    })
    .nullable(),
});

/** Save the values a person ticked and confirmed, through the same validation as the material form. */
export async function saveReportValuesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, actor } = await signedIn();
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { ok: false, message: "The confirmation could not be read. Reload the page and try again." };
  }
  const parsed = confirmSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first?.path[0] === "confirmed" ? "Tick the confirmation box after checking each value against the report." : (first?.message ?? "Some values are invalid.") };
  }
  const { materialId, fileName, values, document } = parsed.data;
  const material = await repo.getMaterial(materialId);
  if (!material) return { ok: false, message: "This material no longer exists." };

  const input = applyConfirmedValues(material, values as ConfirmedValue[], document as ReportDocument | null, {
    documentId: `doc-${randomUUID().slice(0, 8)}`,
    fileName,
    confirmedBy: actor.label,
    confirmedOn: fmtDate(new Date().toISOString()),
  });
  const shape = materialInputSchema.safeParse(input);
  const domain = shape.success ? validateMaterial(shape.data) : null;
  const problems = shape.success ? domain!.issues.filter((i) => i.severity === "error").map((i) => i.message) : shape.error.issues.map((i) => i.message);
  if (problems.length) return { ok: false, message: `Not saved: ${problems.slice(0, 3).join(" ")}` };

  try {
    await repo.updateMaterial(material.id, shape.data!, actor);
  } catch (e) {
    return { ok: false, message: `Could not save: ${(e as Error).message}` };
  }
  revalidatePath("/", "layout");
  redirect(`/materials/${material.id}?saved=report`);
}
