import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { APPLICATIONS, EVIDENCE_SOURCES, ORGANISATIONS } from "@/data/seed";
import type { AuditEvent, ReviewDecision, StoredRun } from "@/domain/records";
import type { Material } from "@/domain/types";
import type { MaterialInput } from "@/domain/validation";
import { freshDemoState, STORE_PATH, TRANSIENT, writeDemoState, type DemoState } from "./demo-state";
import { summariseRun, type Actor, type Repository } from "./types";

/**
 * File-backed demo store.
 *
 * State lives in a JSON file (default `.data/demo-store.json`, git-ignored).
 * Reference data (applications, evidence) always comes from the seed modules
 * and cannot be changed through this store. If the file system is not
 * writable (e.g. some serverless hosts), the store falls back to process
 * memory and reports `persistence = "memory"`, which the UI shows to users.
 */

async function readWithRetry(file: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await readFile(file, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!TRANSIENT.has(code) || attempt >= 6) throw err;
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt));
    }
  }
}

let memoryState: DemoState | null = null;
let persistence: "file" | "memory" = "file";
let queue: Promise<unknown> = Promise.resolve();

let initialising: Promise<DemoState> | null = null;

async function initialise(): Promise<DemoState> {
  const state = freshDemoState();
  try {
    await writeDemoState(state);
  } catch {
    // Read-only or unavailable file system: keep state in this process only and say so in the UI.
    persistence = "memory";
    memoryState = state;
  }
  return state;
}

async function load(): Promise<DemoState> {
  if (persistence === "memory" && memoryState) return memoryState;
  try {
    const parsed = JSON.parse(await readWithRetry(STORE_PATH)) as DemoState;
    if (parsed.schemaVersion !== 1) throw new Error("Unsupported demo store version");
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT" && !(err instanceof SyntaxError)) throw err;
    // Only one request creates the store; concurrent first requests share the result.
    initialising ??= initialise().finally(() => {
      initialising = null;
    });
    return structuredClone(await initialising);
  }
}

async function save(state: DemoState): Promise<void> {
  if (persistence === "memory") {
    memoryState = state;
    return;
  }
  try {
    await writeDemoState(state);
  } catch {
    persistence = "memory";
    memoryState = state;
  }
}

/** Serialise read-modify-write cycles within this process. */
function mutate<T>(fn: (s: DemoState) => T): Promise<T> {
  const next = queue.then(async () => {
    const state = await load();
    const result = fn(state);
    await save(state);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}

function audit(s: DemoState, e: Omit<AuditEvent, "id" | "createdAt">) {
  s.audit.unshift({ ...e, id: randomUUID(), createdAt: new Date().toISOString() });
  s.audit = s.audit.slice(0, 500);
}

function nextCode(materials: Material[]): string {
  const n = materials.filter((m) => m.code.startsWith("BPI-USR-")).length + 1;
  return `BPI-USR-${String(n).padStart(3, "0")}`;
}

export const demoRepository: Repository = {
  mode: "demo",
  get persistence() {
    return persistence;
  },

  async listOrganisations() {
    return ORGANISATIONS.map((o) => ({ ...o }));
  },

  async listMaterials() {
    return (await load()).materials;
  },

  async getMaterial(id) {
    return (await load()).materials.find((m) => m.id === id) ?? null;
  },

  createMaterial(input: MaterialInput, actor: Actor) {
    return mutate((s) => {
      const now = new Date().toISOString();
      const material: Material = {
        ...input,
        id: `mat-${randomUUID().slice(0, 8)}`,
        code: nextCode(s.materials),
        organisationId: actor.organisationId,
        dataOrigin: "user_supplied",
        createdAt: now,
        updatedAt: now,
      };
      s.materials.push(material);
      audit(s, { eventType: "material_created", entityType: "material", entityId: material.id, summary: `Created ${material.code} ${material.name}`, actor: actor.label });
      return material;
    });
  },

  updateMaterial(id, input, actor) {
    return mutate((s) => {
      const idx = s.materials.findIndex((m) => m.id === id);
      if (idx < 0) throw new Error("Material not found");
      const prev = s.materials[idx];
      const updated: Material = {
        ...prev,
        ...input,
        id: prev.id,
        code: prev.code,
        organisationId: prev.organisationId,
        // Editing a record means it is no longer the untouched seed; the origin label reflects that.
        dataOrigin: prev.dataOrigin === "synthetic_demo" ? "synthetic_demo" : "user_supplied",
        createdAt: prev.createdAt,
        updatedAt: new Date().toISOString(),
      };
      s.materials[idx] = updated;
      audit(s, { eventType: "material_updated", entityType: "material", entityId: id, summary: `Updated ${prev.code} ${updated.name}`, actor: actor.label });
      return updated;
    });
  },

  async listApplications() {
    return APPLICATIONS;
  },

  async getApplication(id) {
    return APPLICATIONS.find((a) => a.id === id) ?? null;
  },

  async listEvidence() {
    return EVIDENCE_SOURCES;
  },

  createRun(run, actor) {
    return mutate((s) => {
      const stored: StoredRun = { ...run, id: randomUUID(), createdAt: new Date().toISOString(), createdBy: actor.label };
      s.runs.unshift(stored);
      s.runs = s.runs.slice(0, 200);
      audit(s, {
        eventType: "run_created",
        entityType: "run",
        entityId: stored.id,
        summary: `Ran matching for ${run.materialSnapshot.code} (${run.results.length} applications, ${run.scenario.label})`,
        actor: actor.label,
      });
      return stored;
    });
  },

  async getRun(id) {
    return (await load()).runs.find((r) => r.id === id) ?? null;
  },

  async listRuns(filter = {}) {
    const runs = (await load()).runs.filter((r) => !filter.materialId || r.materialId === filter.materialId);
    return runs.slice(0, filter.limit ?? 50).map(summariseRun);
  },

  async listShortlist() {
    return (await load()).shortlist;
  },

  setShortlistStatus(entry, actor) {
    return mutate((s) => {
      const now = new Date().toISOString();
      let existing = s.shortlist.find((e) => e.materialId === entry.materialId && e.applicationId === entry.applicationId);
      if (existing) {
        Object.assign(existing, { status: entry.status, runId: entry.runId, note: entry.note ?? existing.note, updatedAt: now });
      } else {
        existing = { id: randomUUID(), ...entry, createdAt: now, updatedAt: now };
        s.shortlist.push(existing);
      }
      s.decisions.unshift({
        id: randomUUID(),
        materialId: entry.materialId,
        applicationId: entry.applicationId,
        runId: entry.runId,
        decision: entry.status,
        note: entry.note,
        actor: actor.label,
        createdAt: now,
      });
      audit(s, {
        eventType: "shortlist_changed",
        entityType: "shortlist",
        entityId: existing.id,
        summary: `${entry.status.replace("_", " ")}: ${entry.applicationId} for ${entry.materialId}`,
        actor: actor.label,
      });
      return { ...existing };
    });
  },

  removeShortlist(materialId, applicationId, actor) {
    return mutate((s) => {
      const entry = s.shortlist.find((e) => e.materialId === materialId && e.applicationId === applicationId);
      if (!entry) return;
      s.shortlist = s.shortlist.filter((e) => e !== entry);
      const now = new Date().toISOString();
      s.decisions.unshift({ id: randomUUID(), materialId, applicationId, runId: entry.runId, decision: "removed", note: null, actor: actor.label, createdAt: now });
      audit(s, { eventType: "shortlist_changed", entityType: "shortlist", entityId: entry.id, summary: `Removed ${applicationId} for ${materialId} from shortlist`, actor: actor.label });
    });
  },

  async listDecisions(filter = {}) {
    return (await load()).decisions.filter(
      (d) => (!filter.materialId || d.materialId === filter.materialId) && (!filter.applicationId || d.applicationId === filter.applicationId),
    );
  },

  addDecision(d, actor) {
    return mutate((s) => {
      const decision: ReviewDecision = { ...d, id: randomUUID(), actor: actor.label, createdAt: new Date().toISOString() };
      s.decisions.unshift(decision);
      return decision;
    });
  },

  async listAudit(limit = 20) {
    return (await load()).audit.slice(0, limit);
  },
};
