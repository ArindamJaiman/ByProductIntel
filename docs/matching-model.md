# Matching model

Engine `bpi-engine-0.1.0`, scoring model `bpi-score-0.1.0`. Code: `src/domain/engine/`. Configuration: `src/domain/scoring-config.ts`.

## Stage 1 — validation (`validateMaterial`)
- Each measurement's unit must match its property's dimension (e.g. `%`, `mg/kg`, `g/kg`, `ppm` are mass fractions; `pct` is a non-mass percentage such as expansion).
- Values must be finite and within the property's plausible range. No duplicates. Referenced documents must exist.
- Major oxides (CaO, SiO₂, Al₂O₃, Fe₂O₃, MgO, SO₃) must not sum above 100.5 %. Free CaO must not exceed total CaO.
- A reported SiO₂+Al₂O₃+Fe₂O₃ that differs from its parts by more than 1 point is a warning.
- Invalid profiles throw `InvalidMaterialError`; they are never scored.
- The oxide sum is derived when all three parts exist and it is not reported. It is labelled `calculated_estimate` and carries the weakest verification of its parts. Nothing else is inferred.

## Stage 2 — hard gates
| Check | Pass | Fail | Unknown |
|---|---|---|---|
| Identity | family ∈ `acceptedFamilies` | family outside scope | source process not declared |
| Hazard (if excluded) | declared non-hazardous | declared hazardous | not declared |
| Specification exists | — | — | no requirements / `specification_not_established` |
| Logistics | road km ≤ `maxTransportKm` | beyond | — |
| Volume | offered ≥ minimum offtake | below | volume not reported |

## Stage 3 — specification and evidence checks
`min`, `max`, `range` (inclusive bounds) and `reported`. Only the bounds relevant to the kind are applied. Requirement and measurement are both converted to the property's canonical unit by `convert()`. A missing value yields `unknown`. A document passes only if present and not `requested`; presence does not imply acceptable results.

## State decision
```
if any hard check fails                         → ineligible
else if any check is unknown and (hard or safety-critical) → incomplete_evidence
else                                            → potentially_eligible
```
Headline for incomplete evidence: "Promising candidate — technical review required" when a specification exists, nothing failed and ≥ 60 % of specification properties are measured; otherwise "Incomplete evidence — feasibility cannot yet be assessed". "Approved" is never emitted.

## Stage 4 — score
`total = Σ weightᵢ × valueᵢ × 100`, rounded to 0.1.

| Component | Weight | value (0–1) |
|---|---:|---|
| Technical fit | 0.40 | passed ÷ measured specification requirements; `null` if coverage < 60 % or no spec |
| Economic | 0.20 | clamp((net ₹/t + 500) ÷ 1500); `null` if economics incomplete |
| Logistics | 0.15 | clamp(1 − road km ÷ max km) |
| Volume | 0.10 | ½·(accepted ÷ (offered × recovery)) + ½·(accepted ÷ recipient max) |
| Circularity | 0.10 | ordinal tier: 1.0 / 0.7 / 0.4 |
| Evidence | 0.05 | available required measurements and documents ÷ required |

Rules:
- Ineligible → `not_ranked`, no total. Components are still shown for transparency.
- Any `null` component → `insufficient_data`, no total. Nothing is re-weighted.
- Potentially eligible → `scored`; incomplete evidence with all components → `provisional`.
- Ranking: scored (desc) › provisional (desc) › insufficient data › not ranked; ties by application id.
- Custom weights are normalised to sum to 1 (`normaliseWeights`) and stored with the run.

**Rationale for the defaults:** technical fit dominates because an exchange is impossible without it. Economics and logistics together (35 %) reflect that bulk minerals are freight-sensitive. Volume and circularity differentiate otherwise similar pathways. Evidence completeness is small in the score because missing *hard* evidence already gates the state. These are demonstration defaults, not validated constants.

**Confidence** (separate from score): one point each for full specification coverage, ≥ 80 % of measured values lab-reported or independently verified, and all required documents independently verified. 3 points → high; ≥ 1 point and coverage ≥ 60 % → medium; else low. Synthetic profiles are capped at medium.

## Stage 5 — economics
```
offered  = override ?? material tonnes/yr
accepted = min(offered × recoveryFraction, recipient max demand)
road km  = override ?? great-circle(material, nearest demand site) × circuity
net ₹/t  = price + avoided handling − road km × ₹/t·km − processing
annual   = net × accepted
```
A missing price, processing cost or volume → `incomplete`. Avoided handling is 0 for an existing use, and is excluded (with a note) if unknown. Defaults: ₹4.5/t·km, circuity 1.3, recovery 0.9. All are illustrative assumptions.

## Stage 6 — environment
- Diversion (scenario estimate) = accepted tonnes, only when the current pathway is disposal or stockpile.
- Transport activity = accepted × road km (tonne-km).
- Greenhouse-gas effect: not estimated (see `docs/limitations.md`).

## Stage 7 — Missing-Bridge plan
One action per unknown or failed check, plus technical review (always, unless ineligible), regulatory review (when flagged) and an independent review of each unverified safety-critical document. Priority: P1 safety-critical, hazard or blocking failure; P2 hard rule or mandatory review; P3 score-only. Blocking actions come first.

## Reproducibility
Each run stores `engineVersion`, `scoringModelVersion`, per-application `rulesetVersion`, weights, scenario, material and application snapshots, and `inputHash` (FNV-1a of a sorted-key serialisation). Re-running `runMatching` on the stored inputs reproduces the results (unit-tested).

## How to change things
- **Weights or anchors:** edit `scoring-config.ts`, bump `SCORING_MODEL_VERSION`, update this file and the scoring tests.
- **New application category:** add it to `src/data/seed/applications.ts` with a `basis`, `rationale` and (if source-referenced) a `sourceId` for every rule; set `rulesetVersion`; run `npm test` (the seed is validated) and `npm run matrix`.
- **New source:** add it to `src/data/seed/evidence.ts` with the specific claim it supports and how thoroughly it was read.
- **Validated material requirement:** add the property to `src/domain/properties.ts` if new, then add a `Requirement` with `basis: "source_referenced"` and `sourceId`. The validator rejects source-referenced rules without a source.
- See `.claude/skills/industrial-byproduct-matching/SKILL.md` for the full rules.
