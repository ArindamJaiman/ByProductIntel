import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BridgeSpan } from "@/components/bridge-span";
import { ShortlistControls } from "@/components/shortlist-controls";
import { ButtonLink, ConfidenceTag, EmptyState, PageHeader, ScoreFigure, StateBadge, buttonStyles, cx } from "@/components/ui";
import { rankRobustness } from "@/domain/engine/robustness";
import { lowerFirst } from "@/domain/labels";
import { fmtDateTime, fmtInr, fmtNumber, fmtPct } from "@/lib/format";
import { isInScope } from "@/server/analysis";
import { requireContext } from "@/server/context";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export const metadata = { title: "Match results" };

export default function RunPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: SP }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Loading results…</p>}>
      <RunContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RunContent({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: SP }) {
  const [{ runId }, sp] = await Promise.all([params, searchParams]);
  const { repo } = await requireContext();
  const [run, shortlist] = await Promise.all([repo.getRun(runId), repo.listShortlist()]);
  if (!run) notFound();
  const otherRuns = (await repo.listRuns({ materialId: run.materialId, limit: 20 })).filter((x) => x.id !== run.id);
  const robust = rankRobustness(run.results, run.weights);
  const rangeOf = new Map(robust.candidates.map((c) => [c.applicationId, c]));
  const apps = new Map(run.applicationsSnapshot.map((a) => [a.id, a]));
  const entries = new Map(shortlist.filter((s) => s.materialId === run.materialId).map((s) => [s.applicationId, s]));

  const industry = one(sp.industry);
  const state = one(sp.state);
  const evidence = Number(one(sp.evidence) || 0);
  const maxKm = Number(one(sp.maxKm) || 0);
  const minTonnes = Number(one(sp.minTonnes) || 0);
  const showExcluded = one(sp.excluded) === "1";

  const inScope = run.results.filter(isInScope);
  const excludedCount = run.results.length - inScope.length;
  const pool = showExcluded ? run.results : inScope;
  const industries = [...new Set(run.applicationsSnapshot.map((a) => a.industry))].sort();
  const evidenceOf = (r: (typeof pool)[number]) => r.score.components.find((c) => c.key === "evidence")?.value ?? 0;

  const shown = pool.filter((r) => {
    if (industry && apps.get(r.applicationId)?.industry !== industry) return false;
    if (state && r.state !== state) return false;
    if (evidence && evidenceOf(r) * 100 < evidence) return false;
    if (maxKm && (r.economics.distanceKm ?? Infinity) > maxKm) return false;
    if (minTonnes && (r.economics.acceptedTonnes ?? 0) < minTonnes) return false;
    return true;
  });
  const m = run.materialSnapshot;
  const select = "border border-rule-strong bg-panel px-2 py-1.5 text-sm";

  return (
    <>
      <PageHeader
        kicker={<Link href="/match" className="hover:text-copper">Matching workspace</Link>}
        title={`Candidates for ${m.name}`}
        lede={
          <>
            {run.label}, run {fmtDateTime(run.createdAt)} by {run.createdBy}. {inScope.length} in-scope applications screened; {excludedCount} excluded because the
            material family is outside their defined scope.
          </>
        }
        actions={
          <>
            <ButtonLink href={`/materials/${m.id}`}>Material profile</ButtonLink>
            <ButtonLink href={`/scenarios?material=${m.id}&run=${run.id}`}>Change assumptions</ButtonLink>
          </>
        }
      />
      <p className="mb-4 font-mono text-xs text-ink-3">
        {run.engineVersion}, {run.scoringModelVersion}, input fingerprint {run.inputHash}
      </p>

      {(robust.status !== "not_applicable" && robust.leader) || otherRuns.length ? (
        <div className="mb-4 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          {robust.status !== "not_applicable" && robust.leader ? (
            <section aria-label="Ranking robustness" className={cx("border px-4 py-3 text-sm", robust.status === "stable" ? "border-verdigris/40 bg-verdigris-wash" : "border-ochre/40 bg-ochre-wash")}>
              <div className={cx("font-semibold", robust.status === "stable" ? "text-verdigris" : "text-ochre")}>
                {robust.status === "stable" ? "Ranking holds when the weights change" : "Ranking depends on the weights"}
              </div>
              <p className="mt-0.5 text-ink-2">
                {robust.status === "stable"
                  ? `${apps.get(robust.leader)?.name} stays first under all ${robust.variants} weight sets tested: the run's own, equal weights, and each weight halved or raised by half.`
                  : `${apps.get(robust.leader)?.name} leads with the run's weights but not under ${robust.overturnedBy.length} of ${robust.variants} weight sets (${robust.overturnedBy.slice(0, 3).join("; ")}${robust.overturnedBy.length > 3 ? "; …" : ""}). Treat the order of the top candidates as a judgement call.`}
              </p>
            </section>
          ) : (
            <div />
          )}
          {otherRuns.length ? (
            <form method="get" action={`/match/runs/${run.id}/compare`} className="flex flex-wrap items-end gap-2 border border-rule bg-panel px-4 py-3" aria-label="Compare with another run">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-2">
                Compare with another run of this material
                <select name="with" className="border border-rule-strong bg-panel px-2 py-1.5 text-sm">
                  {otherRuns.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}, {fmtDateTime(o.createdAt)}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonStyles.secondary}>Compare runs</button>
            </form>
          ) : null}
        </div>
      ) : null}

      <form method="get" className="mb-4 grid gap-3 border border-rule bg-panel p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]" aria-label="Filter candidates">
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Industry
          <select name="industry" defaultValue={industry} className={select}>
            <option value="">All industries</option>
            {industries.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Feasibility state
          <select name="state" defaultValue={state} className={select}>
            <option value="">Any state</option>
            <option value="potentially_eligible">Potentially eligible</option>
            <option value="incomplete_evidence">Incomplete evidence</option>
            <option value="ineligible">Ineligible</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Evidence completeness
          <select name="evidence" defaultValue={String(evidence || "")} className={select}>
            <option value="">Any</option>
            <option value="50">At least 50 %</option>
            <option value="80">At least 80 %</option>
            <option value="100">Complete</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Distance to demand
          <select name="maxKm" defaultValue={String(maxKm || "")} className={select}>
            <option value="">Any distance</option>
            <option value="100">Within 100 km</option>
            <option value="300">Within 300 km</option>
            <option value="600">Within 600 km</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Accepted volume
          <select name="minTonnes" defaultValue={String(minTonnes || "")} className={select}>
            <option value="">Any volume</option>
            <option value="10000">At least 10 kt/yr</option>
            <option value="50000">At least 50 kt/yr</option>
            <option value="100000">At least 100 kt/yr</option>
          </select>
        </label>
        <div className="flex flex-col justify-end gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-2">
            <input type="checkbox" name="excluded" value="1" defaultChecked={showExcluded} /> Show out-of-scope ({excludedCount})
          </label>
          <div className="flex gap-2">
            <button type="submit" className={buttonStyles.primary}>Apply</button>
            <Link href={`/match/runs/${run.id}`} className={buttonStyles.ghost}>Reset</Link>
          </div>
        </div>
      </form>

      <form id="compare-form" method="get" action="/compare" className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="run" value={run.id} />
        <p className="text-sm text-ink-3" aria-live="polite">
          Showing {shown.length} of {pool.length}. Ranked: scored candidates first, then provisional, then those without a numeric score.
        </p>
        <button type="submit" className={buttonStyles.secondary}>Compare selected</button>
      </form>

      {shown.length === 0 ? (
        <EmptyState title="No candidates match these filters" action={<Link className={buttonStyles.secondary} href={`/match/runs/${run.id}`}>Clear filters</Link>} />
      ) : (
        <ol className="space-y-3">
          {shown.map((r) => {
            const app = apps.get(r.applicationId)!;
            const blocker = r.bridge.find((b) => b.blocking && b.category !== "human_review");
            return (
              <li key={r.applicationId} className={cx("border bg-panel", r.state === "ineligible" ? "border-rule" : "border-rule-strong")}>
                <div className="grid gap-4 p-4 lg:grid-cols-[3rem_1.6fr_1.1fr_7rem]">
                  <div className="wide text-2xl font-bold text-ink-3" aria-label={r.rank ? `Rank ${r.rank}` : "Not ranked"}>
                    {r.rank ?? "—"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/match/runs/${run.id}/${r.applicationId}`} className="text-lg font-semibold hover:text-copper">{app.name}</Link>
                      <StateBadge state={r.state} />
                    </div>
                    <div className="text-sm text-ink-3">{app.industry}</div>
                    <p className="mt-2 text-sm font-semibold">{r.headline}</p>
                    <p className="mt-1 text-sm text-ink-2">{r.summary}</p>
                    {blocker ? (
                      <p className="mt-2 text-sm">
                        <span className="font-semibold text-oxide">{r.state === "ineligible" ? "Blocking failure" : "Leading blocker"}:</span> {blocker.target}{" "}
                        <span className="text-ink-3">({lowerFirst(blocker.currentState)})</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2 text-sm">
                    <BridgeSpan result={r} materialLabel={m.name} applicationLabel={app.name} compact />
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <dt className="text-ink-3">Distance</dt>
                      <dd>{r.economics.distanceKm === null ? "—" : `${fmtNumber(r.economics.distanceKm)} km`}</dd>
                      <dt className="text-ink-3">Net / t</dt>
                      <dd className={(r.economics.perTonne.net ?? 0) < 0 ? "text-oxide" : ""}>{r.economics.perTonne.net === null ? "Incomplete" : fmtInr(r.economics.perTonne.net)}</dd>
                      <dt className="text-ink-3">Accepted</dt>
                      <dd>{r.economics.acceptedTonnes === null ? "—" : `${fmtNumber(r.economics.acceptedTonnes)} t/yr`}</dd>
                      <dt className="text-ink-3">Evidence</dt>
                      <dd>{fmtPct(evidenceOf(r))}</dd>
                    </dl>
                  </div>
                  <div className="flex flex-row items-start justify-between gap-2 lg:flex-col lg:items-end">
                    <ScoreFigure score={r.score} />
                    <ConfidenceTag confidence={r.score.confidence} />
                    {rangeOf.get(r.applicationId) ? (
                      <span className="text-xs text-ink-3 lg:text-right" title="Across every weight set tested">
                        {rangeOf.get(r.applicationId)!.bestRank === rangeOf.get(r.applicationId)!.worstRank
                          ? `Rank ${rangeOf.get(r.applicationId)!.bestRank} under all weights`
                          : `Rank ${rangeOf.get(r.applicationId)!.bestRank}–${rangeOf.get(r.applicationId)!.worstRank} as weights vary`}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-panel-sunk px-4 py-2">
                  <div className="flex flex-wrap items-center gap-4">
                    <Link href={`/match/runs/${run.id}/${r.applicationId}`} className="text-sm font-semibold text-copper hover:underline">
                      Checks and Missing-Bridge plan<span className="sr-only"> for {app.name}</span>
                    </Link>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="apps" value={r.applicationId} form="compare-form" /> Compare
                    </label>
                  </div>
                  <ShortlistControls materialId={run.materialId} applicationId={r.applicationId} runId={run.id} entry={entries.get(r.applicationId)} ineligible={r.state === "ineligible"} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
