# Data provenance

## Provenance and verification labels
Every value carries a **provenance**: `verified_source`, `user_supplied`, `synthetic_demo`, `calculated_estimate` or `hypothesis`. Measurements and declarations also carry a **verification state**: `unverified`, `self_declared`, `lab_reported` or `independently_verified`. Each material record has a **data origin**: `synthetic_demo`, `user_supplied` or `verified_evidence`. Each application rule has a **basis**: `source_referenced` or `demo_assumption`.

## Synthetic demonstration data
All seven material profiles in `src/data/seed/materials.ts` are invented. They do not describe any real plant, company or test, and they cite no sources. Their verification states are simulated, and the UI shows them as "simulated lab-reported" and so on. Organisation names end in "(synthetic)". City-level locations are real places, used only to compute illustrative distances.

| Code | Purpose in the demo |
|---|---|
| BPI-DEMO-SLG-001 | Promising sub-base candidate blocked by a missing leaching report; fails concrete-aggregate free-lime rule; eligible for clinker raw mix with a processing action |
| BPI-DEMO-SLG-002 | Potentially eligible for sub-base (unverified leaching report triggers a review action); fails concrete expansion rule |
| BPI-DEMO-ASH-001 | Potentially eligible SCM; bricks pathway has negative indicative economics |
| BPI-DEMO-ASH-002 | Fails LOI, moisture and distance for SCM; eligible for bricks |
| BPI-DEMO-FSD-001 | Undeclared hazard and missing metals data: insufficient data for a score |
| BPI-DEMO-GBS-001 | Eligible GGBS whose economics are negative at ~1,050 km and recover at shorter distances |
| BPI-DEMO-MSC-001 | Oil content unknown (incomplete environmental evidence); below sinter-plant minimum offtake |

Run `npm run matrix` to print the full outcome matrix.

## Application rules
Of the 10 illustrative applications, rule thresholds are **demonstration assumptions** unless marked otherwise. Source-referenced rules:
- Fly ash SCM: SiO₂+Al₂O₃+Fe₂O₃ ≥ 70 %, SO₃ ≤ 5 %, moisture ≤ 3 %, LOI ≤ 6 %. From a secondary summary (Penn State course page) of ASTM C618 Class F. The edition is unconfirmed.
- Granular sub-base: free CaO ≤ 4.5 %, the limit FHWA reports for Belgium and the Netherlands, used as a screening reference only.

Demand sites, prices, processing costs and freight rates are illustrative and are not buyers or quotations.

## External sources
The 15 records in `src/data/seed/evidence.ts` (also shown at `/evidence`) were located on 2026-10-14. Each states the narrow claim it supports, its review depth (full text, summary/abstract, or secondary only) and its caveats. No standard text is reproduced. Competitor and project sources are listed in `docs/market-landscape.md`.

## User data
Materials created in the app or imported by CSV are `user_supplied`. CSV imports are always `unverified`. Users cannot assign independent verification; that requires an authorised review workflow outside this MVP.

## Confidential data
No Tata or other company-internal data, personal data or scraped content is included.
