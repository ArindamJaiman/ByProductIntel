import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { APPLICATIONS, EVIDENCE_SOURCES, MATERIALS, SEED_VERSION } from "@/data/seed";
import type { AuditEvent, ReviewDecision, ShortlistEntry, StoredRun } from "@/domain/records";
import type { Material } from "@/domain/types";

/**
 * Demo store file format and helpers. Kept free of Next.js-only imports so the
 * seed script (scripts/seed-demo.ts) can use exactly the same code.
 */
export interface DemoState {
  schemaVersion: 1;
  seedVersion: string;
  materials: Material[];
  runs: StoredRun[];
  shortlist: ShortlistEntry[];
  decisions: ReviewDecision[];
  audit: AuditEvent[];
}

export const STORE_PATH = process.env.BPI_DEMO_STORE_PATH ?? path.join(process.cwd(), ".data", "demo-store.json");

export function freshDemoState(now = new Date().toISOString()): DemoState {
  return {
    schemaVersion: 1,
    seedVersion: SEED_VERSION,
    materials: structuredClone(MATERIALS),
    runs: [],
    shortlist: [],
    decisions: [],
    audit: [
      {
        id: randomUUID(),
        eventType: "seed_loaded",
        entityType: "dataset",
        entityId: SEED_VERSION,
        summary: `Synthetic demo dataset loaded (${MATERIALS.length} materials, ${APPLICATIONS.length} applications, ${EVIDENCE_SOURCES.length} sources)`,
        actor: "System",
        createdAt: now,
      },
    ],
  };
}

export const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);

/** Atomic write: unique temp file, then rename. Retries transient Windows lock errors. */
export async function writeDemoState(state: DemoState, file = STORE_PATH): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(state), "utf8");
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!TRANSIENT.has(code) || attempt >= 6) {
        await rm(tmp, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 25 * 2 ** attempt));
    }
  }
}

