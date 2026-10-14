import type { Application, Material, ScenarioAssumptions } from "../types";
import type { EconomicsResult, EnvironmentResult } from "./result-types";
import { nearest } from "./geo";

export const ECONOMICS_FORMULA =
  "Net indicative benefit per tonne = material price + avoided current handling cost − transport (road km × ₹/t·km) − additional processing";

const round = (v: number, dp = 0) => Number(v.toFixed(dp));

export function resolveAssumptions(
  defaults: ScenarioAssumptions,
  override: Partial<ScenarioAssumptions> | undefined,
): ScenarioAssumptions {
  const merged = { ...defaults, ...(override ?? {}) };
  if (!(merged.transportCostInrPerTonneKm >= 0)) throw new RangeError("Transport cost must be ≥ 0");
  if (!(merged.roadCircuityFactor >= 1 && merged.roadCircuityFactor <= 3))
    throw new RangeError("Road circuity factor must be between 1 and 3");
  if (!(merged.recoveryFraction > 0 && merged.recoveryFraction <= 1))
    throw new RangeError("Recovery fraction must be in (0, 1]");
  for (const k of [
    "distanceKmOverride",
    "tonnesOfferedOverride",
    "materialPriceInrPerTonneOverride",
    "processingCostInrPerTonneOverride",
    "currentHandlingCostInrPerTonneOverride",
  ] as const) {
    const v = merged[k];
    if (v !== null && !(Number.isFinite(v) && v >= 0)) throw new RangeError(`${k} must be a non-negative number or null`);
  }
  return merged;
}

/**
 * Indicative per-tonne and annual economics. Only computed from available
 * inputs: a missing price or processing cost marks the result incomplete
 * rather than substituting a convenient number. Values are theoretical and
 * must not be read as realised savings.
 */
export function computeEconomics(
  material: Material,
  app: Application,
  a: ScenarioAssumptions,
): EconomicsResult {
  const { site, km: gcKm } = nearest(material.location, app.demandSites);
  const distanceKm = a.distanceKmOverride ?? round(gcKm * a.roadCircuityFactor, 1);
  const missingInputs: string[] = [];
  const notes: string[] = [];

  const offered = a.tonnesOfferedOverride ?? material.volume.tonnesPerYear;
  if (offered === null) missingInputs.push("Available volume (t/yr)");
  const acceptedTonnes =
    offered === null ? null : round(Math.min(offered * a.recoveryFraction, app.demand.maxTonnesPerYear));

  const price = a.materialPriceInrPerTonneOverride ?? app.economics.indicativePriceInrPerTonne;
  if (price === null) missingInputs.push("Indicative material price (₹/t)");
  const processing = a.processingCostInrPerTonneOverride ?? app.economics.processingCostInrPerTonne;
  if (processing === null) missingInputs.push("Additional processing cost (₹/t)");

  let avoidedHandling: number | null;
  if (a.currentHandlingCostInrPerTonneOverride !== null) {
    avoidedHandling = a.currentHandlingCostInrPerTonneOverride;
  } else if (material.currentHandling.kind === "existing_use") {
    avoidedHandling = 0;
    notes.push("The current pathway is an existing use, so no avoided handling cost is credited.");
  } else {
    avoidedHandling = material.currentHandling.costInrPerTonne;
    if (avoidedHandling === null) {
      notes.push("Current handling cost is not reported; it is excluded, so the net benefit may be understated.");
    }
  }

  const transport = round(distanceKm * a.transportCostInrPerTonneKm);
  const complete = price !== null && processing !== null && offered !== null;
  const net = complete ? round(price + (avoidedHandling ?? 0) - transport - processing) : null;

  return {
    status: complete ? "complete" : "incomplete",
    missingInputs,
    notes,
    demandSite: site,
    distanceKm,
    distanceBasis: a.distanceKmOverride !== null ? "override" : "great_circle_x_factor",
    greatCircleKm: round(gcKm, 1),
    offeredTonnes: offered,
    acceptedTonnes,
    perTonne: { price, avoidedHandling, transport, processing, net },
    annualNetInr: net !== null && acceptedTonnes !== null ? round(net * acceptedTonnes) : null,
    assumptions: a,
    formula: ECONOMICS_FORMULA,
  };
}

/**
 * Environmental indicators that can be stated without a life-cycle model.
 * Greenhouse-gas effects are deliberately not estimated: doing so needs a
 * system-boundary-specific methodology and sourced emission factors for the
 * displaced material, processing and transport.
 */
export function computeEnvironment(material: Material, econ: EconomicsResult): EnvironmentResult {
  const accepted = econ.acceptedTonnes;
  let diversion: EnvironmentResult["diversion"];
  if (accepted === null) {
    diversion = {
      status: "not_computed",
      tonnes: null,
      explanation: "Cannot be estimated because the available volume is not reported.",
    };
  } else if (material.currentHandling.kind !== "disposal_or_stockpile") {
    diversion = {
      status: "not_applicable",
      tonnes: null,
      explanation:
        material.currentHandling.kind === "existing_use"
          ? "The material already has a use, so redirecting it is not a diversion from disposal."
          : "The current handling pathway is unknown, so diversion from disposal cannot be established.",
    };
  } else {
    diversion = {
      status: "scenario_estimate",
      tonnes: accepted,
      explanation:
        "Scenario estimate: tonnes per year that could move from the current disposal or stockpile pathway if the exchange proceeded under these assumptions (offered tonnes × recovery fraction, capped at the recipient's maximum demand). Not a measured outcome.",
    };
  }
  return {
    diversion,
    transportActivityTonneKm:
      accepted !== null && econ.distanceKm !== null ? round(accepted * econ.distanceKm) : null,
    ghg: {
      status: "not_estimated",
      reason:
        "No emissions figure is shown. A defensible estimate needs a system boundary, sourced emission factors for the displaced primary material, processing energy and transport, and allocation rules for the by-product.",
    },
  };
}
