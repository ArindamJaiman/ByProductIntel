import "server-only";
import { cache } from "react";
import { DEFAULT_SCENARIO } from "@/data/seed";
import { InvalidMaterialError } from "@/domain/engine/evaluate";
import type { MatchResult } from "@/domain/engine/result-types";
import { runMatching } from "@/domain/engine/run";
import type { Application, Material } from "@/domain/types";
import type { Repository } from "./repository/types";

export interface MaterialScreen {
  material: Material;
  /** Results for applications whose family scope includes this material. */
  inScope: MatchResult[];
  invalid: string | null;
}

export function isInScope(r: MatchResult) {
  return r.checks.find((c) => c.id === "identity")?.status !== "fail";
}

/**
 * Screen every visible material against every application under baseline
 * assumptions. Computed live from current data on each request — dashboard
 * figures are never hard-coded.
 */
export const baselineScreen = cache(async (repo: Repository): Promise<{ applications: Application[]; screens: MaterialScreen[] }> => {
  const [materials, applications] = await Promise.all([repo.listMaterials(), repo.listApplications()]);
  const screens = materials.map((material): MaterialScreen => {
    try {
      const { results } = runMatching({ material, applications, scenario: DEFAULT_SCENARIO });
      return { material, inScope: results.filter(isInScope), invalid: null };
    } catch (e) {
      if (e instanceof InvalidMaterialError) return { material, inScope: [], invalid: e.message };
      throw e;
    }
  });
  return { applications, screens };
});

export function isPromising(r: MatchResult) {
  return r.state === "potentially_eligible" || r.headline.startsWith("Promising candidate");
}
