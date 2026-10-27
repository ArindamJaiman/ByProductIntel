"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { materialsFromCsv } from "@/domain/csv";
import { InvalidMaterialError } from "@/domain/engine/evaluate";
import { runMatching } from "@/domain/engine/run";
import { DEFAULT_ASSUMPTIONS, DEFAULT_WEIGHTS, normaliseWeights } from "@/domain/scoring-config";
import type { Material, Scenario } from "@/domain/types";
import { materialInputSchema, validateMaterial, type MaterialInput } from "@/domain/validation";
import { canEditMaterial, getContext } from "./context";
import { routedLegs } from "./routing";

export interface FormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

async function actorContext() {
  const ctx = await getContext();
  if (!ctx.actor) throw new Error("Sign in to make changes.");
  return ctx as typeof ctx & { actor: NonNullable<typeof ctx.actor> };
}

/**
 * Users may not assert independent verification or verified-source status.
 * Those states require an authorised review workflow outside this MVP. A
 * value that was already stored with such a state may be kept unchanged;
 * changing the value or adding a new verified item is rejected.
 */
function verificationGuard(input: MaterialInput, existing: Material | null): Record<string, string> {
  const errors: Record<string, string> = {};
  const msg = "Independent verification can only be recorded by an authorised reviewer.";
  input.measurements.forEach((m, i) => {
    if (m.verification !== "independently_verified" && m.provenance !== "verified_source") return;
    const prev = existing?.measurements.find((x) => x.property === m.property);
    const unchanged = prev && prev.value === m.value && prev.unit === m.unit && prev.verification === m.verification && prev.provenance === m.provenance;
    if (!unchanged) errors[`measurements.${i}`] = msg;
  });
  input.documents.forEach((d, i) => {
    if (d.status !== "available_verified" && d.provenance !== "verified_source") return;
    const prev = existing?.documents.find((x) => x.id === d.id);
    const unchanged = prev && prev.type === d.type && prev.status === d.status && prev.provenance === d.provenance;
    if (!unchanged) errors[`documents.${i}`] = msg;
  });
  if (input.hazard.verification === "independently_verified" && existing?.hazard.verification !== "independently_verified") {
    errors["hazard.verification"] = msg;
  }
  return errors;
}

function parseMaterialPayload(raw: FormDataEntryValue | null): { input?: MaterialInput; state?: FormState } {
  let json: unknown;
  try {
    json = JSON.parse(String(raw ?? ""));
  } catch {
    return { state: { ok: false, message: "The form could not be read. Reload the page and try again." } };
  }
  const parsed = materialInputSchema.safeParse(json);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { state: { ok: false, message: "Some fields need attention.", fieldErrors } };
  }
  const domain = validateMaterial(parsed.data);
  const fieldErrors: Record<string, string> = {};
  for (const issue of domain.issues.filter((i) => i.severity === "error")) {
    fieldErrors[issue.path.replace(/\[(\d+)\]/g, ".$1")] ??= issue.message;
  }
  if (Object.keys(fieldErrors).length) return { state: { ok: false, message: "Some values are invalid.", fieldErrors } };
  return { input: parsed.data };
}

export async function saveMaterialAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await actorContext();
  const { repo, actor } = ctx;
  const { input, state } = parseMaterialPayload(formData.get("payload"));
  if (!input) return state!;
  const id = String(formData.get("materialId") ?? "");
  const existing = id ? await repo.getMaterial(id) : null;
  if (id && !existing) return { ok: false, message: "This material no longer exists." };
  if (existing && !canEditMaterial(ctx, existing)) return { ok: false, message: "This material is shared by another organisation and is read-only for you." };
  const guard = verificationGuard(input, existing);
  if (Object.keys(guard).length) return { ok: false, message: "Some values are invalid.", fieldErrors: guard };
  let savedId: string;
  try {
    savedId = existing ? (await repo.updateMaterial(existing.id, input, actor)).id : (await repo.createMaterial(input, actor)).id;
  } catch (e) {
    return { ok: false, message: `Could not save: ${(e as Error).message}` };
  }
  revalidatePath("/", "layout");
  redirect(`/materials/${savedId}?saved=1`);
}

export async function importMaterialsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { repo, actor } = await actorContext();
  const file = formData.get("file");
  const text = file instanceof File ? await file.text() : String(formData.get("text") ?? "");
  if (!text.trim()) return { ok: false, message: "Choose a CSV file to import." };
  if (text.length > 500_000) return { ok: false, message: "The file is larger than 500 KB." };
  const { materials, errors } = materialsFromCsv(text);
  if (errors.length) {
    return {
      ok: false,
      message: `Nothing was imported. ${errors.length} problem(s) found:`,
      fieldErrors: Object.fromEntries(errors.slice(0, 50).map((e, i) => [`${i}`, `Row ${e.row}: ${e.message}`])),
    };
  }
  for (const m of materials) await repo.createMaterial(m, actor);
  revalidatePath("/", "layout");
  return { ok: true, message: `Imported ${materials.length} material profile(s) as user-supplied, unverified data.` };
}

const scenarioSchema = z.object({
  label: z.string().trim().min(1).max(80),
  defaults: z.object({
    transportCostInrPerTonneKm: z.number().min(0).max(100),
    roadCircuityFactor: z.number().min(1).max(3),
    recoveryFraction: z.number().gt(0).max(1),
    distanceKmOverride: z.number().min(0).max(5000).nullable(),
    tonnesOfferedOverride: z.number().min(0).nullable(),
    materialPriceInrPerTonneOverride: z.number().min(0).nullable(),
    processingCostInrPerTonneOverride: z.number().min(0).nullable(),
    currentHandlingCostInrPerTonneOverride: z.number().min(0).nullable(),
  }),
  perApplication: z.record(
    z.string(),
    z.object({
      distanceKmOverride: z.number().min(0).max(5000).nullable().optional(),
      routedDistanceKm: z.number().min(0).max(10000).nullable().optional(),
      materialPriceInrPerTonneOverride: z.number().min(0).nullable().optional(),
      processingCostInrPerTonneOverride: z.number().min(0).nullable().optional(),
    }),
  ),
});

const weightsSchema = z.object({
  technical: z.number().min(0),
  economic: z.number().min(0),
  logistics: z.number().min(0),
  volume: z.number().min(0),
  circularity: z.number().min(0),
  evidence: z.number().min(0),
});

/** Run the matching engine for a material and persist the run with its inputs. */
export async function runMatchAction(formData: FormData): Promise<void> {
  const { repo, actor } = await actorContext();
  const materialId = String(formData.get("materialId") ?? "");
  const material = await repo.getMaterial(materialId);
  if (!material) throw new Error("Material not found");

  let scenario: Scenario = { label: "Baseline assumptions", defaults: DEFAULT_ASSUMPTIONS, perApplication: {} };
  const rawScenario = formData.get("scenario");
  if (rawScenario) {
    const parsed = scenarioSchema.safeParse(JSON.parse(String(rawScenario)));
    if (!parsed.success) throw new Error("Scenario assumptions are invalid.");
    scenario = parsed.data;
  }
  // Routed distances are looked up here, never taken from the browser.
  const wantsRoutes = Object.values(scenario.perApplication).some((o) => o.routedDistanceKm !== undefined);
  if (wantsRoutes) {
    const legs = await routedLegs(material, await repo.listApplications());
    for (const [id, o] of Object.entries(scenario.perApplication)) {
      if (o.routedDistanceKm === undefined) continue;
      if (legs[id]) o.routedDistanceKm = legs[id].km;
      else delete o.routedDistanceKm;
    }
  }
  let weights = DEFAULT_WEIGHTS;
  const rawWeights = formData.get("weights");
  if (rawWeights) {
    const parsed = weightsSchema.safeParse(JSON.parse(String(rawWeights)));
    if (!parsed.success) throw new Error("Weights are invalid.");
    weights = normaliseWeights(parsed.data);
  }

  const applications = await repo.listApplications();
  let out;
  try {
    out = runMatching({ material, applications, scenario, weights });
  } catch (e) {
    if (e instanceof InvalidMaterialError) throw new Error(`Fix the material profile before matching: ${e.message}`);
    throw e;
  }
  const run = await repo.createRun(
    {
      label: scenario.label,
      materialId: material.id,
      engineVersion: out.engineVersion,
      scoringModelVersion: out.scoringModelVersion,
      rulesetVersions: out.rulesetVersions,
      weights: out.weights,
      scenario,
      inputHash: out.inputHash,
      materialSnapshot: material,
      applicationsSnapshot: applications,
      results: out.results,
    },
    actor,
  );
  revalidatePath("/", "layout");
  redirect(`/match/runs/${run.id}`);
}

const shortlistSchema = z.object({
  materialId: z.string().min(1),
  applicationId: z.string().min(1),
  runId: z.string().min(1),
  status: z.enum(["shortlisted", "under_review", "parked", "rejected", "remove"]),
  note: z.string().trim().max(500).optional(),
});

export async function setShortlistAction(formData: FormData): Promise<void> {
  const { repo, actor } = await actorContext();
  const parsed = shortlistSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Invalid shortlist request");
  const { materialId, applicationId, runId, status, note } = parsed.data;
  // Verify the run and the candidate exist and belong to the visible data set.
  const run = await repo.getRun(runId);
  if (!run || run.materialId !== materialId || !run.results.some((r) => r.applicationId === applicationId)) {
    throw new Error("That candidate is not part of the referenced run.");
  }
  if (status === "remove") await repo.removeShortlist(materialId, applicationId, actor);
  else await repo.setShortlistStatus({ materialId, applicationId, runId, status, note: note || null }, actor);
  revalidatePath("/", "layout");
}

export async function addReviewNoteAction(formData: FormData): Promise<void> {
  const { repo, actor } = await actorContext();
  const parsed = shortlistSchema.pick({ materialId: true, applicationId: true, runId: true }).extend({ note: z.string().trim().min(1).max(500) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("A note is required.");
  await repo.addDecision({ ...parsed.data, decision: "note" }, actor);
  revalidatePath("/", "layout");
}
