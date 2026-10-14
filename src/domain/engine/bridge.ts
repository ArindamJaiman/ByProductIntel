import { lowerFirst } from "../labels";
import { PROPERTIES } from "../properties";
import type { Application, EvidenceDocType } from "../types";
import type { BridgeAction, BridgeCategory, Check, EconomicsResult, MatchState } from "./result-types";

export const DOC_LABELS: Record<EvidenceDocType, string> = {
  chemical_composition_report: "Chemical composition report",
  leaching_test_report: "Leaching test report",
  volumetric_stability_test: "Volume stability test report",
  strength_activity_test: "Strength activity test report",
  heavy_metals_analysis: "Heavy metals analysis",
  hazard_classification: "Hazard classification",
  particle_size_analysis: "Particle size analysis",
  product_conformity_certificate: "Product conformity certificate",
  oil_grease_analysis: "Oil and grease analysis",
};

const DOC_CATEGORY: Record<EvidenceDocType, BridgeCategory> = {
  chemical_composition_report: "lab_test",
  leaching_test_report: "contamination_leaching",
  volumetric_stability_test: "lab_test",
  strength_activity_test: "lab_test",
  heavy_metals_analysis: "contamination_leaching",
  hazard_classification: "certification",
  particle_size_analysis: "lab_test",
  product_conformity_certificate: "certification",
  oil_grease_analysis: "contamination_leaching",
};

const GROUP_CATEGORY = {
  composition: "composition_data",
  physical: "physical_property",
  stability: "lab_test",
  performance: "lab_test",
  contamination: "contamination_leaching",
} as const satisfies Record<string, BridgeCategory>;

export const PRIORITY_RULES = {
  1: "P1 — safety-critical, hazard-related or a blocking failure",
  2: "P2 — hard constraint or mandatory review without a safety classification",
  3: "P3 — affects score, confidence or economics only",
} as const;

function priorityFor(check: Pick<Check, "safetyCritical" | "enforcement">, blocking = false): 1 | 2 | 3 {
  if (check.safetyCritical || blocking) return 1;
  if (check.enforcement === "hard") return 2;
  return 3;
}

/**
 * Derive the Missing-Bridge plan strictly from rule results. Every action
 * points back to the check that produced it. Nothing here can change the
 * match state: a failed hard constraint remains a failure even when a
 * processing route is suggested.
 */
export function buildBridgePlan(
  app: Application,
  checks: Check[],
  econ: EconomicsResult,
  state: MatchState,
): BridgeAction[] {
  const actions: BridgeAction[] = [];
  const add = (a: Omit<BridgeAction, "priorityRule">) =>
    actions.push({ ...a, priorityRule: PRIORITY_RULES[a.priority] });

  for (const c of checks) {
    if (c.status === "pass") {
      // Safety-critical documents that exist but are unverified still need review.
      if (c.stage === "evidence" && c.safetyCritical && c.verification !== "independently_verified" && c.docType) {
        const req = app.evidenceRequirements.find((r) => `evidence:${r.id}` === c.id);
        add({
          id: `review:${c.id}`,
          category: DOC_CATEGORY[c.docType],
          target: `${DOC_LABELS[c.docType]} — independent review`,
          why: req?.why ?? "Safety-critical evidence must be reviewed before reliance.",
          currentState: "Document supplied but not independently verified.",
          nextAction: `Have the ${lowerFirst(DOC_LABELS[c.docType])} reviewed by a qualified reviewer against the requirements that apply to this application and jurisdiction.`,
          reviewer: req?.reviewer ?? "laboratory",
          sourceId: c.sourceId,
          blocking: false,
          priority: 2,
          checkId: c.id,
        });
      }
      continue;
    }

    switch (c.stage) {
      case "identity":
        add({
          id: `bridge:${c.id}`,
          category: "identity",
          target: "Material identity within application scope",
          why: c.detail,
          currentState: c.observed ?? "Not established",
          nextAction:
            c.status === "fail"
              ? "Do not pursue under the current specification. A specification validated for this material family would be needed first."
              : "Declare the material family and source process so the identity check can be applied.",
          reviewer: "technical_expert",
          blocking: true,
          priority: 1,
          checkId: c.id,
        });
        break;

      case "hazard":
        add({
          id: `bridge:${c.id}`,
          category: "hazard_declaration",
          target: "Hazard classification",
          why: "The application excludes hazardous materials, and an undeclared status cannot be treated as non-hazardous.",
          currentState: c.observed ?? "Not declared",
          nextAction:
            c.status === "fail"
              ? "Excluded: the declared hazardous status conflicts with this use. Additional evidence for this application cannot override the declaration."
              : "Obtain a hazard classification for this specific material stream from a competent laboratory and record its basis.",
          reviewer: "regulatory",
          blocking: true,
          priority: 1,
          checkId: c.id,
        });
        break;

      case "specification": {
        if (!c.requirementId) {
          add({
            id: `bridge:${c.id}`,
            category: "specification",
            target: "Validated acceptance specification",
            why: c.detail,
            currentState: "No acceptance criteria defined for this application in the dataset.",
            nextAction:
              "Agree an application-specific acceptance specification with the recipient, referencing the applicable standard or test programme, before any material comparison.",
            reviewer: "technical_expert",
            blocking: true,
            priority: 2,
            checkId: c.id,
          });
          break;
        }
        const req = app.requirements.find((r) => r.id === c.requirementId)!;
        const def = PROPERTIES[req.property];
        if (c.status === "unknown") {
          add({
            id: `bridge:${c.id}`,
            category: GROUP_CATEGORY[def.group],
            target: def.label,
            why: req.rationale,
            currentState: "Not measured",
            nextAction: `Measure ${lowerFirst(def.label)} on a representative sample using a method agreed with the recipient, and report the value with units, method and laboratory. Required: ${c.required}.`,
            reviewer: "laboratory",
            sourceId: req.sourceId,
            blocking: req.enforcement === "hard" || req.safetyCritical,
            priority: priorityFor(req),
            checkId: c.id,
          });
        } else {
          const hard = req.enforcement === "hard";
          add({
            id: `bridge:${c.id}`,
            category: req.remediation ? "processing" : "technical_constraint",
            target: def.label,
            why: req.rationale,
            currentState: `Measured ${c.observed}; required ${c.required}.`,
            nextAction: req.remediation
              ? `${req.remediation} Re-test after processing.${hard ? " The candidate remains ineligible until new verified results meet the requirement." : ""}`
              : hard
                ? "No evidence-based route under the current constraints. This failure cannot be offset by other strengths."
                : "Below target; this lowers the technical score but does not block the candidate.",
            reviewer: "technical_expert",
            sourceId: req.sourceId,
            blocking: hard,
            priority: priorityFor(req, hard),
            checkId: c.id,
          });
        }
        break;
      }

      case "evidence": {
        const req = app.evidenceRequirements.find((r) => `evidence:${r.id}` === c.id)!;
        add({
          id: `bridge:${c.id}`,
          category: DOC_CATEGORY[req.docType],
          target: req.label,
          why: req.why,
          currentState: c.observed ?? "Not supplied",
          nextAction: `Obtain ${lowerFirst(req.label)} from an appropriately accredited laboratory or body, then have the results reviewed against the requirements that apply to this application. No threshold is assumed by this software.`,
          reviewer: req.reviewer,
          sourceId: req.sourceId,
          blocking: req.enforcement === "hard" || req.safetyCritical,
          priority: priorityFor(req),
          checkId: c.id,
        });
        break;
      }

      case "logistics":
        add({
          id: `bridge:${c.id}`,
          category: "logistics_volume",
          target: "Transport distance",
          why: c.detail,
          currentState: c.observed ?? "Unknown",
          nextAction:
            "Identify a nearer demand site, or document an alternative transport mode and re-run the analysis with a distance override.",
          reviewer: "commercial",
          blocking: c.status === "fail",
          priority: c.status === "fail" ? 1 : 2,
          checkId: c.id,
        });
        break;

      case "volume":
        add({
          id: `bridge:${c.id}`,
          category: "logistics_volume",
          target: "Available volume",
          why: c.detail,
          currentState: c.observed ?? "Not reported",
          nextAction:
            c.status === "fail"
              ? "Volume is below the recipient's minimum offtake. Consider aggregating with other sources of the same material, subject to separate characterisation."
              : "Report the annual available volume and its reporting period.",
          reviewer: "commercial",
          blocking: true,
          priority: c.status === "fail" ? 1 : 2,
          checkId: c.id,
        });
        break;

      case "economics":
        for (const input of econ.missingInputs) {
          add({
            id: `bridge:${c.id}:${input}`,
            category: "economic_input",
            target: input,
            why: "Economic feasibility cannot be estimated without this input, so no numeric score is produced.",
            currentState: "Not supplied",
            nextAction: `Supply ${lowerFirst(input)} with its basis (quotation, contract or documented assumption).`,
            reviewer: "commercial",
            blocking: false,
            priority: 3,
            checkId: c.id,
          });
        }
        break;
    }
  }

  if (state !== "ineligible") {
    add({
      id: "review:technical",
      category: "human_review",
      target: "Technical review",
      why: "Screening rules cannot establish fitness for use. A qualified engineer must review the data against the applicable specification.",
      currentState: "Not reviewed",
      nextAction: "Assign a technical reviewer and record the decision with its evidence in the review history.",
      reviewer: "technical_expert",
      blocking: true,
      priority: 2,
      checkId: null,
    });
    if (app.requiresRegulatoryReview) {
      add({
        id: "review:regulatory",
        category: "human_review",
        target: "Regulatory review",
        why: "Use of this material in this application is subject to jurisdiction-specific environmental and product rules.",
        currentState: "Not reviewed",
        nextAction: "Confirm with the competent authority or a regulatory specialist which permits, limits and tests apply at the receiving site.",
        reviewer: "regulatory",
        blocking: true,
        priority: 2,
        checkId: null,
      });
    }
  }

  return actions.sort(
    (a, b) => Number(b.blocking) - Number(a.blocking) || a.priority - b.priority || a.target.localeCompare(b.target),
  );
}
