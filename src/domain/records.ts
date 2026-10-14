import type { MatchResult } from "./engine/result-types";
import type { ScoreWeights } from "./scoring-config";
import type { Application, Material, Scenario } from "./types";

/** A persisted matching run. Inputs are snapshotted so it can be reproduced. */
export interface StoredRun {
  id: string;
  label: string;
  materialId: string;
  createdAt: string;
  createdBy: string;
  engineVersion: string;
  scoringModelVersion: string;
  rulesetVersions: Record<string, string>;
  weights: ScoreWeights;
  scenario: Scenario;
  inputHash: string;
  materialSnapshot: Material;
  applicationsSnapshot: Application[];
  results: MatchResult[];
}

export type RunSummary = Omit<StoredRun, "results" | "materialSnapshot" | "applicationsSnapshot"> & {
  materialName: string;
  materialCode: string;
  counts: { potentially_eligible: number; incomplete_evidence: number; ineligible: number };
};

/** Review state of a shortlisted candidate. There is deliberately no "approved". */
export type ShortlistStatus = "shortlisted" | "under_review" | "parked" | "rejected";

export interface ShortlistEntry {
  id: string;
  materialId: string;
  applicationId: string;
  runId: string;
  status: ShortlistStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ReviewDecisionType = ShortlistStatus | "removed" | "note";

export interface ReviewDecision {
  id: string;
  materialId: string;
  applicationId: string;
  runId: string | null;
  decision: ReviewDecisionType;
  note: string | null;
  actor: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: "seed_loaded" | "material_created" | "material_updated" | "run_created" | "shortlist_changed" | "materials_imported";
  entityType: "material" | "run" | "shortlist" | "dataset";
  entityId: string;
  summary: string;
  actor: string;
  createdAt: string;
}

export const SHORTLIST_STATUS_LABELS: Record<ShortlistStatus, string> = {
  shortlisted: "Shortlisted",
  under_review: "Under review",
  parked: "Parked",
  rejected: "Rejected",
};
