import Link from "next/link";
import { BasisTag, PageHeader, StateBadge } from "@/components/ui";
import { PRIORITY_RULES } from "@/domain/engine/bridge";
import { weightVariants } from "@/domain/engine/robustness";
import { SENSITIVITY_DELTA } from "@/domain/engine/sensitivity";
import {
  CIRCULARITY_TIER_LABEL,
  CIRCULARITY_TIER_VALUE,
  COMPONENT_LABELS,
  DEFAULT_ASSUMPTIONS,
  DEFAULT_WEIGHTS,
  ECONOMIC_ANCHORS_INR_PER_T,
  ENGINE_VERSION,
  MIN_TECHNICAL_COVERAGE,
  SCORING_MODEL_VERSION,
  type ScoreComponentKey,
} from "@/domain/scoring-config";

export const metadata = { title: "Methodology and limitations" };

export default function MethodologyPage() {
  return (
    <>
      <PageHeader
        title="Methodology and limitations"
        lede={`How the engine reaches a result, what its numbers mean, and what it cannot tell you. Engine ${ENGINE_VERSION}, scoring model ${SCORING_MODEL_VERSION}.`}
      />
      <div className="prose-bpi">
        <h2>A possible match is not a verified application</h2>
        <p>
          The software compares the data recorded for one by-product stream with rules recorded for one application. A positive result means the
          available data passes the configured screening rules. It does not mean the material is safe, compliant or approved, and it does not
          replace laboratory testing, a qualified engineer&apos;s review or a regulator&apos;s decision.
        </p>

        <h2>Stage 1: validation</h2>
        <p>
          Every measurement must use a unit that matches the property&apos;s physical dimension, be a finite number inside a plausible range, and appear
          only once. The major oxides cannot sum above 100 %, and free lime cannot exceed total lime. Invalid profiles are rejected rather than scored.
          Values are converted to a canonical unit by tested conversion functions before any comparison.
        </p>

        <h2>Stage 2: hard constraints come first</h2>
        <p>Before anything is ranked, five kinds of hard gate are applied:</p>
        <ul>
          <li>Material identity: the family must be within the application&apos;s defined scope, and the source process must be declared. Membership of a family never implies suitability.</li>
          <li>Hazard status: a declared hazardous material is excluded where the application excludes it; an undeclared status is unknown, not non-hazardous.</li>
          <li>A validated acceptance specification must exist for the application.</li>
          <li>Hard technical thresholds and required documents, some marked safety-critical.</li>
          <li>Transport distance to the nearest demand site and the recipient&apos;s minimum offtake.</li>
        </ul>
        <p>The result is one of three states, decided strictly in this order:</p>
        <ul>
          <li><StateBadge state="ineligible" /> any hard rule fails.</li>
          <li><StateBadge state="incomplete_evidence" /> otherwise, any hard or safety-critical item is unknown.</li>
          <li><StateBadge state="potentially_eligible" /> otherwise. Technical review is still required.</li>
        </ul>
        <p>
          An “approved for a specified use” state is never produced. It would need an authorised, scoped verification workflow with real approval
          evidence, which this prototype deliberately does not implement. <strong>Unknown is never treated as a pass.</strong>
        </p>

        <h2>Stage 3: technical comparison</h2>
        <p>
          Rules can set a minimum, a maximum, an interval, or simply require a value to be reported. Each rule is either hard (a failure makes the
          candidate ineligible) or soft (a failure lowers the score). Every rule shows its basis: <BasisTag basis="source_referenced" /> rules cite a
          specific source and its caveats; <BasisTag basis="demo_assumption" /> rules are thresholds chosen to demonstrate the engine and must be
          replaced by validated, application-specific specifications before real use.
        </p>

        <h2>Stage 4: the score</h2>
        <p>
          Only candidates that survive the hard gates receive a total. The total is the weighted sum of six components, each between 0 and 1,
          multiplied by 100:
        </p>
        <table className="my-3 w-full text-sm">
          <thead>
            <tr className="border-b border-rule-strong text-left">
              <th className="py-1.5 pr-3">Component</th>
              <th className="py-1.5 pr-3 text-right">Weight</th>
              <th className="py-1.5">Formula</th>
            </tr>
          </thead>
          <tbody className="text-ink-2">
            {(Object.keys(DEFAULT_WEIGHTS) as ScoreComponentKey[]).map((k) => (
              <tr key={k} className="border-b border-rule align-top">
                <td className="py-1.5 pr-3 font-semibold text-ink">{COMPONENT_LABELS[k]}</td>
                <td className="py-1.5 pr-3 text-right">{Math.round(DEFAULT_WEIGHTS[k] * 100)} %</td>
                <td className="py-1.5">{FORMULAS[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul>
          <li>If any component cannot be computed, the result reads “Insufficient data”. Missing components are not quietly re-weighted away.</li>
          <li>Technical fit needs at least {Math.round(MIN_TECHNICAL_COVERAGE * 100)} % of the specification properties to be measured.</li>
          <li>Scored candidates always rank above provisional ones (those with missing hard evidence), which rank above candidates without a numeric score. Ineligible candidates are never ranked.</li>
          <li>Confidence is reported separately from the score. It reflects how complete and how well verified the data is, and is capped at medium for synthetic data.</li>
        </ul>
        <p>
          The weights are demonstration defaults, not industry-validated constants. They are stored with every run, together with the engine and
          ruleset versions and a fingerprint of all inputs, so a stored run can be reproduced exactly. You can change the weights in the{" "}
          <Link href="/scenarios" className="text-copper underline">scenario view</Link>.
        </p>

        <h2>Stage 5: indicative economics</h2>
        <p>
          Net indicative benefit per tonne = material price + avoided current handling cost − transport (road distance × freight rate) − additional
          processing. Road distance defaults to great-circle distance × {DEFAULT_ASSUMPTIONS.roadCircuityFactor}; freight defaults to ₹
          {DEFAULT_ASSUMPTIONS.transportCostInrPerTonneKm}/t·km; {Math.round(DEFAULT_ASSUMPTIONS.recoveryFraction * 100)} % of offered material is assumed
          to be accepted after processing. All of these are illustrative assumptions. If a price or processing cost is missing, economics are marked
          incomplete; no convenient number is substituted. Avoided handling cost is not credited when the material already has a use. Theoretical
          revenue is not realised savings.
        </p>

        <h2>Stage 6: environmental effects</h2>
        <p>
          The engine reports two things it can state without a life-cycle model: the tonnes that could be diverted from a disposal or stockpile
          pathway under the scenario (only when the current pathway is disposal or stockpiling), and transport activity in tonne-kilometres. It does
          not report greenhouse-gas savings. A defensible figure needs a defined system boundary, sourced emission factors for the displaced primary
          material, processing and transport, and allocation rules for the by-product. The circularity component is an ordinal tier (
          {Object.entries(CIRCULARITY_TIER_VALUE)
            .map(([k, v]) => `${CIRCULARITY_TIER_LABEL[k as keyof typeof CIRCULARITY_TIER_LABEL].split(" (")[0].toLowerCase()} = ${v}`)
            .join("; ")}
          ), not an emissions estimate.
        </p>

        <h2>Stage 7: the Missing-Bridge plan</h2>
        <p>
          Every unknown or failed rule becomes an action naming the missing field, test, certificate or requirement; why it matters; its current
          state; the next action; and who must review it. Priorities follow a fixed rule:
        </p>
        <ul>
          {Object.values(PRIORITY_RULES).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p>
          A technical review action is always added for candidates that are not ineligible, and a regulatory review where the application requires
          it. Actions never state a numeric limit that is not already in the application&apos;s rules, and no action can override a failed safety or
          regulatory constraint. Processing routes are shown as possibilities to test, not as fixes.
        </p>

        <h2>Decision tools built on the same engine</h2>
        <p>Each tool below re-uses the engine&apos;s own results. None of them can change a state, relax a rule or produce an approval.</p>

        <h3>Test planner</h3>
        <p>
          For each material, every hard or safety-critical item that is still unknown is mapped to what would supply it: a laboratory package, a
          single measurement, a producer declaration or a recipient specification. Measurements are grouped with the report that normally carries
          them, for example total chromium and lead with a heavy metals analysis. That grouping is an assumption and never marks anything as measured.
        </p>
        <ul>
          <li>An item &ldquo;completes&rdquo; a pathway when it is the only thing outstanding there. A completed pathway is <em>assessable</em>, not eligible: the new result can still fail.</li>
          <li>Items are ranked by pathways completed alone, then indicative value at stake, then pathways gated. The recommended order is greedy, taking the item that completes the most pathways at each step.</li>
          <li>Pathways with a known hard failure are left out, because no test changes a known failure.</li>
        </ul>

        <h3>Break-even and sensitivity</h3>
        <p>
          From the economics formula, the break-even road distance is (price + avoided handling − processing) ÷ freight rate. The same rearrangement
          gives the highest freight rate, lowest price and highest processing cost that still break even. Sensitivity moves each input{" "}
          {SENSITIVITY_DELTA * 100} % down and up, one at a time, and re-runs the full engine, so a move that crosses a transport limit shows up as a
          change of state.
        </p>

        <h3>Rank robustness</h3>
        <p>
          A run&apos;s actionable candidates are re-ranked under {weightVariants(DEFAULT_WEIGHTS).length} weight sets: the run&apos;s own, equal weights, and
          each weight halved and raised by half (re-normalised). Component values are reused unchanged. A ranking is reported as holding when the same
          candidate leads under every set; otherwise the weight sets that overturn it are listed.
        </p>

        <h3>Pooling finder</h3>
        <p>
          A source qualifies when its only failed hard rule is the recipient&apos;s minimum offtake. Qualifying sources of the same material family that
          deliver to the same demand site are grouped, and a pool is shown when their combined volume meets the minimum. Pools never cross families,
          the engine does not infer the properties of a blend, and each member keeps its own outstanding items.
        </p>

        <h3>Group portfolio, evidence passport and run comparison</h3>
        <ul>
          <li>The portfolio counts each material once, against its best ranked pathway (or, failing that, one still awaiting evidence), so tonnes and value are never double-counted. Value totals include only pathways with a positive indicative net.</li>
          <li>The evidence passport is a printable record of one material: every value with provenance, documents, screening outcomes and open actions, with a fingerprint that changes whenever the record does.</li>
          <li>Run comparison lists every input that differs between two stored runs of one material and the effect on each pathway&apos;s state, score and individual checks.</li>
        </ul>

        <h2>Sources and data status</h2>
        <p>
          Every value carries a provenance label: verified source fact, user-supplied, synthetic demo value, calculated estimate, or hypothesis. All
          demo materials are synthetic and cite no sources. The <Link href="/evidence" className="text-copper underline">evidence library</Link> lists each
          external source with the specific claim it supports and how thoroughly it was read.
        </p>

        <h2>What the software cannot establish</h2>
        <ul>
          <li>Whether a material is safe for a use, or whether its leachate is acceptable at a particular site.</li>
          <li>Which regulations, permits and test methods apply in a given jurisdiction.</li>
          <li>Whether a sample is representative of the stream over time, or whether a laboratory result is reliable.</li>
          <li>Real prices, freight rates, buyer demand, or contractual terms.</li>
          <li>Life-cycle emissions or other environmental impacts.</li>
        </ul>

        <h2>Known model limitations</h2>
        <ul>
          <li>
            Most thresholds are demonstration assumptions. Only a few are source-referenced, and those come from secondary summaries or another
            jurisdiction. Results show how the method behaves, not whether a real material suits a real use.
          </li>
          <li>Rules are single-property thresholds. Grading curves, mix design, combined chemistry and sample-to-sample variability are not modelled.</li>
          <li>Leaching is checked only as &ldquo;report present or absent&rdquo;. No leachate values are evaluated.</li>
          <li>Distances are straight-line × a circuity factor, not routed, and only road transport is modelled.</li>
          <li>Economics are per-tonne linear estimates with no capex, contracts, taxes or price elasticity.</li>
          <li>Score weights and anchors are not industry-validated.</li>
        </ul>
        <p>Laboratory testing, expert technical review and regulatory confirmation remain necessary before any by-product is used.</p>
      </div>
    </>
  );
}

const FORMULAS: Record<ScoreComponentKey, string> = {
  technical: "Passing requirements ÷ measured requirements. Unmeasured requirements are excluded here and lower evidence completeness instead.",
  economic: `Net ₹/t mapped linearly from ₹${ECONOMIC_ANCHORS_INR_PER_T.floor}/t (0) to ₹${ECONOMIC_ANCHORS_INR_PER_T.ceiling}/t (1).`,
  logistics: "1 − road distance ÷ maximum transport distance for the application.",
  volume: "Average of the share of recoverable material the recipient can absorb and the share of the recipient's maximum demand filled.",
  circularity: "Ordinal tier of the primary material substituted.",
  evidence: "Required measurements and documents available ÷ required.",
};
