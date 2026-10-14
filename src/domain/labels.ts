import type {
  DataOrigin,
  DocumentStatus,
  MaterialFamily,
  Provenance,
  RuleBasis,
  SpecStatus,
  VerificationState,
} from "./types";
import type { BridgeCategory, MatchState, ScoreStatus } from "./engine/result-types";

export const FAMILY_LABELS: Record<MaterialFamily, string> = {
  steel_slag_bof: "Steel slag — basic oxygen furnace (BOF/LD)",
  steel_slag_eaf: "Steel slag — electric arc furnace (EAF)",
  blast_furnace_slag_granulated: "Granulated blast furnace slag",
  fly_ash: "Coal fly ash",
  foundry_sand: "Spent foundry sand",
  mill_scale: "Mill scale",
};

export const FAMILY_SHORT: Record<MaterialFamily, string> = {
  steel_slag_bof: "BOF slag",
  steel_slag_eaf: "EAF slag",
  blast_furnace_slag_granulated: "Granulated BF slag",
  fly_ash: "Fly ash",
  foundry_sand: "Foundry sand",
  mill_scale: "Mill scale",
};

export const ORIGIN_LABELS: Record<DataOrigin, string> = {
  synthetic_demo: "Synthetic demo data",
  user_supplied: "User-supplied data",
  verified_evidence: "Verified evidence",
};

export const PROVENANCE_LABELS: Record<Provenance, string> = {
  verified_source: "Verified source fact",
  user_supplied: "User-supplied",
  synthetic_demo: "Synthetic demo value",
  calculated_estimate: "Calculated estimate",
  hypothesis: "Hypothesis",
};

export const VERIFICATION_LABELS: Record<VerificationState, string> = {
  unverified: "Unverified",
  self_declared: "Self-declared",
  lab_reported: "Lab-reported",
  independently_verified: "Independently verified",
};

export const DOC_STATUS_LABELS: Record<DocumentStatus, string> = {
  available_unverified: "On file, unverified",
  available_verified: "On file, independently verified",
  requested: "Requested",
};

export const RULE_BASIS_LABELS: Record<RuleBasis, string> = {
  source_referenced: "Source-referenced",
  demo_assumption: "Demo assumption",
};

export const SPEC_STATUS_LABELS: Record<SpecStatus, string> = {
  source_referenced: "Includes source-referenced rules",
  demo_assumption: "Demonstration assumptions",
  specification_not_established: "No specification established",
};

export const STATE_LABELS: Record<MatchState, string> = {
  potentially_eligible: "Potentially eligible",
  incomplete_evidence: "Incomplete evidence",
  ineligible: "Ineligible",
};

export const SCORE_STATUS_LABELS: Record<ScoreStatus, string> = {
  scored: "Scored",
  provisional: "Provisional",
  insufficient_data: "Insufficient data",
  not_ranked: "Not ranked",
};

export const BRIDGE_CATEGORY_LABELS: Record<BridgeCategory, string> = {
  identity: "Material identity",
  hazard_declaration: "Hazard declaration",
  specification: "Acceptance specification",
  composition_data: "Composition data",
  physical_property: "Physical property",
  lab_test: "Laboratory test",
  contamination_leaching: "Contamination and leaching",
  certification: "Certification",
  processing: "Processing",
  technical_constraint: "Technical constraint",
  logistics_volume: "Logistics and volume",
  economic_input: "Economic input",
  human_review: "Human review",
};

export const REVIEWER_LABELS = {
  laboratory: "Laboratory",
  technical_expert: "Technical expert",
  regulatory: "Regulatory",
  commercial: "Commercial",
} as const;

/**
 * Lower-case only the first letter of a label for use mid-sentence, keeping
 * chemical formulae, acronyms and proper nouns ("CaO", "SiO₂", "Los Angeles") intact.
 */
export function lowerFirst(label: string): string {
  if (/^(Los |[A-Z]{2}|[A-Z][a-z]?[A-Z₀-₉0-9])/.test(label)) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}
