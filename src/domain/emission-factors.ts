/**
 * Emission factors used by the engine. Each one cites a record in the
 * evidence library and states its boundary. Only transport is covered:
 * emissions avoided by displacing a primary material need a life-cycle
 * model and are not estimated.
 */

export interface EmissionFactor {
  id: string;
  label: string;
  /** kg CO2e per tonne-km. */
  kgCo2ePerTonneKm: number;
  boundary: string;
  sourceId: string;
}

/**
 * GLEC Framework v3.2 (2025), Table 13, Indian road emission intensity:
 * heavy commercial vehicle, 30–50 t GVW, diesel, average load including empty
 * running. Tank-to-wheel. Road values already include a 5 % distance uplift.
 */
export const INDIA_ROAD_FREIGHT_HCV: EmissionFactor = {
  id: "glec-3.2-in-road-hcv-30-50t-diesel",
  label: "Indian heavy commercial vehicle, 30–50 t GVW, diesel, average load",
  kgCo2ePerTonneKm: 0.0509,
  boundary: "Tank-to-wheel (fuel burned in the truck). Excludes fuel production, loading, storage and processing.",
  sourceId: "src-glec-v32-india-road",
};
