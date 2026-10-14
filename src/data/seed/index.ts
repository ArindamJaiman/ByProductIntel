import { DEFAULT_ASSUMPTIONS } from "@/domain/scoring-config";
import type { Scenario } from "@/domain/types";
import { APPLICATIONS } from "./applications";
import { EVIDENCE_SOURCES } from "./evidence";
import { MATERIALS, ORGANISATIONS } from "./materials";

export const SEED_VERSION = "seed-2026.10.14";

export const DEFAULT_SCENARIO: Scenario = {
  label: "Baseline assumptions",
  defaults: DEFAULT_ASSUMPTIONS,
  perApplication: {},
};

export { APPLICATIONS, EVIDENCE_SOURCES, MATERIALS, ORGANISATIONS };
