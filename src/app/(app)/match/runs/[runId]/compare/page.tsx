import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckMark, EmptyState, PageHeader, Panel, StateBadge, TableWrap, cx, td, th } from "@/components/ui";
import { diffRuns, type InputArea } from "@/domain/engine/diff";
import { fmtDateTime, fmtInrCompact } from "@/lib/format";
import { requireContext } from "@/server/context";

export const metadata = { title: "Compare runs" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const AREA_LABELS: Record<InputArea, string> = {
  measurement: "Measurement",
  document: "Document",
  profile: "Material profile",
  scenario: "Assumption",
  weights: "Score weight",
  ruleset: "Application rules",
  engine: "Engine",
};

export default function CompareRunsPage({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: SP }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Comparing runs…</p>}>
      <CompareContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CompareContent({ params, searchParams }: { params: Promise<{ runId: string }>; searchParams: SP }) {
  const [{ runId }, sp] = await Promise.all([params, searchParams]);
  const { repo } = await requireContext();
  const [x, y] = await Promise.all([repo.getRun(runId), repo.getRun(one(sp.with))]);
  if (!x) notFound();
  if (!y || y.materialId !== x.materialId) {
    return (
      <>
        <PageHeader kicker={<Link href={`/match/runs/${x.id}`} className="hover:text-copper">Back to results</Link>} title="Compare runs" />
        <EmptyState title="Choose another run of the same material">Runs can only be compared when they analyse the same material.</EmptyState>
      </>
    );
  }
  const [before, after] = x.createdAt <= y.createdAt ? [x, y] : [y, x];
  const d = diffRuns(before, after);
  const names = new Map([...before.applicationsSnapshot, ...after.applicationsSnapshot].map((a) => [a.id, a.name]));
  const scoped = d.pathways.filter((p) => p.inScope);
  const changed = scoped.filter((p) => p.stateChanged || p.checkChanges.length > 0 || (p.scoreDelta ?? 0) !== 0 || p.before?.total !== p.after?.total);

  return (
    <>
      <PageHeader
        kicker={<Link href={`/match/runs/${x.id}`} className="hover:text-copper">Back to results for {after.materialSnapshot.name}</Link>}
        title="What changed between two runs"
        lede="Every difference in the inputs, and its effect on each pathway's state, score and individual checks. Both runs are stored with their full inputs, so either can be reproduced."
      />

      <div className="mb-6 grid gap-px border border-rule bg-rule sm:grid-cols-2">
        {[
          ["Earlier", before],
          ["Later", after],
        ].map(([label, r]) => {
          const run = r as typeof before;
          return (
            <div key={run.id} className="bg-panel px-4 py-3">
              <div className="text-xs text-ink-3">{label as string}</div>
              <Link href={`/match/runs/${run.id}`} className="font-semibold hover:text-copper">{run.label}</Link>
              <div className="text-sm text-ink-2">{fmtDateTime(run.createdAt)}, by {run.createdBy}</div>
              <div className="font-mono text-xs text-ink-3">fingerprint {run.inputHash}</div>
            </div>
          );
        })}
      </div>

      <div className="space-y-6">
        <Panel title="Inputs that changed" aside={`${d.inputChanges.length} difference${d.inputChanges.length === 1 ? "" : "s"}`}>
          {d.inputChanges.length === 0 ? (
            <p className="text-sm text-ink-2">
              No input differs{before.inputHash === after.inputHash ? " and the fingerprints match" : ""}. Any difference in results would point to a change in the engine itself.
            </p>
          ) : (
            <TableWrap label="Input changes">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr>
                    <th className={th}>Kind</th>
                    <th className={th}>Item</th>
                    <th className={th}>Earlier</th>
                    <th className={th}>Later</th>
                  </tr>
                </thead>
                <tbody>
                  {d.inputChanges.map((c) => (
                    <tr key={`${c.area}-${c.label}`}>
                      <td className={`${td} text-ink-3`}>{AREA_LABELS[c.area]}</td>
                      <td className={`${td} font-semibold`}>{c.label}</td>
                      <td className={`${td} text-ink-2`}>{c.before}</td>
                      <td className={td}>{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>

        <Panel title="Effect on each pathway" aside={`${changed.length} of ${scoped.length} in-scope pathways changed`}>
          {changed.length === 0 ? (
            <p className="text-sm text-ink-2">No pathway changed state, score or any individual check.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {changed.map((p) => (
                <li key={p.applicationId} className="grid gap-3 py-3 md:grid-cols-[1.2fr_1fr_1.4fr]">
                  <div>
                    <Link href={`/match/runs/${after.id}/${p.applicationId}`} className="font-semibold hover:text-copper">{names.get(p.applicationId)}</Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                      {p.before ? <StateBadge state={p.before.state} /> : <span className="text-ink-3">Not in earlier run</span>}
                      <span aria-hidden className="text-ink-3">to</span>
                      <span className="sr-only">changed to</span>
                      {p.after ? <StateBadge state={p.after.state} /> : <span className="text-ink-3">Not in later run</span>}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div>
                      Score {p.before?.total?.toFixed(1) ?? "none"} to {p.after?.total?.toFixed(1) ?? "none"}
                      {p.scoreDelta !== null && p.scoreDelta !== 0 ? (
                        <span className={cx("ml-1.5 font-semibold", p.scoreDelta > 0 ? "text-verdigris" : "text-oxide")}>
                          {p.scoreDelta > 0 ? "+" : "−"}
                          {Math.abs(p.scoreDelta).toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-ink-3">
                      Indicative value {fmtInrCompact(p.before?.annualNetInr)} to {fmtInrCompact(p.after?.annualNetInr)} per year
                    </div>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {p.checkChanges.length === 0 ? <li className="text-ink-3">No check changed status.</li> : null}
                    {p.checkChanges.map((c) => (
                      <li key={c.checkId} className="flex items-center gap-2">
                        {c.before ? <CheckMark status={c.before} /> : <span className="size-5" />}
                        <span aria-hidden className="text-ink-3">to</span>
                        {c.after ? <CheckMark status={c.after} /> : <span className="size-5" />}
                        <span>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
