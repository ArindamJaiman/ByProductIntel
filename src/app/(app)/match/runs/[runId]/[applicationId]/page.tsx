import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { anchorFor, BridgeSpan } from "@/components/bridge-span";
import { SensitivityPanel } from "@/components/sensitivity-panel";
import { ShortlistControls } from "@/components/shortlist-controls";
import { SubmitButton } from "@/components/submit-button";
import {
  BasisTag,
  ButtonLink,
  CheckMark,
  ConfidenceTag,
  PageHeader,
  Panel,
  ProvenanceTag,
  ScoreFigure,
  StateBadge,
  TableWrap,
  cx,
  td,
  th,
} from "@/components/ui";
import type { Check, CheckStage } from "@/domain/engine/result-types";
import { evaluateMatch } from "@/domain/engine/evaluate";
import { breakEven, sensitivity } from "@/domain/engine/sensitivity";
import { BRIDGE_CATEGORY_LABELS, REVIEWER_LABELS, STATE_LABELS } from "@/domain/labels";
import { SHORTLIST_STATUS_LABELS } from "@/domain/records";
import { ECONOMIC_ANCHORS_INR_PER_T } from "@/domain/scoring-config";
import { fmtDateTime, fmtInr, fmtInrCompact, fmtNumber } from "@/lib/format";
import { addReviewNoteAction } from "@/server/actions";
import { requireContext } from "@/server/context";
import { ROUTING_ATTRIBUTION, roadDistanceKm, routingConfigured } from "@/server/routing";

export const metadata = { title: "Match details" };

const STAGE_TITLES: Record<CheckStage, string> = {
  identity: "Material identity",
  hazard: "Hazard",
  specification: "Technical specification",
  evidence: "Tests and documents",
  logistics: "Logistics",
  volume: "Volume",
  economics: "Economic inputs",
};

export default function MatchDetailPage({ params }: { params: Promise<{ runId: string; applicationId: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Loading match…</p>}>
      <DetailContent params={params} />
    </Suspense>
  );
}

async function DetailContent({ params }: { params: Promise<{ runId: string; applicationId: string }> }) {
  const { runId, applicationId } = await params;
  const { repo } = await requireContext();
  const [run, evidence, shortlist, decisions] = await Promise.all([
    repo.getRun(runId),
    repo.listEvidence(),
    repo.listShortlist(),
    repo.listDecisions({ applicationId }),
  ]);
  const r = run?.results.find((x) => x.applicationId === applicationId);
  const app = run?.applicationsSnapshot.find((a) => a.id === applicationId);
  if (!run || !r || !app) notFound();
  const m = run.materialSnapshot;
  const src = new Map(evidence.map((e) => [e.id, e]));
  const entry = shortlist.find((s) => s.materialId === m.id && s.applicationId === applicationId);
  const history = decisions.filter((d) => d.materialId === m.id);
  const citedIds = [
    ...new Set([...r.checks.map((c) => c.sourceId), ...r.bridge.map((b) => b.sourceId), ...app.sourceIds, r.environment.transportEmissions?.sourceId].filter(Boolean) as string[]),
  ];
  const e = r.economics;
  const blockers = r.bridge.filter((b) => b.blocking && b.category !== "human_review");
  const fits = r.checks.filter((c) => c.status === "pass" && c.stage === "specification");

  const be = breakEven(r, app);
  // When this run estimated the distance, compare it with a real road route, re-running the engine at that distance.
  const routedKm = e.distanceBasis === "great_circle_x_factor" && routingConfigured() ? await roadDistanceKm(m.location, e.demandSite) : null;
  const atRoute = routedKm === null ? null : evaluateMatch(m, app, { ...e.assumptions, routedDistanceKm: routedKm }, run.weights);
  const bars = e.annualNetInr === null ? [] : sensitivity(m, app, e.assumptions, run.weights);

  const stages = (Object.keys(STAGE_TITLES) as CheckStage[]).map((s) => ({ stage: s, checks: r.checks.filter((c) => c.stage === s) })).filter((s) => s.checks.length);

  return (
    <>
      <PageHeader
        kicker={
          <>
            <Link href={`/match/runs/${run.id}`} className="hover:text-copper">All candidates for {m.name}</Link>
          </>
        }
        title={app.name}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <StateBadge state={r.state} /> <span>{app.industry}. Rank {r.rank ?? "not ranked"}.</span>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/scenarios?material=${m.id}&run=${run.id}&focus=${app.id}`}>Change assumptions</ButtonLink>
            <ButtonLink href={`/applications/${app.id}`}>Application rules</ButtonLink>
          </>
        }
      />

      {/* 1. Summary */}
      <section className="mb-6 grid gap-6 border border-rule-strong bg-panel p-4 md:p-6 lg:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <p className="wide text-xl font-bold">Status: {r.headline}.</p>
          <p className="max-w-[75ch] text-ink-2">{r.summary}</p>
          <div className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="font-semibold">Potential fit</div>
              <p className="text-ink-2">
                {fits.length ? `Declared values meet ${fits.length} of ${r.technical.total} specification thresholds in this dataset.` : "No specification threshold is met on the available data."}
              </p>
            </div>
            <div>
              <div className={cx("font-semibold", blockers.length ? "text-oxide" : "")}>{blockers.length ? `Blocking issues (${blockers.length})` : "No blocking data gaps"}</div>
              <p className="text-ink-2">{blockers.length ? blockers.map((b) => b.target).join("; ") : "Human technical review is still required before any use."}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ScoreFigure score={r.score} size="lg" />
          <ConfidenceTag confidence={r.score.confidence} />
        </div>
      </section>

      <div className="mb-6 border border-rule bg-panel p-4">
        <BridgeSpan result={r} materialLabel={m.name} applicationLabel={app.name} size="lg" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* 2. Missing-Bridge plan */}
          <Panel id="bridge-plan" title="Missing-Bridge plan" aside={`${r.bridge.length} actions, derived from the rule results`}>
            {r.bridge.length === 0 ? (
              <p className="text-sm text-ink-2">No actions.</p>
            ) : (
              <ol className="space-y-3">
                {r.bridge.map((b, i) => (
                  <li key={b.id} id={`action-${b.id}`} className={cx("border p-3", b.blocking ? "border-oxide/40" : "border-rule")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="mr-2 text-sm text-ink-3">{i + 1}.</span>
                        <span className="font-semibold">{b.target}</span>
                        <span className="ml-2 text-xs text-ink-3">{BRIDGE_CATEGORY_LABELS[b.category]}</span>
                      </div>
                      <div className="flex gap-1.5 text-xs font-semibold">
                        {b.blocking ? <span className="bg-oxide px-1.5 py-0.5 text-white">Blocking</span> : null}
                        <span className="border border-rule-strong px-1.5 py-0.5" title={b.priorityRule}>P{b.priority}</span>
                      </div>
                    </div>
                    <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[8rem_1fr]">
                      <dt className="text-ink-3">Why it matters</dt>
                      <dd>{b.why}</dd>
                      <dt className="text-ink-3">Current state</dt>
                      <dd>{b.currentState}</dd>
                      <dt className="text-ink-3">Next action</dt>
                      <dd className="font-medium">{b.nextAction}</dd>
                      <dt className="text-ink-3">Review needed</dt>
                      <dd>{b.reviewer ? REVIEWER_LABELS[b.reviewer] : "None"}</dd>
                      <dt className="text-ink-3">Priority rule</dt>
                      <dd className="text-ink-2">{b.priorityRule}</dd>
                      {b.sourceId && src.get(b.sourceId) ? (
                        <>
                          <dt className="text-ink-3">Source</dt>
                          <dd>
                            <Link href={`/evidence#${b.sourceId}`} className="text-copper hover:underline">{src.get(b.sourceId)!.title}</Link>
                          </dd>
                        </>
                      ) : null}
                    </dl>
                    {b.checkId ? (
                      <a href={`#${anchorFor(b.checkId)}`} className="mt-2 inline-block text-xs text-copper hover:underline">See the rule result</a>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

        </div>

        <div className="min-w-0 space-y-6">
          {/* 5. Economics */}
          <Panel title="Indicative economics" aside="Assumptions, not quotations">
            <p className="mb-3 text-xs text-ink-3">{e.formula}.</p>
            {e.status === "incomplete" ? (
              <p className="hatch mb-3 border border-dashed border-ink-3 p-0.5 text-sm">
                <span className="block bg-panel p-2">Incomplete: {e.missingInputs.join(", ")} not supplied. No net figure is calculated.</span>
              </p>
            ) : null}
            <table className="w-full text-sm">
              <tbody>
                <EconRow label="Material price" value={e.perTonne.price} sign="+" />
                <EconRow label="Avoided current handling" value={e.perTonne.avoidedHandling} sign="+" />
                <EconRow label={`Transport (${fmtNumber(e.distanceKm)} km × ₹${e.assumptions.transportCostInrPerTonneKm}/t·km)`} value={e.perTonne.transport} sign="−" />
                <EconRow label="Additional processing" value={e.perTonne.processing} sign="−" />
                <tr className="border-t-2 border-ink">
                  <th scope="row" className="py-2 text-left font-semibold">Net indicative benefit</th>
                  <td className={cx("py-2 text-right font-bold", (e.perTonne.net ?? 0) < 0 && "text-oxide")}>{e.perTonne.net === null ? "—" : fmtInr(e.perTonne.net, "/t")}</td>
                </tr>
                <tr>
                  <th scope="row" className="py-1 text-left font-normal text-ink-2">× accepted tonnes ({fmtNumber(e.acceptedTonnes)} t/yr)</th>
                  <td className="py-1 text-right font-semibold">{e.annualNetInr === null ? "—" : `${fmtInrCompact(e.annualNetInr)}/yr`}</td>
                </tr>
              </tbody>
            </table>
            {e.notes.length ? <ul className="mt-2 list-disc pl-5 text-xs text-ink-3">{e.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-rule pt-3 text-xs">
              <dt className="text-ink-3">Nearest demand site</dt>
              <dd className="text-right">{e.demandSite.label}, {e.demandSite.region}</dd>
              <dt className="text-ink-3">Distance basis</dt>
              <dd className="text-right">
                {e.distanceBasis === "override"
                  ? "User override"
                  : e.distanceBasis === "routed"
                    ? "Road route, heavy goods vehicle (OpenRouteService)"
                    : `Great-circle ${fmtNumber(e.greatCircleKm)} km × ${e.assumptions.roadCircuityFactor} circuity`}
              </dd>
              <dt className="text-ink-3">Offered / recovery fraction</dt>
              <dd className="text-right">{fmtNumber(e.offeredTonnes)} t/yr × {e.assumptions.recoveryFraction}</dd>
              <dt className="text-ink-3">Recipient maximum demand</dt>
              <dd className="text-right">{fmtNumber(app.demand.maxTonnesPerYear)} t/yr</dd>
              <dt className="text-ink-3">Economic score anchors</dt>
              <dd className="text-right">{fmtInr(ECONOMIC_ANCHORS_INR_PER_T.floor)} → 0, {fmtInr(ECONOMIC_ANCHORS_INR_PER_T.ceiling)} → 1</dd>
            </dl>
            {routedKm !== null && atRoute && e.distanceKm !== null ? (
              <div className="mt-3 border-l-2 border-copper bg-copper-wash px-3 py-2 text-sm">
                <div className="font-semibold">Road route check</div>
                <p className="text-ink-2">
                  The road route is {fmtNumber(routedKm)} km for a heavy goods vehicle, {Math.abs(Math.round((routedKm / e.distanceKm - 1) * 100))} %{" "}
                  {routedKm >= e.distanceKm ? "longer" : "shorter"} than the {fmtNumber(e.distanceKm)} km estimate used here. At that distance the net would be{" "}
                  <span className={cx("font-semibold", (atRoute.economics.perTonne.net ?? 0) < 0 && "text-oxide")}>{fmtInr(atRoute.economics.perTonne.net, "/t")}</span>
                  {atRoute.state !== r.state ? (
                    <>
                      {" "}
                      and the pathway would be <span className="font-semibold">{STATE_LABELS[atRoute.state].toLowerCase()}</span>
                    </>
                  ) : null}
                  . Use road routes in the scenario view to save a run on this basis.
                </p>
                <p className="mt-1 text-[11px] text-ink-3">{ROUTING_ATTRIBUTION}</p>
              </div>
            ) : null}
            <p className="mt-3 text-xs text-ink-3">Prices, processing costs and freight rates are illustrative demo assumptions. Theoretical revenue is not realised savings.</p>
          </Panel>

          {/* 6. Environment */}
          <Panel title="Environmental estimate" aside="Method and boundary">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-semibold">Potential diversion</dt>
                <dd className="mt-0.5">
                  {r.environment.diversion.tonnes !== null ? <span className="wide text-xl font-bold">{fmtNumber(r.environment.diversion.tonnes)} t/yr </span> : <span className="font-semibold text-ink-2">Not estimated. </span>}
                  <span className="text-ink-2">{r.environment.diversion.explanation}</span>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Transport activity</dt>
                <dd className="mt-0.5 text-ink-2">
                  {r.environment.transportActivityTonneKm === null ? "Not computed." : `${fmtNumber(r.environment.transportActivityTonneKm)} tonne-km per year (accepted tonnes × road distance). An activity figure, not an emissions estimate.`}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Transport emissions</dt>
                <dd className="mt-0.5">
                  {r.environment.transportEmissions?.tonnesCo2ePerYear != null ? (
                    <span className="wide text-xl font-bold">{fmtNumber(r.environment.transportEmissions.tonnesCo2ePerYear)} t CO₂e/yr </span>
                  ) : (
                    <span className="font-semibold text-ink-2">Not estimated. </span>
                  )}
                  <span className="text-ink-2">
                    {r.environment.transportEmissions
                      ? `${r.environment.transportEmissions.explanation} ${r.environment.transportEmissions.boundary}`
                      : "This run was made before transport emissions were added (engine 0.2.0). Run the analysis again to see them."}
                  </span>
                  {r.environment.transportEmissions && src.get(r.environment.transportEmissions.sourceId) ? (
                    <Link href={`/evidence#${r.environment.transportEmissions.sourceId}`} className="mt-0.5 block text-xs text-copper hover:underline">
                      Source: {src.get(r.environment.transportEmissions.sourceId)!.title}
                    </Link>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Avoided emissions</dt>
                <dd className="mt-0.5 text-ink-2">{r.environment.ghg.reason}</dd>
              </div>
            </dl>
          </Panel>

          {/* 7. Reasons */}
          <Panel title="Reasons for and against">
            <div className="grid gap-4 text-sm">
              <div>
                <h3 className="font-semibold text-verdigris">For</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{r.reasonsFor.length ? r.reasonsFor.map((x) => <li key={x}>{x}</li>) : <li>None on the available data.</li>}</ul>
              </div>
              <div>
                <h3 className="font-semibold text-oxide">Against</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{r.reasonsAgainst.length ? r.reasonsAgainst.map((x) => <li key={x}>{x}</li>) : <li>No failed or missing hard items.</li>}</ul>
              </div>
            </div>
          </Panel>

          {/* 8. Sources */}
          <Panel title="Evidence references">
            {citedIds.length === 0 ? (
              <p className="text-sm text-ink-3">No external sources. Every rule applied here is a demonstration assumption.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {citedIds.map((id) => {
                  const s = src.get(id);
                  return s ? (
                    <li key={id}>
                      <Link href={`/evidence#${id}`} className="font-semibold hover:text-copper">{s.title}</Link>
                      <div className="text-xs text-ink-3">Supports: {s.claim}</div>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </Panel>

          {/* 9. Review */}
          <Panel title="Review state and decision history">
            <ShortlistControls materialId={m.id} applicationId={app.id} runId={run.id} entry={entry} ineligible={r.state === "ineligible"} />
            <p className="mt-2 text-xs text-ink-3">
              Review states record workflow only. This software never marks a material as approved for a use.
            </p>
            <form action={addReviewNoteAction} className="mt-4 space-y-2">
              <input type="hidden" name="materialId" value={m.id} />
              <input type="hidden" name="applicationId" value={app.id} />
              <input type="hidden" name="runId" value={run.id} />
              <label className="block text-sm">
                Add a review note
                <textarea name="note" required maxLength={500} rows={2} className="mt-1 block w-full border border-rule-strong bg-panel px-2 py-1.5 text-sm" />
              </label>
              <SubmitButton variant="secondary" pendingLabel="Saving note…">Add note</SubmitButton>
            </form>
            <ol className="mt-4 space-y-2 border-t border-rule pt-3 text-sm">
              {history.length === 0 ? <li className="text-ink-3">No decisions recorded.</li> : null}
              {history.map((d) => (
                <li key={d.id}>
                  <span className="font-semibold">{d.decision === "note" ? "Note" : d.decision === "removed" ? "Removed from shortlist" : SHORTLIST_STATUS_LABELS[d.decision]}</span>
                  {d.note ? <span className="text-ink-2">: {d.note}</span> : null}
                  <div className="text-xs text-ink-3">{d.actor}, {fmtDateTime(d.createdAt)}</div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <SensitivityPanel be={be} bars={bars} baseAnnualInr={e.annualNetInr} baseState={r.state} />

        {/* 3. Checks */}
        <Panel title="Eligibility and technical checks" aside="Hard constraints are applied before any scoring">
          <div className="space-y-5">
            {stages.map(({ stage, checks }) => (
              <div key={stage}>
                <h3 className="mb-1.5 text-sm font-semibold">{STAGE_TITLES[stage]}</h3>
                <TableWrap label={STAGE_TITLES[stage]}>
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr>
                        <th className={`${th} w-8`}><span className="sr-only">Result</span></th>
                        <th className={th}>Check</th>
                        <th className={th}>Observed</th>
                        <th className={th}>Required</th>
                        <th className={th}>Rule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checks.map((c) => (
                        <CheckRow key={c.id} c={c} sourceTitle={c.sourceId ? src.get(c.sourceId)?.organisation.split(",")[0] : undefined} />
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            ))}
          </div>
        </Panel>

        {/* 4. Score */}
        <Panel title="Score components and weights" aside={run.scoringModelVersion}>
          <p className="mb-3 text-sm text-ink-2">{r.score.reason}</p>
          <TableWrap label="Score components">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Component</th>
                  <th className={`${th} text-right`}>Weight</th>
                  <th className={`${th} text-right`}>Value (0–1)</th>
                  <th className={`${th} text-right`}>Points</th>
                  <th className={th}>How it was computed</th>
                </tr>
              </thead>
              <tbody>
                {r.score.components.map((c) => (
                  <tr key={c.key}>
                    <td className={`${td} font-semibold`}>{c.label}</td>
                    <td className={`${td} text-right`}>{Math.round(c.weight * 100)} %</td>
                    <td className={cx(td, "text-right", c.value === null && "hatch")}>
                      <span className={c.value === null ? "bg-panel px-1" : ""}>{c.value === null ? "Unknown" : c.value.toFixed(3)}</span>
                    </td>
                    <td className={`${td} text-right`}>{c.points === null ? "—" : c.points.toFixed(2)}</td>
                    <td className={`${td} text-ink-2`}>{c.explanation}</td>
                  </tr>
                ))}
                <tr>
                  <td className={`${td} font-semibold`} colSpan={3}>Total</td>
                  <td className={`${td} text-right font-bold`}>{r.score.total === null ? "—" : r.score.total.toFixed(1)}</td>
                  <td className={`${td} text-ink-2`}>Sum of points. Produced only when every component is computable and no hard constraint fails.</td>
                </tr>
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-3 text-sm">
            <span className="font-semibold">Confidence: {r.score.confidence}.</span>{" "}
            <span className="text-ink-2">{r.score.confidenceReasons.join(" ")}</span>
          </div>
        </Panel>
      </div>
    </>
  );
}

function CheckRow({ c, sourceTitle }: { c: Check; sourceTitle?: string }) {
  return (
    <tr id={anchorFor(c.id)} className="scroll-mt-24 target:bg-copper-wash">
      <td className={td}><CheckMark status={c.status} /></td>
      <td className={td}>
        <div className="font-semibold">{c.label}</div>
        <div className="text-xs text-ink-2">{c.detail}</div>
      </td>
      <td className={cx(td, c.status === "unknown" && !c.observed && "hatch")}>
        <span className={c.status === "unknown" && !c.observed ? "bg-panel px-1" : ""}>{c.observed ?? "Not reported"}</span>
        {c.provenance ? <div><ProvenanceTag provenance={c.provenance} verification={c.verification} /></div> : null}
      </td>
      <td className={`${td} whitespace-nowrap`}>{c.required}</td>
      <td className={`${td} text-xs`}>
        <div>
          {c.enforcement === "hard" ? "Hard" : c.enforcement === "soft" ? "Soft" : "Info"}
          {c.safetyCritical ? <span className="font-semibold text-oxide">, safety-critical</span> : null}
        </div>
        {c.basis ? <BasisTag basis={c.basis} /> : null}
        {sourceTitle ? <div className="text-ink-3">{sourceTitle}</div> : null}
      </td>
    </tr>
  );
}

function EconRow({ label, value, sign }: { label: string; value: number | null; sign: "+" | "−" }) {
  return (
    <tr className="border-b border-rule">
      <th scope="row" className="py-1.5 text-left font-normal">{label}</th>
      <td className={cx("py-1.5 text-right", value === null && "hatch")}>
        <span className={value === null ? "bg-panel px-1" : ""}>{value === null ? "Unknown" : `${sign} ${fmtInr(value)}`}</span>
      </td>
    </tr>
  );
}
