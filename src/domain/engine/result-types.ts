import type { PropertyKey } from "../properties";
import type { ScoreComponentKey, ScoreWeights } from "../scoring-config";
import type {
  DemandSite,
  Enforcement,
  EvidenceDocType,
  Provenance,
  ReviewerType,
  RuleBasis,
  ScenarioAssumptions,
  VerificationState,
} from "../types";

export type CheckStatus = "pass" | "fail" | "unknown";

export type CheckStage =
  | "identity"
  | "hazard"
  | "specification"
  | "evidence"
  | "logistics"
  | "volume"
  | "economics";

export interface Check {
  id: string;
  stage: CheckStage;
  label: string;
  status: CheckStatus;
  enforcement: Enforcement | "info";
  safetyCritical: boolean;
  observed: string | null;
  required: string | null;
  detail: string;
  basis?: RuleBasis;
  sourceId?: string;
  requirementId?: string;
  property?: PropertyKey;
  docType?: EvidenceDocType;
  provenance?: Provenance;
  verification?: VerificationState;
}

/**
 * The engine never emits an "approved" state. Approval for a specified use
 * requires an authorised, scoped human verification workflow that this MVP
 * does not implement.
 */
export type MatchState = "potentially_eligible" | "incomplete_evidence" | "ineligible";

export interface PerTonneEconomics {
  price: number | null;
  avoidedHandling: number | null;
  transport: number | null;
  processing: number | null;
  net: number | null;
}

export interface EconomicsResult {
  status: "complete" | "incomplete";
  missingInputs: string[];
  notes: string[];
  demandSite: DemandSite;
  distanceKm: number | null;
  distanceBasis: "override" | "great_circle_x_factor";
  greatCircleKm: number;
  offeredTonnes: number | null;
  acceptedTonnes: number | null;
  perTonne: PerTonneEconomics;
  annualNetInr: number | null;
  assumptions: ScenarioAssumptions;
  formula: string;
}

export interface EnvironmentResult {
  diversion: {
    status: "scenario_estimate" | "not_applicable" | "not_computed";
    tonnes: number | null;
    explanation: string;
  };
  transportActivityTonneKm: number | null;
  ghg: { status: "not_estimated"; reason: string };
}

export interface ScoreComponent {
  key: ScoreComponentKey;
  label: string;
  weight: number;
  /** 0–1, or null when it cannot be computed. */
  value: number | null;
  /** weight × value × 100, or null. */
  points: number | null;
  explanation: string;
}

export type ScoreStatus = "scored" | "provisional" | "insufficient_data" | "not_ranked";
export type Confidence = "low" | "medium" | "high";

export interface ScoreResult {
  status: ScoreStatus;
  /** 0–100 or null. A number is only produced when every component is computable. */
  total: number | null;
  components: ScoreComponent[];
  reason: string;
  confidence: Confidence;
  confidenceReasons: string[];
  weights: ScoreWeights;
}

export type BridgeCategory =
  | "identity"
  | "hazard_declaration"
  | "specification"
  | "composition_data"
  | "physical_property"
  | "lab_test"
  | "contamination_leaching"
  | "certification"
  | "processing"
  | "technical_constraint"
  | "logistics_volume"
  | "economic_input"
  | "human_review";

export interface BridgeAction {
  id: string;
  category: BridgeCategory;
  /** The missing field, test, certification or requirement. */
  target: string;
  why: string;
  currentState: string;
  nextAction: string;
  reviewer: ReviewerType | null;
  sourceId?: string;
  /** True when this item alone prevents the candidate from progressing. */
  blocking: boolean;
  priority: 1 | 2 | 3;
  priorityRule: string;
  checkId: string | null;
}

export interface TechnicalSummary {
  total: number;
  passed: number;
  failed: number;
  unknown: number;
  coverage: number;
}

export interface MatchResult {
  materialId: string;
  applicationId: string;
  state: MatchState;
  headline: string;
  summary: string;
  checks: Check[];
  technical: TechnicalSummary;
  economics: EconomicsResult;
  environment: EnvironmentResult;
  score: ScoreResult;
  bridge: BridgeAction[];
  reasonsFor: string[];
  reasonsAgainst: string[];
  /** 1-based rank among actionable results (scored + provisional); null otherwise. */
  rank: number | null;
  rulesetVersion: string;
}
