import Link from "next/link";
import { BridgeSpan } from "@/components/bridge-span";
import { Brand } from "@/components/brand";
import { BasisTag, buttonStyles, StateBadge } from "@/components/ui";
import { APPLICATIONS, DEFAULT_SCENARIO, MATERIALS } from "@/data/seed";
import { runMatching } from "@/domain/engine/run";
import { lowerFirst } from "@/domain/labels";
import { COMPONENT_LABELS, DEFAULT_WEIGHTS, type ScoreComponentKey } from "@/domain/scoring-config";

// Engine output for one synthetic profile, computed from the seed data at render time.
const heroMaterial = MATERIALS.find((m) => m.code === "BPI-DEMO-SLG-001")!;
const heroApp = APPLICATIONS.find((a) => a.id === "app-granular-subbase")!;
const heroResult = runMatching({ material: heroMaterial, applications: [heroApp], scenario: DEFAULT_SCENARIO }).results[0];
const heroPass = heroResult.checks.filter((c) => c.stage === "specification" && c.status === "pass");
const heroBlocker = heroResult.bridge.find((b) => b.blocking && b.category !== "human_review")!;

const WEIGHT_RATIONALE: Record<ScoreComponentKey, string> = {
  technical: "Share of measured specification requirements that pass.",
  economic: "Indicative net benefit per tonne after transport and processing.",
  logistics: "Distance to the nearest demand site against the configured maximum.",
  volume: "How well available tonnes and the recipient's demand fit.",
  circularity: "Ordinal tier of the primary material substituted. Not an emissions figure.",
  evidence: "Share of required measurements and documents on file.",
};

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-4 md:px-8">
          <Brand />
          <nav aria-label="Site" className="flex items-center gap-1 sm:gap-3">
            <span className="hidden sm:contents">
              <Link href="/methodology" className={buttonStyles.ghost}>Methodology</Link>
              <Link href="/evidence" className={buttonStyles.ghost}>Sources</Link>
            </span>
            <Link href="/dashboard" className={buttonStyles.primary}>Open the demo</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-[1180px] px-4 pt-12 pb-14 md:px-8 md:pt-20">
          <h1 className="display max-w-[16ch] text-[1.95rem] min-[400px]:text-[2.3rem] sm:text-6xl lg:text-[4.6rem]">
            Turn industrial by&#8209;products into evidence&#8209;backed opportunities.
          </h1>
          <p className="mt-6 max-w-[62ch] text-lg text-ink-2">
            ByProduct Intelligence screens a specific by-product stream against the requirements of possible applications, ranks the pathways
            that pass, and spells out the measurements, tests and reviews still needed before an uncertain match can be taken further.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/materials" className={buttonStyles.primary}>Explore the demo materials</Link>
            <Link href="/methodology" className={buttonStyles.secondary}>How the engine decides</Link>
          </div>

          <div className="mt-14 border border-rule-strong bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5 text-sm">
              <span className="text-ink-2">
                Engine output for synthetic profile <span className="font-mono text-ink">{heroMaterial.code}</span> against an illustrative application
              </span>
              <StateBadge state={heroResult.state} />
            </div>
            <div className="grid gap-6 p-4 md:p-6 lg:grid-cols-[1.25fr_1fr]">
              <div>
                <p className="wide text-xl font-bold">Status: {heroResult.headline}.</p>
                <div className="mt-5">
                  <BridgeSpan result={heroResult} materialLabel={heroMaterial.name} applicationLabel={heroApp.name} linkSegments={false} size="lg" />
                </div>
              </div>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="font-semibold">Potential fit</dt>
                  <dd className="mt-0.5 text-ink-2">
                    Declared values meet {heroPass.length} of {heroResult.technical.total} screening thresholds in the demo dataset ({heroPass.map((c) => lowerFirst(c.label)).join(", ")}).
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-oxide">Blocking issue</dt>
                  <dd className="mt-0.5 text-ink-2">{heroBlocker.target} is missing. {heroBlocker.why}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Recommended next action</dt>
                  <dd className="mt-0.5 text-ink-2">{heroBlocker.nextAction}</dd>
                </div>
                <p className="border-t border-rule pt-3 text-xs text-ink-3">
                  This is not an approval and not a statement that the material is safe. No leaching threshold is assumed.
                </p>
              </dl>
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="border-y border-rule bg-panel-sunk">
          <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-14 md:px-8 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="wide text-3xl font-bold">The use may exist. The evidence usually does not, yet.</h2>
              <p className="mt-4 text-ink-2">
                By-product exchanges and industrial-symbiosis programmes already connect producers with potential users. What slows a specific
                stream down is the gap between “someone, somewhere uses this kind of material” and a defensible case for this material, in this
                application, at this site.
              </p>
            </div>
            <ul className="grid gap-px self-start border border-rule bg-rule sm:grid-cols-2">
              {[
                "Which applications could plausibly accept this stream?",
                "What does each application actually require, in which units?",
                "Do the declared composition and properties meet those requirements?",
                "Which tests, certificates or leaching data are missing?",
                "Do transport and processing make the exchange worth pursuing?",
                "What should happen next when the answer is “not known yet”?",
              ].map((q) => (
                <li key={q} className="bg-panel px-4 py-3 text-[0.95rem]">{q}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Workflow */}
        <section className="mx-auto max-w-[1180px] px-4 py-16 md:px-8">
          <h2 className="wide text-3xl font-bold">From a profile to a decision path</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-4">
            {[
              ["Profile", "Record composition, physical properties, volume, location, hazard declaration and documents, each with units and provenance."],
              ["Screen", "Apply hard constraints first: material scope, hazard status, thresholds, transport distance, minimum offtake."],
              ["Rank", "Score only the candidates that survive, with visible weights, formulas and a separate confidence rating."],
              ["Bridge", "Turn every unknown or failed rule into a specific next action with a reviewer and a priority."],
            ].map(([title, text], i) => (
              <li key={title} className="border-t-4 border-ink pt-3">
                <div className="text-sm text-ink-3">Step {i + 1}</div>
                <div className="wide mt-1 text-xl font-bold">{title}</div>
                <p className="mt-2 text-sm text-ink-2">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* States */}
        <section className="border-y border-rule bg-panel">
          <div className="mx-auto max-w-[1180px] px-4 py-16 md:px-8">
            <h2 className="wide text-3xl font-bold">The Missing-Bridge Planner</h2>
            <p className="mt-3 max-w-[68ch] text-ink-2">
              A ranked list hides why a candidate is uncertain. The planner draws each pathway as a span of checks. Hatched gaps are unknowns;
              breaks are failed rules. Each gap becomes an action, and none of them can override a failed safety or regulatory rule.
            </p>
            <div className="mt-8 grid gap-px border border-rule bg-rule md:grid-cols-2 lg:grid-cols-4">
              <div className="bg-panel p-4">
                <StateBadge state="potentially_eligible" />
                <p className="mt-2 text-sm text-ink-2">Available data passes every configured screening rule. Technical review is still required.</p>
              </div>
              <div className="bg-panel p-4">
                <StateBadge state="incomplete_evidence" />
                <p className="mt-2 text-sm text-ink-2">A hard or safety-critical item is unknown. Unknown is never treated as a pass.</p>
              </div>
              <div className="bg-panel p-4">
                <StateBadge state="ineligible" />
                <p className="mt-2 text-sm text-ink-2">A defined hard constraint fails. Ineligible pathways are never ranked as actionable.</p>
              </div>
              <div className="hatch bg-panel p-4">
                <div className="bg-panel p-2">
                  <span className="border border-rule-strong px-1.5 py-0.5 text-xs font-semibold">Approved for a specified use</span>
                  <p className="mt-2 text-sm text-ink-2">Never generated by the software. It needs an authorised, scoped human verification with real evidence.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Scoring */}
        <section className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 md:px-8 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 className="wide text-3xl font-bold">A score you can recompute by hand</h2>
            <p className="mt-3 text-ink-2">
              Hard constraints sit outside the weighted sum. A number is shown only when every component can be computed; otherwise the result
              reads “Insufficient data”. Weights are demonstration defaults, versioned with every run, and adjustable in the scenario view.
            </p>
            <p className="mt-3 text-sm text-ink-3">
              Rule bases are labelled throughout: <BasisTag basis="source_referenced" /> or <BasisTag basis="demo_assumption" />.
            </p>
          </div>
          <table className="w-full self-start text-sm">
            <caption className="sr-only">Default score weights</caption>
            <tbody>
              {(Object.keys(DEFAULT_WEIGHTS) as ScoreComponentKey[]).map((k) => (
                <tr key={k} className="border-b border-rule">
                  <th scope="row" className="py-2.5 pr-3 text-left align-top font-semibold">
                    {COMPONENT_LABELS[k]}
                    <div className="font-normal text-ink-3">{WEIGHT_RATIONALE[k]}</div>
                  </th>
                  <td className="w-40 py-2.5 align-top">
                    <div className="flex items-center gap-2">
                      <span className="h-2 bg-copper" style={{ width: `${DEFAULT_WEIGHTS[k] * 200}px` }} aria-hidden />
                      <span className="font-semibold">{Math.round(DEFAULT_WEIGHTS[k] * 100)} %</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Use cases */}
        <section className="border-t border-rule bg-panel-sunk">
          <div className="mx-auto max-w-[1180px] px-4 py-16 md:px-8">
            <h2 className="wide text-3xl font-bold">Where it helps</h2>
            <dl className="mt-8 grid gap-8 md:grid-cols-3">
              <div>
                <dt className="font-semibold">By-product coordinators</dt>
                <dd className="mt-1 text-sm text-ink-2">See which pathways are worth a laboratory budget, and which tests unlock the most candidates.</dd>
              </div>
              <div>
                <dt className="font-semibold">Sustainability and procurement teams</dt>
                <dd className="mt-1 text-sm text-ink-2">Compare pathways under explicit transport and price assumptions instead of headline claims.</dd>
              </div>
              <div>
                <dt className="font-semibold">Technical reviewers</dt>
                <dd className="mt-1 text-sm text-ink-2">Start from a structured record of every check, its basis and its source, with a decision history.</dd>
              </div>
            </dl>
            <div className="mt-10">
              <Link href="/dashboard" className={buttonStyles.primary}>Open the demo workspace</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule-strong bg-ink text-[#d9d7d0]">
        <div className="mx-auto max-w-[1180px] px-4 py-8 text-sm md:px-8">
          <p className="max-w-[90ch]">
            ByProduct Intelligence is an independent concept prototype prepared for the Tata Imagination Challenge 2026. It is not a Tata
            product, is not endorsed by any Tata company and uses no Tata data. It is a decision-support prototype: it does not certify,
            approve or declare any material safe. All material profiles in the demo are synthetic; application thresholds are labelled as
            source-referenced or demonstration assumptions.
          </p>
        </div>
      </footer>
    </div>
  );
}
