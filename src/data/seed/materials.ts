import type { Material, Measurement } from "@/domain/types";

/**
 * SYNTHETIC demonstration material profiles.
 *
 * Every value below was invented for this prototype. None describes a real
 * plant, company or test result. `verification` describes the *simulated*
 * state of each value so that the engine's handling of verification can be
 * demonstrated; the UI labels these as simulated.
 *
 * Coverage of engine behaviours (see docs/data-provenance.md):
 *  - BPI-DEMO-SLG-001 → promising candidate blocked by missing leaching evidence (sub-base);
 *                       failed hard constraint (concrete aggregate, free lime)
 *  - BPI-DEMO-SLG-002 → potentially eligible (sub-base); failed expansion (concrete)
 *  - BPI-DEMO-ASH-001 → potentially eligible (SCM); weak economics at distance (bricks)
 *  - BPI-DEMO-ASH-002 → multiple hard failures (SCM); eligible for bricks
 *  - BPI-DEMO-FSD-001 → insufficient data for a score (manufactured soil)
 *  - BPI-DEMO-GBS-001 → economics unattractive at long transport distance (GGBS)
 *  - BPI-DEMO-MSC-001 → incomplete environmental evidence (oil content); volume below minimum (sinter)
 */

const SEEDED_AT = "2026-09-01T09:00:00.000Z";

const m = (
  property: Measurement["property"],
  value: number,
  unit: Measurement["unit"],
  verification: Measurement["verification"],
  extra: Partial<Measurement> = {},
): Measurement => ({ property, value, unit, provenance: "synthetic_demo", verification, ...extra });

export const ORGANISATIONS = [
  { id: "org-demo-steel-east", name: "Eastern Demo Steelworks (synthetic)", kind: "producer" },
  { id: "org-demo-steel-central", name: "Central Demo Mini-Mill (synthetic)", kind: "producer" },
  { id: "org-demo-power-central", name: "Central Demo Thermal Station (synthetic)", kind: "producer" },
  { id: "org-demo-power-east", name: "Eastern Demo Thermal Station (synthetic)", kind: "producer" },
  { id: "org-demo-foundry-south", name: "Southern Demo Iron Foundry (synthetic)", kind: "producer" },
  { id: "org-demo-steel-coast", name: "Coastal Demo Ironworks (synthetic)", kind: "producer" },
  { id: "org-demo-rolling-central", name: "Central Demo Rolling Mill (synthetic)", kind: "producer" },
  { id: "org-demo-user", name: "Your organisation (demo workspace)", kind: "workspace" },
] as const;

export const MATERIALS: Material[] = [
  {
    id: "mat-bof-slag-weathered",
    code: "BPI-DEMO-SLG-001",
    name: "Weathered BOF slag, 10–40 mm",
    family: "steel_slag_bof",
    sourceProcess: "Basic oxygen furnace steelmaking; slag air-cooled, crushed and weathered for ~9 months",
    description:
      "Synthetic profile of a weathered BOF slag aggregate fraction after metal recovery. Composition and expansion values are simulated.",
    organisationId: "org-demo-steel-east",
    dataOrigin: "synthetic_demo",
    location: { site: "Slag yard (synthetic)", region: "Durgapur, West Bengal", country: "India", lat: 23.52, lon: 87.31 },
    volume: { tonnesPerYear: 180000, reportingPeriod: "FY 2025–26 (simulated)", provenance: "synthetic_demo" },
    hazard: { status: "declared_non_hazardous", basis: "Producer declaration (simulated)", verification: "self_declared" },
    currentHandling: { pathway: "Stockpiled in on-site slag yard", kind: "disposal_or_stockpile", costInrPerTonne: 120, provenance: "synthetic_demo" },
    measurements: [
      m("cao", 44.5, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg1-xrf" }),
      m("sio2", 13.8, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg1-xrf" }),
      m("al2o3", 1.9, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg1-xrf" }),
      m("fe2o3", 24.0, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg1-xrf" }),
      m("mgo", 5.6, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg1-xrf" }),
      m("so3", 0.3, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg1-xrf" }),
      m("fe_total", 18.5, "%", "lab_reported", { method: "Titration (simulated)", documentId: "doc-slg1-xrf" }),
      m("free_cao", 3.2, "%", "lab_reported", { method: "Ethylene glycol extraction (simulated)", documentId: "doc-slg1-xrf" }),
      m("volumetric_expansion", 1.8, "pct", "lab_reported", { method: "Accelerated steam expansion (simulated)", documentId: "doc-slg1-steam" }),
      m("water_absorption", 1.6, "pct", "self_declared"),
      m("la_abrasion", 21, "pct", "self_declared"),
      m("specific_gravity", 3.35, "-", "self_declared"),
      m("max_particle_size", 40, "mm", "self_declared"),
      m("chromium_total", 1450, "mg/kg", "lab_reported", { method: "Aqua regia digest + ICP-OES (simulated)", documentId: "doc-slg1-xrf" }),
    ],
    documents: [
      { id: "doc-slg1-xrf", type: "chemical_composition_report", title: "Chemical analysis, composite sample (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-06-12", provenance: "synthetic_demo" },
      { id: "doc-slg1-steam", type: "volumetric_stability_test", title: "Steam expansion test (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-06-20", provenance: "synthetic_demo" },
    ],
    createdAt: SEEDED_AT,
    updatedAt: "2026-09-18T11:20:00.000Z",
  },
  {
    id: "mat-eaf-slag",
    code: "BPI-DEMO-SLG-002",
    name: "EAF slag aggregate, 0–30 mm",
    family: "steel_slag_eaf",
    sourceProcess: "Electric arc furnace carbon steelmaking; slag air-cooled, crushed and aged",
    description: "Synthetic profile of an aged EAF slag aggregate with a simulated batch leaching report.",
    organisationId: "org-demo-steel-central",
    dataOrigin: "synthetic_demo",
    location: { site: "Mini-mill slag bay (synthetic)", region: "Raipur, Chhattisgarh", country: "India", lat: 21.37, lon: 81.66 },
    volume: { tonnesPerYear: 60000, reportingPeriod: "FY 2025–26 (simulated)", provenance: "synthetic_demo" },
    hazard: { status: "declared_non_hazardous", basis: "Classification report (simulated)", verification: "lab_reported" },
    currentHandling: { pathway: "Landfilled at a licensed facility", kind: "disposal_or_stockpile", costInrPerTonne: 650, provenance: "synthetic_demo" },
    measurements: [
      m("cao", 31.0, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg2-xrf" }),
      m("sio2", 16.0, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg2-xrf" }),
      m("al2o3", 6.0, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg2-xrf" }),
      m("fe2o3", 33.0, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg2-xrf" }),
      m("mgo", 7.0, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg2-xrf" }),
      m("so3", 0.2, "%", "lab_reported", { method: "XRF (simulated)", documentId: "doc-slg2-xrf" }),
      m("fe_total", 25.0, "%", "lab_reported", { documentId: "doc-slg2-xrf" }),
      m("free_cao", 0.6, "%", "lab_reported", { documentId: "doc-slg2-xrf" }),
      m("volumetric_expansion", 2.2, "pct", "lab_reported", { method: "Accelerated steam expansion (simulated)", documentId: "doc-slg2-steam" }),
      m("water_absorption", 2.4, "pct", "lab_reported"),
      m("max_particle_size", 30, "mm", "self_declared"),
      m("chromium_total", 2100, "mg/kg", "lab_reported", { documentId: "doc-slg2-xrf" }),
    ],
    documents: [
      { id: "doc-slg2-xrf", type: "chemical_composition_report", title: "Chemical analysis (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-05-02", provenance: "synthetic_demo" },
      { id: "doc-slg2-steam", type: "volumetric_stability_test", title: "Steam expansion test (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-05-10", provenance: "synthetic_demo" },
      { id: "doc-slg2-leach", type: "leaching_test_report", title: "Batch leaching test, L/S 10 (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-05-18", provenance: "synthetic_demo", note: "Results not evaluated by this software." },
    ],
    createdAt: SEEDED_AT,
    updatedAt: "2026-09-10T08:05:00.000Z",
  },
  {
    id: "mat-fly-ash-dry",
    code: "BPI-DEMO-ASH-001",
    name: "Dry fly ash, ESP fields 1–2",
    family: "fly_ash",
    sourceProcess: "Pulverised coal combustion; dry collection from electrostatic precipitator",
    description: "Synthetic profile of a low-calcium dry fly ash with simulated chemistry and strength activity data.",
    organisationId: "org-demo-power-central",
    dataOrigin: "synthetic_demo",
    location: { site: "Ash silo (synthetic)", region: "Chandrapur, Maharashtra", country: "India", lat: 19.96, lon: 79.3 },
    volume: { tonnesPerYear: 450000, reportingPeriod: "FY 2025–26 (simulated)", provenance: "synthetic_demo" },
    hazard: { status: "declared_non_hazardous", basis: "Producer declaration (simulated)", verification: "self_declared" },
    currentHandling: { pathway: "Part supplied to cement plants; balance to ash pond", kind: "disposal_or_stockpile", costInrPerTonne: 160, provenance: "synthetic_demo" },
    measurements: [
      m("sio2", 58.0, "%", "independently_verified", { method: "XRF (simulated)", documentId: "doc-ash1-chem" }),
      m("al2o3", 26.0, "%", "independently_verified", { method: "XRF (simulated)", documentId: "doc-ash1-chem" }),
      m("fe2o3", 5.5, "%", "independently_verified", { method: "XRF (simulated)", documentId: "doc-ash1-chem" }),
      m("cao", 2.1, "%", "independently_verified", { documentId: "doc-ash1-chem" }),
      m("mgo", 0.9, "%", "independently_verified", { documentId: "doc-ash1-chem" }),
      m("so3", 0.6, "%", "independently_verified", { documentId: "doc-ash1-chem" }),
      m("loi", 2.1, "%", "independently_verified", { documentId: "doc-ash1-chem" }),
      m("moisture", 0.4, "%", "independently_verified", { documentId: "doc-ash1-chem" }),
      m("fineness_45um_retained", 28, "pct", "lab_reported", { method: "Wet sieving (simulated)" }),
      m("strength_activity_index_28d", 82, "pct", "lab_reported", { documentId: "doc-ash1-sai" }),
    ],
    documents: [
      { id: "doc-ash1-chem", type: "chemical_composition_report", title: "Chemical analysis, monthly composite (simulated)", status: "available_verified", issuedBy: "Demo laboratory (synthetic)", date: "2026-07-31", provenance: "synthetic_demo" },
      { id: "doc-ash1-sai", type: "strength_activity_test", title: "Strength activity index, 7 and 28 d (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-08-05", provenance: "synthetic_demo" },
    ],
    createdAt: SEEDED_AT,
    updatedAt: "2026-09-21T14:45:00.000Z",
  },
  {
    id: "mat-pond-ash",
    code: "BPI-DEMO-ASH-002",
    name: "Pond ash, legacy lagoon",
    family: "fly_ash",
    sourceProcess: "Pulverised coal combustion; wet disposal of mixed fly and bottom ash to lagoon",
    description: "Synthetic profile of reclaimed wet pond ash with high unburnt carbon.",
    organisationId: "org-demo-power-east",
    dataOrigin: "synthetic_demo",
    location: { site: "Ash lagoon 2 (synthetic)", region: "Korba, Chhattisgarh", country: "India", lat: 22.38, lon: 82.75 },
    volume: { tonnesPerYear: 300000, reportingPeriod: "Reclamation plan 2026 (simulated)", provenance: "synthetic_demo" },
    hazard: { status: "declared_non_hazardous", basis: "Producer declaration (simulated)", verification: "self_declared" },
    currentHandling: { pathway: "Retained in ash lagoon", kind: "disposal_or_stockpile", costInrPerTonne: 90, provenance: "synthetic_demo" },
    measurements: [
      m("sio2", 55.0, "%", "lab_reported", { documentId: "doc-ash2-chem" }),
      m("al2o3", 24.0, "%", "lab_reported", { documentId: "doc-ash2-chem" }),
      m("fe2o3", 6.0, "%", "lab_reported", { documentId: "doc-ash2-chem" }),
      m("cao", 1.5, "%", "lab_reported", { documentId: "doc-ash2-chem" }),
      m("mgo", 0.8, "%", "lab_reported", { documentId: "doc-ash2-chem" }),
      m("so3", 0.4, "%", "lab_reported", { documentId: "doc-ash2-chem" }),
      m("loi", 9.8, "%", "lab_reported", { documentId: "doc-ash2-chem" }),
      m("moisture", 18, "%", "self_declared"),
    ],
    documents: [
      { id: "doc-ash2-chem", type: "chemical_composition_report", title: "Lagoon grab-sample analysis (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-04-14", provenance: "synthetic_demo" },
    ],
    createdAt: SEEDED_AT,
    updatedAt: "2026-08-28T10:00:00.000Z",
  },
  {
    id: "mat-foundry-sand",
    code: "BPI-DEMO-FSD-001",
    name: "Spent green sand, grey iron castings",
    family: "foundry_sand",
    sourceProcess: "Clay-bonded (green) sand moulding for grey iron castings",
    description: "Synthetic profile with only basic physical data. Used to demonstrate the insufficient-data path.",
    organisationId: "org-demo-foundry-south",
    dataOrigin: "synthetic_demo",
    location: { site: "Foundry sand bay (synthetic)", region: "Coimbatore, Tamil Nadu", country: "India", lat: 11.02, lon: 76.96 },
    volume: { tonnesPerYear: 9000, reportingPeriod: "Calendar 2025 (simulated)", provenance: "synthetic_demo" },
    hazard: { status: "not_declared", verification: "unverified" },
    currentHandling: { pathway: "Sent to landfill", kind: "disposal_or_stockpile", costInrPerTonne: 900, provenance: "synthetic_demo" },
    measurements: [
      m("sio2", 86, "%", "self_declared"),
      m("clay_content", 7, "%", "self_declared"),
      m("max_particle_size", 1.2, "mm", "self_declared", { documentId: "doc-fsd-psd" }),
    ],
    documents: [
      { id: "doc-fsd-psd", type: "particle_size_analysis", title: "Sieve analysis (simulated)", status: "available_unverified", issuedBy: "In-house (synthetic)", date: "2026-02-03", provenance: "synthetic_demo" },
      { id: "doc-fsd-metals", type: "heavy_metals_analysis", title: "Metals analysis", status: "requested", provenance: "synthetic_demo", note: "Requested from a laboratory; not yet received (simulated)." },
    ],
    createdAt: SEEDED_AT,
    updatedAt: "2026-07-15T16:30:00.000Z",
  },
  {
    id: "mat-gbfs",
    code: "BPI-DEMO-GBS-001",
    name: "Water-granulated blast furnace slag",
    family: "blast_furnace_slag_granulated",
    sourceProcess: "Blast furnace ironmaking; slag water-quenched at the cast house",
    description: "Synthetic profile of a highly glassy granulated slag far from the illustrative cement grinding unit.",
    organisationId: "org-demo-steel-coast",
    dataOrigin: "synthetic_demo",
    location: { site: "Granulation plant (synthetic)", region: "Visakhapatnam, Andhra Pradesh", country: "India", lat: 17.69, lon: 83.22 },
    volume: { tonnesPerYear: 400000, reportingPeriod: "FY 2025–26 (simulated)", provenance: "synthetic_demo" },
    hazard: { status: "declared_non_hazardous", basis: "Producer declaration (simulated)", verification: "self_declared" },
    currentHandling: { pathway: "Stockpiled pending sale", kind: "disposal_or_stockpile", costInrPerTonne: 80, provenance: "synthetic_demo" },
    measurements: [
      m("cao", 37.0, "%", "lab_reported", { documentId: "doc-gbs-chem" }),
      m("sio2", 34.0, "%", "lab_reported", { documentId: "doc-gbs-chem" }),
      m("al2o3", 18.0, "%", "lab_reported", { documentId: "doc-gbs-chem" }),
      m("mgo", 8.5, "%", "lab_reported", { documentId: "doc-gbs-chem" }),
      m("fe2o3", 0.6, "%", "lab_reported", { documentId: "doc-gbs-chem" }),
      m("so3", 1.0, "%", "lab_reported", { documentId: "doc-gbs-chem" }),
      m("glass_content", 92, "pct", "lab_reported", { method: "XRD (simulated)", documentId: "doc-gbs-chem" }),
      m("moisture", 9, "%", "self_declared"),
    ],
    documents: [
      { id: "doc-gbs-chem", type: "chemical_composition_report", title: "Chemical and glass content analysis (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-08-19", provenance: "synthetic_demo" },
    ],
    createdAt: SEEDED_AT,
    updatedAt: "2026-09-25T09:10:00.000Z",
  },
  {
    id: "mat-mill-scale",
    code: "BPI-DEMO-MSC-001",
    name: "Mill scale, hot strip mill",
    family: "mill_scale",
    sourceProcess: "Hot rolling; scale removed by descaling sprays and collected in scale pits",
    description: "Synthetic profile of iron-rich mill scale with no oil and grease data.",
    organisationId: "org-demo-rolling-central",
    dataOrigin: "synthetic_demo",
    location: { site: "Scale pit (synthetic)", region: "Siltara, Chhattisgarh", country: "India", lat: 21.4, lon: 81.68 },
    volume: { tonnesPerYear: 25000, reportingPeriod: "FY 2025–26 (simulated)", provenance: "synthetic_demo" },
    hazard: { status: "declared_non_hazardous", basis: "Producer declaration (simulated)", verification: "self_declared" },
    currentHandling: { pathway: "Sold to local traders at low value", kind: "existing_use", costInrPerTonne: null, provenance: "synthetic_demo" },
    measurements: [
      m("fe_total", 71.5, "%", "lab_reported", { documentId: "doc-msc-chem" }),
      m("max_particle_size", 5, "mm", "self_declared"),
    ],
    documents: [
      { id: "doc-msc-chem", type: "chemical_composition_report", title: "Iron assay (simulated)", status: "available_unverified", issuedBy: "Demo laboratory (synthetic)", date: "2026-03-30", provenance: "synthetic_demo" },
    ],
    createdAt: SEEDED_AT,
    updatedAt: "2026-08-02T12:00:00.000Z",
  },
];
