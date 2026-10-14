import { FAMILY_LABELS, lowerFirst } from "../labels";
import { DEFAULT_WEIGHTS, type ScoreWeights } from "../scoring-config";
import type { Application, Material, ScenarioAssumptions } from "../types";
import { validateMaterial } from "../validation";
import { buildBridgePlan, DOC_LABELS } from "./bridge";
import { computeEconomics, computeEnvironment } from "./economics";
import { checkRequirement, resolveMeasurements } from "./requirements";
import type { Check, MatchResult, MatchState } from "./result-types";
import { computeScore, summariseTechnical } from "./score";

export class InvalidMaterialError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    super(`Material profile is invalid: ${issues.map((i) => i.message).join("; ")}`);
    this.name = "InvalidMaterialError";
  }
}

const HAZARD_LABEL = {
  declared_non_hazardous: "Declared non-hazardous",
  declared_hazardous: "Declared hazardous",
  not_declared: "Not declared",
} as const;

const fmtT = (t: number) => `${t.toLocaleString("en-IN")} t/yr`;

/** Stage 2 hard constraints that do not depend on property measurements. */
function gateChecks(material: Material, app: Application, econDistanceKm: number | null, offered: number | null): Check[] {
  const checks: Check[] = [];

  const familyOk = app.acceptedFamilies.includes(material.family);
  const identityEstablished = material.sourceProcess.trim().length > 0;
  checks.push({
    id: "identity",
    stage: "identity",
    label: "Material identity in validated scope",
    status: !identityEstablished ? "unknown" : familyOk ? "pass" : "fail",
    enforcement: "hard",
    safetyCritical: false,
    observed: `${FAMILY_LABELS[material.family]} — ${material.sourceProcess || "source process not declared"}`,
    required: app.acceptedFamilies.map((f) => FAMILY_LABELS[f]).join(" or "),
    detail: !identityEstablished
      ? "The source process is not declared, so material identity is insufficiently established."
      : familyOk
        ? "The material family is within this application's defined scope. Membership of a family does not imply suitability."
        : "The material family is outside the scope this application's rules were defined for. Suitability is not inferred across families.",
  });

  if (app.excludesDeclaredHazardous) {
    const s = material.hazard.status;
    checks.push({
      id: "hazard",
      stage: "hazard",
      label: "Hazard status compatible with intended use",
      status: s === "declared_non_hazardous" ? "pass" : s === "declared_hazardous" ? "fail" : "unknown",
      enforcement: "hard",
      safetyCritical: true,
      observed: `${HAZARD_LABEL[s]}${material.hazard.basis ? ` (${material.hazard.basis})` : ""}`,
      required: "Declared non-hazardous for this stream",
      detail:
        s === "not_declared"
          ? "No hazard declaration is recorded. Unknown is not treated as non-hazardous."
          : s === "declared_hazardous"
            ? "Declared hazardous material is excluded from this use."
            : `Declared non-hazardous (${material.hazard.verification.replace("_", " ")}). A declaration is not a substitute for application-specific testing.`,
      verification: material.hazard.verification,
    });
  }

  if (app.specStatus === "specification_not_established" || app.requirements.length === 0) {
    checks.push({
      id: "spec-established",
      stage: "specification",
      label: "Validated acceptance specification exists",
      status: "unknown",
      enforcement: "hard",
      safetyCritical: false,
      observed: "No acceptance criteria in dataset",
      required: "Application-specific, validated acceptance specification",
      detail: "This application has no validated acceptance specification, so compatibility cannot be assessed.",
    });
  }

  checks.push({
    id: "logistics",
    stage: "logistics",
    label: "Within maximum transport distance",
    status: econDistanceKm === null ? "unknown" : econDistanceKm <= app.logistics.maxTransportKm ? "pass" : "fail",
    enforcement: "hard",
    safetyCritical: false,
    observed: econDistanceKm === null ? null : `${econDistanceKm} km`,
    required: `≤ ${app.logistics.maxTransportKm} km by road`,
    detail:
      econDistanceKm !== null && econDistanceKm > app.logistics.maxTransportKm
        ? `The nearest demand site is ${econDistanceKm} km away, beyond the ${app.logistics.maxTransportKm} km limit configured for this application.`
        : `Nearest demand site is within the configured ${app.logistics.maxTransportKm} km limit.`,
    basis: app.logistics.basis,
  });

  checks.push({
    id: "volume",
    stage: "volume",
    label: "Meets recipient's minimum offtake",
    status: offered === null ? "unknown" : offered >= app.demand.minTonnesPerYear ? "pass" : "fail",
    enforcement: "hard",
    safetyCritical: false,
    observed: offered === null ? null : fmtT(offered),
    required: `≥ ${fmtT(app.demand.minTonnesPerYear)}`,
    detail:
      offered === null
        ? "Available volume is not reported."
        : offered >= app.demand.minTonnesPerYear
          ? "Offered volume meets the illustrative recipient's minimum annual offtake."
          : "Offered volume is below the illustrative recipient's minimum annual offtake.",
    basis: "demo_assumption",
  });

  return checks;
}

function evidenceChecks(material: Material, app: Application): Check[] {
  return app.evidenceRequirements.map((req) => {
    const doc = material.documents.find((d) => d.type === req.docType && d.status !== "requested");
    const requested = material.documents.find((d) => d.type === req.docType && d.status === "requested");
    const base: Check = {
      id: `evidence:${req.id}`,
      stage: "evidence",
      label: req.label,
      status: "unknown",
      enforcement: req.enforcement,
      safetyCritical: req.safetyCritical,
      observed: null,
      required: `${DOC_LABELS[req.docType]} on file`,
      detail: "",
      basis: req.basis,
      sourceId: req.sourceId,
      docType: req.docType,
    };
    if (!doc) {
      return {
        ...base,
        observed: requested ? "Requested, not yet received" : "Not supplied",
        detail: `${req.label} is not available. ${req.why}`,
      };
    }
    const verified = doc.status === "available_verified";
    return {
      ...base,
      status: "pass",
      observed: `${doc.title}${verified ? " (independently verified)" : " (supplied, unverified)"}`,
      detail: verified
        ? `${req.label} is on file and independently verified. Its results still require review against the application's requirements.`
        : `${req.label} is on file but has not been independently verified. Presence of a report does not mean its results are acceptable.`,
      provenance: doc.provenance,
      verification: verified ? "independently_verified" : "self_declared",
    };
  });
}

function decideState(checks: Check[]): MatchState {
  if (checks.some((c) => c.status === "fail" && c.enforcement === "hard")) return "ineligible";
  if (checks.some((c) => c.status === "unknown" && (c.enforcement === "hard" || c.safetyCritical))) {
    return "incomplete_evidence";
  }
  return "potentially_eligible";
}

function headlineFor(state: MatchState, checks: Check[]): string {
  if (state === "ineligible") return "Ineligible under current constraints";
  if (state === "potentially_eligible") return "Potentially eligible — subject to technical review";
  const anyKnownFail = checks.some((c) => c.status === "fail");
  const specChecks = checks.filter((c) => c.stage === "specification" && c.requirementId);
  const measured = specChecks.filter((c) => c.status !== "unknown").length;
  const hasSpec = specChecks.length > 0;
  return hasSpec && !anyKnownFail && measured / specChecks.length >= 0.6
    ? "Promising candidate — technical review required"
    : "Incomplete evidence — feasibility cannot yet be assessed";
}

function narrative(state: MatchState, checks: Check[], app: Application) {
  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];
  const specPass = checks.filter((c) => c.stage === "specification" && c.requirementId && c.status === "pass");
  const specFail = checks.filter((c) => c.stage === "specification" && c.status === "fail");
  const unknownHard = checks.filter((c) => c.status === "unknown" && (c.enforcement === "hard" || c.safetyCritical));
  const hardFails = checks.filter((c) => c.status === "fail" && c.enforcement === "hard");

  if (specPass.length) reasonsFor.push(`Declared values meet ${specPass.length} specification requirement(s): ${specPass.map((c) => c.label).join(", ")}.`);
  const logistics = checks.find((c) => c.id === "logistics");
  if (logistics?.status === "pass") reasonsFor.push(`Nearest demand site is ${logistics.observed} away.`);
  const vol = checks.find((c) => c.id === "volume");
  if (vol?.status === "pass") reasonsFor.push(`Offered volume (${vol.observed}) meets the minimum offtake.`);

  for (const c of hardFails) reasonsAgainst.push(`Fails hard constraint: ${c.detail}`);
  for (const c of specFail.filter((c) => c.enforcement === "soft")) reasonsAgainst.push(`Below target: ${c.detail}`);
  for (const c of unknownHard) reasonsAgainst.push(`Missing ${c.safetyCritical ? "safety-critical " : ""}evidence: ${c.label}.`);

  let summary: string;
  if (state === "ineligible") {
    summary = `Not suitable for ${lowerFirst(app.name)} under the current constraints: ${hardFails.map((c) => lowerFirst(c.label)).join(", ")} ${hardFails.length === 1 ? "fails" : "fail"} a hard rule.`;
  } else if (state === "incomplete_evidence") {
    summary = `${specPass.length ? "Available declared data fits the screening rules so far, but " : ""}${unknownHard.length} required item(s) are missing (${unknownHard.map((c) => lowerFirst(c.label)).join(", ")}). Feasibility cannot be established until they are supplied and reviewed.`;
  } else {
    summary = `Available data passes every configured screening rule for ${lowerFirst(app.name)}. This is a screening result, not an approval: technical${app.requiresRegulatoryReview ? " and regulatory" : ""} review is still required.`;
  }
  return { reasonsFor, reasonsAgainst, summary };
}

/**
 * Evaluate one material against one application. Pure and deterministic:
 * identical inputs always produce identical output.
 */
export function evaluateMatch(
  material: Material,
  app: Application,
  assumptions: ScenarioAssumptions,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): MatchResult {
  // Stage 1 — validate.
  const validation = validateMaterial(material);
  if (!validation.valid) throw new InvalidMaterialError(validation.issues.filter((i) => i.severity === "error"));
  const measurements = resolveMeasurements(material);

  // Stage 5 inputs are needed by stage-2 logistics/volume gates.
  const econ = computeEconomics(material, app, assumptions);

  // Stages 2–3 — hard gates, specification and evidence checks.
  const checks: Check[] = [
    ...gateChecks(material, app, econ.distanceKm, econ.offeredTonnes),
    ...app.requirements.map((r) => checkRequirement(r, measurements)),
    ...evidenceChecks(material, app),
  ];
  if (econ.status === "incomplete") {
    checks.push({
      id: "economics",
      stage: "economics",
      label: "Economic inputs available",
      status: "unknown",
      enforcement: "info",
      safetyCritical: false,
      observed: `Missing: ${econ.missingInputs.join(", ")}`,
      required: "Price, processing cost and volume",
      detail: "Economics cannot be estimated without these inputs.",
    });
  }

  const state = decideState(checks);
  const technical = summariseTechnical(checks);

  // Stage 4 — rank inputs; Stage 6 — environment; Stage 7 — bridge.
  const score = computeScore({ material, app, checks, technical, econ }, state, weights);
  const environment = computeEnvironment(material, econ);
  const bridge = buildBridgePlan(app, checks, econ, state);
  const { reasonsFor, reasonsAgainst, summary } = narrative(state, checks, app);

  return {
    materialId: material.id,
    applicationId: app.id,
    state,
    headline: headlineFor(state, checks),
    summary,
    checks,
    technical,
    economics: econ,
    environment,
    score,
    bridge,
    reasonsFor,
    reasonsAgainst,
    rank: null,
    rulesetVersion: app.rulesetVersion,
  };
}
