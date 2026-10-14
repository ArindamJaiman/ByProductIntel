---
name: industrial-byproduct-matching
description: Domain rules for the ByProduct Intelligence matching engine — material and application schemas, eligibility states, scoring, Missing-Bridge actions and evidence provenance. Use when changing anything under src/domain, src/data/seed, the matching UI, or when adding a material family, property, application, rule or source.
---

# Industrial by-product matching

The engine is a deterministic decision-support screen. It tells a user what a
material *could* become, what evidence is missing, and what to do next. It never
approves a material, never declares it safe, and never invents a specification,
certification or environmental saving.

Code lives in `src/domain/` (pure TypeScript, no I/O). Seed data lives in
`src/data/seed/`. Methodology is documented in `docs/matching-model.md` — keep it in
sync with any rule change.

## Schemas (see `src/domain/types.ts`)

**Material** — one specific stream, never a whole category. Required: `family`,
`sourceProcess`, `location`, `volume.tonnesPerYear` (`null` = not reported, never 0),
`hazard.status` (`declared_non_hazardous | declared_hazardous | not_declared`),
`currentHandling.kind`, `dataOrigin` (`synthetic_demo | user_supplied | verified_evidence`).
Each `Measurement` has `property`, `value`, `unit`, `provenance`, `verification`, optional
`method` and `documentId`. An absent property is unknown — do not store zeros or defaults.

**Application** — `acceptedFamilies` (exact categorical scope), `requirements[]`,
`evidenceRequirements[]`, `demand` (min/max t/yr), `demandSites[]`, `logistics.maxTransportKm`,
`economics` (price/processing may be `null`), `circularity.tier`, `requiresRegulatoryReview`,
`rulesetVersion`, `specStatus`.

**Requirement** — `kind: min | max | range | reported`, `unit`, `enforcement: hard | soft`,
`safetyCritical`, `basis: source_referenced | demo_assumption`, `rationale`, optional
`sourceId` and `remediation`. Only the bounds matching `kind` are applied.

## Eligibility rules (order matters)

1. **Validate** (`validateMaterial`): units must match the property's dimension; values must be
   finite and inside the property's plausible range; no duplicates; oxide closure ≤ 100.5 %;
   free CaO ≤ total CaO. Invalid profiles throw `InvalidMaterialError` — they are rejected, not scored.
2. **Hard gates**: identity in `acceptedFamilies`; hazard compatible; validated specification exists;
   distance ≤ `maxTransportKm`; volume ≥ `demand.minTonnesPerYear`.
3. **Specification checks**: compare in the property's canonical unit via `convert()`.
4. **Evidence checks**: a document counts only if present and not `requested`. Presence ≠ acceptable results.
5. **State**:
   - any hard `fail` → `ineligible`
   - else any `unknown` that is hard **or** safety-critical → `incomplete_evidence`
   - else → `potentially_eligible`
   - `approved` is never produced by the engine. Do not add it without an authorised, scoped
     human verification workflow with real approval evidence.

**Unknown is never a pass.** Never treat a missing measurement, an undeclared hazard or a missing
safety test as satisfied. Never let a remediation, a high score or a Missing-Bridge action change a
failed hard or safety constraint.

## Scoring (`src/domain/engine/score.ts`, config in `src/domain/scoring-config.ts`)

Weights (demo defaults, versioned as `SCORING_MODEL_VERSION`): technical 0.40, economic 0.20,
logistics 0.15, volume 0.10, circularity 0.10, evidence 0.05.

- Hard constraints stay outside the weighted sum. Ineligible → `not_ranked`, `total = null`.
- A total exists only when **every** component is computable. Missing components are not
  re-weighted away → `insufficient_data`.
- Technical fit needs ≥ `MIN_TECHNICAL_COVERAGE` (60 %) of spec properties measured.
- `scored` (potentially eligible) always ranks above `provisional` (incomplete evidence), which ranks
  above `insufficient_data` and `not_ranked`.
- Confidence is separate from score (coverage + verification level), capped at medium for synthetic data.
- Any change to weights, anchors or formulas **must bump `SCORING_MODEL_VERSION`** and update
  `docs/matching-model.md` and the scoring unit tests.

Limitations to state wherever scores are shown: weights are not industry-validated; the circularity
tier is ordinal, not an LCA; economics are indicative and theoretical, not realised savings.

## Explanation requirements for every match

Each `MatchResult` must expose: headline + plain-language summary generated from the checks; every
check with observed value, required value, basis and source; score components with weights and
formulas; economics inputs and formula; environmental method and its boundary; the Missing-Bridge
plan; reasons for and against. Text must be derived from structured results — an LLM, if ever added,
may only rephrase these structures and must preserve the state, values and actions exactly.

## Missing-Bridge actions (`src/domain/engine/bridge.ts`)

Generated only from check results. Each action has: target (field/test/certificate/requirement),
why it matters, current state, next action, reviewer type, source, `blocking`, and priority with the
rule that produced it (P1 safety/hazard/blocking failure; P2 hard or mandatory review; P3 score-only).
Always add technical review (and regulatory review when flagged) for non-ineligible candidates.
Next actions must not state numeric limits that are not in the application's rules.

## Evidence provenance

Every value carries `Provenance`: `verified_source | user_supplied | synthetic_demo |
calculated_estimate | hypothesis`, plus `VerificationState`. Rules carry `basis`. Rules marked
`source_referenced` must cite a `sourceId` in `src/data/seed/evidence.ts` (validation enforces it).

Source records must state title, organisation, URL, publication date (or null), access date, evidence
type, the **specific claim** used, review status and caveats. Only add a source you have actually read;
record whether you read the full text or a summary. Do not reproduce standard text — store only the
narrow fact used and point to the licensed document. Do not transfer a jurisdiction's or process's
limit to another without saying so in `rationale`.

**Never fabricate**: specification values presented as standards, certificates, test results, citations
for synthetic records, emissions savings, market sizes, or approval states. Unknown thresholds become
`demo_assumption` rules with that label, or are left out.

## Adding things without bypassing validation

- **Property**: add to `PROPERTIES` in `src/domain/properties.ts` with dimension, canonical unit,
  plausible range, group and help text. Add a conversion unit to `units.ts` only with a unit test.
- **Material family**: extend `MaterialFamily` (types.ts), the Zod enum in `validation.ts`,
  `FAMILY_LABELS`/`FAMILY_SHORT` in `labels.ts`, the SQL check constraint in
  `supabase/migrations`, and list it in the relevant applications' `acceptedFamilies`. Family
  membership must never imply suitability.
- **Application or rule**: add to `src/data/seed/applications.ts`; give every rule a `basis`,
  `rationale` and (if source-referenced) a `sourceId`; bump `rulesetVersion`; run
  `npm test` — the seed test asserts `validateApplication` passes for every application.
- **Source**: add to `src/data/seed/evidence.ts` following the record rules above.
- After any domain change run `npm test` and `npx tsx scripts/print-matrix.ts` to review the
  outcome matrix, and update `docs/matching-model.md` / `docs/data-provenance.md`.
