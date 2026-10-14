import type {
  AuditEvent,
  ReviewDecision,
  ReviewDecisionType,
  RunSummary,
  ShortlistEntry,
  ShortlistStatus,
  StoredRun,
} from "@/domain/records";
import type { Application, EvidenceSource, Material } from "@/domain/types";
import type { MaterialInput } from "@/domain/validation";

export interface Actor {
  id: string;
  label: string;
  organisationId: string;
}

export interface OrganisationRecord {
  id: string;
  name: string;
  kind: string;
}

export type NewRun = Omit<StoredRun, "id" | "createdAt" | "createdBy">;

/**
 * Storage port. Two adapters implement it: a file-backed demo store and a
 * Supabase/Postgres store. Reference data (applications, evidence) is
 * read-only through this interface by design.
 */
export interface Repository {
  readonly mode: "demo" | "supabase";
  /** Where demo data lives: on disk, or only in this server process's memory. */
  readonly persistence: "file" | "memory" | "database";

  listOrganisations(): Promise<OrganisationRecord[]>;
  listMaterials(): Promise<Material[]>;
  getMaterial(id: string): Promise<Material | null>;
  createMaterial(input: MaterialInput, actor: Actor): Promise<Material>;
  updateMaterial(id: string, input: MaterialInput, actor: Actor): Promise<Material>;

  listApplications(): Promise<Application[]>;
  getApplication(id: string): Promise<Application | null>;
  listEvidence(): Promise<EvidenceSource[]>;

  createRun(run: NewRun, actor: Actor): Promise<StoredRun>;
  getRun(id: string): Promise<StoredRun | null>;
  listRuns(filter?: { materialId?: string; limit?: number }): Promise<RunSummary[]>;

  listShortlist(): Promise<ShortlistEntry[]>;
  setShortlistStatus(
    entry: { materialId: string; applicationId: string; runId: string; status: ShortlistStatus; note: string | null },
    actor: Actor,
  ): Promise<ShortlistEntry>;
  removeShortlist(materialId: string, applicationId: string, actor: Actor): Promise<void>;

  listDecisions(filter?: { materialId?: string; applicationId?: string }): Promise<ReviewDecision[]>;
  addDecision(
    d: { materialId: string; applicationId: string; runId: string | null; decision: ReviewDecisionType; note: string | null },
    actor: Actor,
  ): Promise<ReviewDecision>;

  listAudit(limit?: number): Promise<AuditEvent[]>;
}

export function summariseRun(run: StoredRun): RunSummary {
  const counts = { potentially_eligible: 0, incomplete_evidence: 0, ineligible: 0 };
  for (const r of run.results) counts[r.state]++;
  // Strip the heavy fields explicitly.
  const { results: _r, materialSnapshot, applicationsSnapshot: _a, ...rest } = run;
  void _r;
  void _a;
  return { ...rest, materialName: materialSnapshot.name, materialCode: materialSnapshot.code, counts };
}
