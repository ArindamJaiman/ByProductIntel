import type { GeoPoint } from "../types";

const EARTH_RADIUS_KM = 6371.0088;

/** Great-circle distance in km (haversine). */
export function greatCircleKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearest<T extends GeoPoint>(origin: GeoPoint, sites: T[]): { site: T; km: number } {
  if (sites.length === 0) throw new Error("No sites to compare");
  let best = { site: sites[0], km: greatCircleKm(origin, sites[0]) };
  for (const site of sites.slice(1)) {
    const km = greatCircleKm(origin, site);
    if (km < best.km) best = { site, km };
  }
  return best;
}
