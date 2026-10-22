import "server-only";
import { nearest } from "@/domain/engine/geo";
import type { Application, DemandSite, GeoPoint, Material } from "@/domain/types";

/**
 * Road distances from OpenRouteService (heavy goods vehicle profile).
 * Server-side only: the key is read from ORS_API_KEY. Results are cached in
 * memory per server instance; failures are remembered briefly so a used-up
 * quota is not hit again on every page view.
 */

const ENDPOINT = "https://api.openrouteservice.org/v2/directions/driving-hgv";
const FAILURE_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 2000;

export const ROUTING_ATTRIBUTION = "Routes © openrouteservice.org by HeiGIT, map data © OpenStreetMap contributors";

const hits = new Map<string, number>();
const misses = new Map<string, number>();
const pending = new Map<string, Promise<number | null>>();

export function routingConfigured(): boolean {
  return process.env.BPI_DISABLE_EXTERNAL_SERVICES !== "1" && Boolean(process.env.ORS_API_KEY?.trim());
}

const keyOf = (a: GeoPoint, b: GeoPoint) => `${a.lat.toFixed(4)},${a.lon.toFixed(4)}>${b.lat.toFixed(4)},${b.lon.toFixed(4)}`;

async function fetchRoute(from: GeoPoint, to: GeoPoint, apiKey: string): Promise<number | null> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ coordinates: [[from.lon, from.lat], [to.lon, to.lat]] }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status !== 404) console.warn(`[routing] OpenRouteService returned HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { routes?: { summary?: { distance?: number } }[] };
    const metres = json.routes?.[0]?.summary?.distance;
    return typeof metres === "number" && Number.isFinite(metres) ? Number((metres / 1000).toFixed(1)) : null;
  } catch {
    return null;
  }
}

/** Road distance in km between two points, or null when it cannot be routed right now. */
export async function roadDistanceKm(from: GeoPoint, to: GeoPoint): Promise<number | null> {
  const apiKey = process.env.ORS_API_KEY?.trim();
  if (!apiKey || !routingConfigured()) return null;
  const key = keyOf(from, to);
  if (hits.has(key)) return hits.get(key)!;
  if (Date.now() - (misses.get(key) ?? 0) < FAILURE_TTL_MS) return null;
  let job = pending.get(key);
  if (!job) {
    job = fetchRoute(from, to, apiKey).finally(() => pending.delete(key));
    pending.set(key, job);
  }
  const km = await job;
  if (km === null) misses.set(key, Date.now());
  else {
    if (hits.size >= MAX_ENTRIES) hits.delete(hits.keys().next().value as string);
    hits.set(key, km);
  }
  return km;
}

export interface RoutedLeg {
  site: DemandSite;
  km: number;
}

/**
 * Routed distance from the material to the nearest demand site of every
 * application whose scope includes its family. The nearest site is chosen the
 * same way the engine chooses it, so a route always matches the site used.
 */
export async function routedLegs(material: Material, applications: Application[]): Promise<Record<string, RoutedLeg>> {
  if (!routingConfigured()) return {};
  const inScope = applications.filter((a) => a.acceptedFamilies.includes(material.family) && a.demandSites.length > 0);
  const legs = await Promise.all(
    inScope.map(async (a) => {
      const { site } = nearest(material.location, a.demandSites);
      const km = await roadDistanceKm(material.location, site);
      return [a.id, km === null ? null : { site, km }] as const;
    }),
  );
  return Object.fromEntries(legs.filter((l): l is readonly [string, RoutedLeg] => l[1] !== null));
}
