import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BridgeSpan } from "@/components/bridge-span";
import { ButtonLink, EmptyState, PageHeader, ScoreFigure, StateBadge, TableWrap, cx } from "@/components/ui";
import type { MatchResult } from "@/domain/engine/result-types";
import { fmtInr, fmtInrCompact, fmtNumber, fmtPct } from "@/lib/format";
import { requireContext } from "@/server/context";

export const metadata = { title: "Compare candidates" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ComparePage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Loading comparison…</p>}>
      <CompareContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CompareContent({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const runId = Array.isArray(sp.run) ? sp.run[0] : sp.run;
  const appIds = (Array.isArray(sp.apps) ? sp.apps : sp.apps ? [sp.apps] : []).slice(0, 4);
  if (!runId) notFound();
  const { repo } = await requireContext();
  const run = await repo.getRun(runId);
  if (!run) notFound();
  const results = appIds.map((id) => run.results.find((r) => r.applicationId === id)).filter(Boolean) as MatchResult[];
  const apps = new Map(run.applicationsSnapshot.map((a) => [a.id, a]));

  const header = (
    <PageHeader
      kicker={<Link href={`/match/runs/${run.id}`} className="hover:text-copper">Candidates for {run.materialSnapshot.name}</Link>}
      title="Compare candidates"
      lede={`Same material, same run (${run.label}). Values come from the stored run, so the comparison is reproducible.`}
    />
  );
  if (results.length < 2) {
    return (
      <>
        {header}
        <EmptyState title="Select at least two candidates to compare" action={<ButtonLink href={`/match/runs/${run.id}`} variant="primary">Back to the candidate list</ButtonLink>}>
          Tick “Compare” on two to four candidates, then choose “Compare selected”.
        </EmptyState>
      </>
    );
  }

  const row = (label: string, render: (r: MatchResult) => ReactNode, note?: string) => (
    <tr key={label} className="border-b border-rule">
      <th scope="row" className="w-48 bg-panel-sunk px-3 py-2.5 text-left align-top text-sm font-semibold">
        {label}
        {note ? <div className="text-xs font-normal text-ink-3">{note}</div> : null}
      </th>
      {results.map((r) => (
        <td key={r.applicationId} className="px-3 py-2.5 align-top text-sm">{render(r)}</td>
      ))}
    </tr>
  );
  const comp = (r: MatchResult, key: string) => r.score.components.find((c) => c.key === key);

  return (
    <>
      {header}
      <TableWrap label="Candidate comparison">
        <table className="w-full min-w-[760px] border border-rule bg-panel">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="px-3 py-3 text-left text-xs text-ink-3">Candidate</th>
              {results.map((r) => (
                <th key={r.applicationId} className="px-3 py-3 text-left align-top">
                  <Link href={`/match/runs/${run.id}/${r.applicationId}`} className="font-semibold hover:text-copper">{apps.get(r.applicationId)?.name}</Link>
                  <div className="mt-1"><StateBadge state={r.state} /></div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row("Rank", (r) => r.rank ?? "Not ranked")}
            {row("Score", (r) => <ScoreFigure score={r.score} />)}
            {row("Confidence", (r) => r.score.confidence)}
            {row("Checks", (r) => <BridgeSpan result={r} materialLabel={run.materialSnapshot.name} applicationLabel={apps.get(r.applicationId)?.name ?? ""} compact />)}
            {row("Technical fit", (r) => `${r.technical.passed} pass, ${r.technical.failed} fail, ${r.technical.unknown} unknown`)}
            {row("Evidence completeness", (r) => fmtPct(comp(r, "evidence")?.value ?? null))}
            {row("Distance to demand", (r) => `${fmtNumber(r.economics.distanceKm)} km`, "Nearest illustrative site")}
            {row("Net indicative benefit", (r) => <span className={cx((r.economics.perTonne.net ?? 0) < 0 && "text-oxide")}>{r.economics.perTonne.net === null ? "Incomplete" : fmtInr(r.economics.perTonne.net, "/t")}</span>, "Per tonne, under run assumptions")}
            {row("Transport cost", (r) => fmtInr(r.economics.perTonne.transport, "/t"))}
            {row("Accepted volume", (r) => `${fmtNumber(r.economics.acceptedTonnes)} t/yr`)}
            {row("Annual net (theoretical)", (r) => (r.economics.annualNetInr === null ? "—" : fmtInrCompact(r.economics.annualNetInr)))}
            {row("Blocking items", (r) => {
              const b = r.bridge.filter((x) => x.blocking && x.category !== "human_review");
              return b.length ? <ul className="list-disc pl-4">{b.map((x) => <li key={x.id}>{x.target}</li>)}</ul> : "None besides review";
            })}
            {row("Reasons against", (r) => (r.reasonsAgainst.length ? <ul className="list-disc pl-4 text-ink-2">{r.reasonsAgainst.slice(0, 4).map((x) => <li key={x}>{x}</li>)}</ul> : "None"))}
          </tbody>
        </table>
      </TableWrap>
    </>
  );
}
