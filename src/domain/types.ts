import type { PropertyKey } from "./properties";
import type { UnitId } from "./units";

/* -------------------------------------------------------------------------- */
/* Provenance and verification                                                */
/* -------------------------------------------------------------------------- */

/** Where a value came from. Shown next to every value in the UI. */
export type Provenance =
  | "verified_source" // traceable to a reviewed external source
  | "user_supplied" // entered by a platform user, not independently checked
  | "synthetic_demo" // invented for demonstration; not a real measurement
  | "calculated_estimate" // derived by this software from other values
  | "hypothesis"; // a claim that still requires validation

/** How far a measurement has been checked. Independent of provenance. */
export type VerificationState =
  | "unverified"
  | "self_declared"
  | "lab_reported"
  | "independently_verified";

/** Record-level origin label required on every material profile. */
export type DataOrigin = "synthetic_demo" | "user_supplied" | "verified_evidence";

/** Basis of an application rule. Demo assumptions must never be presented as standards. */
export type RuleBasis = "source_referenced" | "demo_assumption";

/* -------------------------------------------------------------------------- */
/* Materials                                                                  */
/* -------------------------------------------------------------------------- */

export type MaterialFamily =
  | "steel_slag_bof"
  | "steel_slag_eaf"
  | "blast_furnace_slag_granulated"
  | "fly_ash"
  | "foundry_sand"
  | "mill_scale";

export interface Measurement {
  property: PropertyKey;
  value: number;
  unit: UnitId;
  provenance: Provenance;
  verification: VerificationState;
  /** Test method as reported, e.g. "XRF (fused bead)". Free text, not a claim of standard conformity. */
  method?: string;
  /** Supporting material document, if any. */
  documentId?: string;
  note?: string;
}

export type EvidenceDocType =
  | "chemical_composition_report"
  | "leaching_test_report"
  | "volumetric_stability_test"
  | "strength_activity_test"
  | "heavy_metals_analysis"
  | "hazard_classification"
  | "particle_size_analysis"
  | "product_conformity_certificate"
  | "oil_grease_analysis";

export type DocumentStatus = "available_unverified" | "available_verified" | "requested";

export interface MaterialDocument {
  id: string;
  type: EvidenceDocType;
  title: string;
  status: DocumentStatus;
  issuedBy?: string;
  date?: string;
  provenance: Provenance;
  note?: string;
}

export type HazardStatus = "declared_non_hazardous" | "declared_hazardous" | "not_declared";

export interface HazardDeclaration {
  status: HazardStatus;
  basis?: string;
  verification: VerificationState;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface MaterialLocation extends GeoPoint {
  site: string;
  region: string;
  country: string;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  family: MaterialFamily;
  sourceProcess: string;
  description: string;
  organisationId: string;
  dataOrigin: DataOrigin;
  location: MaterialLocation;
  volume: {
    /** null = not reported. Never treated as zero. */
    tonnesPerYear: number | null;
    reportingPeriod: string;
    provenance: Provenance;
  };
  hazard: HazardDeclaration;
  currentHandling: {
    pathway: string;
    /** Whether the current pathway is disposal/stockpiling (diversion is meaningful) or an existing use. */
    kind: "disposal_or_stockpile" | "existing_use" | "unknown";
    costInrPerTonne: number | null;
    provenance: Provenance;
  };
  measurements: Measurement[];
  documents: MaterialDocument[];
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Applications                                                               */
/* -------------------------------------------------------------------------- */

export type RequirementKind = "min" | "max" | "range" | "reported";
export type Enforcement = "hard" | "soft";

export interface Requirement {
  id: string;
  property: PropertyKey;
  kind: RequirementKind;
  min?: number;
  max?: number;
  /** Unit of min/max. Converted to the property's canonical unit before comparison. */
  unit: UnitId;
  enforcement: Enforcement;
  safetyCritical: boolean;
  rationale: string;
  basis: RuleBasis;
  sourceId?: string;
  /** Processing route that may change the property. Never used to override a failure. */
  remediation?: string;
}

export type ReviewerType = "laboratory" | "technical_expert" | "regulatory" | "commercial";

export interface EvidenceRequirement {
  id: string;
  docType: EvidenceDocType;
  label: string;
  enforcement: Enforcement;
  safetyCritical: boolean;
  why: string;
  reviewer: ReviewerType;
  basis: RuleBasis;
  sourceId?: string;
}

export interface DemandSite extends GeoPoint {
  id: string;
  label: string;
  region: string;
}

export type CircularityTier = "high_value_substitution" | "material_substitution" | "bulk_fill";

export type SpecStatus = "source_referenced" | "demo_assumption" | "specification_not_established";

export interface Application {
  id: string;
  code: string;
  name: string;
  industry: string;
  description: string;
  specStatus: SpecStatus;
  /** Exact categorical identity constraint: only these material families are within validated scope. */
  acceptedFamilies: MaterialFamily[];
  excludesDeclaredHazardous: boolean;
  requirements: Requirement[];
  evidenceRequirements: EvidenceRequirement[];
  demand: {
    /** Minimum annual quantity the illustrative recipient would engage for (hard constraint). */
    minTonnesPerYear: number;
    maxTonnesPerYear: number;
    provenance: Provenance;
  };
  /** Illustrative demand locations. The engine evaluates the nearest one. */
  demandSites: DemandSite[];
  logistics: { maxTransportKm: number; mode: "road"; basis: RuleBasis };
  economics: {
    indicativePriceInrPerTonne: number | null;
    processingCostInrPerTonne: number | null;
    provenance: Provenance;
  };
  processingSteps: string[];
  circularity: { tier: CircularityTier; substitutes: string; rationale: string };
  /** Regulatory review is always required before use; set when the application has an explicit regulatory pathway. */
  requiresRegulatoryReview: boolean;
  sourceIds: string[];
  rulesetVersion: string;
  reviewStatus: "demo_unreviewed" | "source_checked";
}

/* -------------------------------------------------------------------------- */
/* Scenario assumptions                                                       */
/* -------------------------------------------------------------------------- */

export interface ScenarioAssumptions {
  /** Indicative road freight cost. Illustrative assumption, not a quotation. */
  transportCostInrPerTonneKm: number;
  /** Ratio between road distance and great-circle distance. */
  roadCircuityFactor: number;
  /** Share of offered material accepted after processing losses and rejects. */
  recoveryFraction: number;
  /** Optional overrides — null means "use the record value". */
  distanceKmOverride: number | null;
  tonnesOfferedOverride: number | null;
  materialPriceInrPerTonneOverride: number | null;
  processingCostInrPerTonneOverride: number | null;
  currentHandlingCostInrPerTonneOverride: number | null;
}

export interface Scenario {
  label: string;
  defaults: ScenarioAssumptions;
  perApplication: Record<string, Partial<ScenarioAssumptions>>;
}

/* -------------------------------------------------------------------------- */
/* Evidence library                                                           */
/* -------------------------------------------------------------------------- */

export type EvidenceType =
  | "standard_reference"
  | "regulation"
  | "government_guidance"
  | "peer_reviewed"
  | "company_publication"
  | "project_report"
  | "trade_press"
  | "secondary_summary";

export interface EvidenceSource {
  id: string;
  title: string;
  organisation: string;
  url: string;
  publicationDate: string | null;
  accessDate: string;
  evidenceType: EvidenceType;
  relevantTo: string[];
  /** The specific claim this source is used to support in the application. */
  claim: string;
  reviewStatus: "abstract_or_summary_reviewed" | "full_text_reviewed" | "secondary_only";
  caveat?: string;
}
