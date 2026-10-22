import Link from "next/link";
import { Suspense } from "react";
import { SectorChart, type SectorDatum } from "@/components/sector-chart";
import { ButtonLink, EmptyState, PageHeader, Panel, Stat, StateBadge, TableWrap, td, th } from "@/components/ui";
import { SHORTLIST_STATUS_LABELS } from "@/domain/records";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { baselineScreen, isPromising } from "@/server/analysis";
import { requireContext } from "@/server/context";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        lede="Every figure on this page is computed from the current records by running the matching engine under baseline assumptions. Demo records are synthetic, so these are screening results, not industrial outcomes."
        actions={
          <>
            <ButtonLink href="/portfolio">Group portfolio</ButtonLink>
            <ButtonLink href="/match" variant="primary">Run a match analysis</ButtonLink>
          </>
        }
      />
      <Suspense fallback={<p className="text-ink-3">Screening materials…</p>}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

async function DashboardContent() {
  const { repo } = await requireContext();
  const [{ applications, screens }, shortlist, audit, runs] = await Promise.all([
    baselineScreen(repo),
    repo.listShortlist(),
    repo.listAudit(12),
    repo.listRuns({ limit: 5 }),
  ]);
  const appById = new Map(applications.map((a) => [a.id, a]));
  const matById = new Map(screens.map((s) => [s.material.id, s.material]));
  const underReview = new Set(shortlist.filter((s) => s.status === "under_review").map((s) => `${s.materialId}|${s.applicationId}`));

  const all = screens.flatMap((s) => s.inScope);
  const promising = all.filter(isPromising);
  const awaiting = promising.filter((r) => !underReview.has(`${r.materialId}|${r.applicationId}`));
  const incomplete = all.filter((r) => r.state === "incomplete_evidence");
  const recovery = screens.reduce((sum, s) => {
    const best = Math.max(0, ...s.inScope.filter((r) => r.state === "potentially_eligible").map((r) => r.economics.acceptedTonnes ?? 0));
    return sum + best;
  }, 0);

  const bySector = new Map<string, SectorDatum>();
  for (const r of all) {
    if (r.state === "ineligible") continue;
    const industry = appById.get(r.applicationId)?.industry ?? "Other";
    const d = bySector.get(industry) ?? { industry, potentially_eligible: 0, incomplete_evidence: 0 };
    d[r.state]++;
    bySector.set(industry, d);
  }
  const sectorData = [...bySector.values()].sort((a, b) => b.potentially_eligible + b.incomplete_evidence - (a.potentially_eligible + a.incomplete_evidence));
  const invalid = screens.filter((s) => s.invalid);
  const reviewQueue = shortlist.filter((s) => s.status === "shortlisted" || s.status === "under_review");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-y-5 border border-rule bg-panel py-4 lg:grid-cols-5">
        <Stat label="Material profiles" value={screens.length} href="/materials" note={`${screens.filter((s) => s.material.dataOrigin === "synthetic_demo").length} synthetic`} />
        <Stat label="Pathways screened" value={all.length} note={`In-scope pairs across ${applications.length} applications`} />
        <Stat label="Promising, awaiting review" value={awaiting.length} note={`${promising.length - awaiting.length} already under review`} href="/shortlist" />
        <Stat label="Pathways with incomplete evidence" value={incomplete.length} note="Missing data blocks assessment" />
        <Stat
          label="Potential recovery volume"
          value={<>{fmtNumber(recovery / 1000, 0)}<span className="text-base font-medium text-ink-3"> kt/yr</span></>}
          note="Scenario estimate; best potentially eligible pathway per material, not double-counted"
        />
      </div>

      {invalid.length ? (
        <p className="border border-oxide/40 bg-oxide-wash px-4 py-2 text-sm text-oxide">
          {invalid.length} material profile(s) failed validation and were not screened: {invalid.map((s) => s.material.code).join(", ")}.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Candidate pathways by target industry" aside="Ineligible pathways excluded">
          {sectorData.length ? <SectorChart data={sectorData} /> : <EmptyState title="No candidate pathways yet" />}
        </Panel>
        <Panel title="Shortlist requiring review" aside={<Link className="text-copper hover:underline" href="/shortlist">Open shortlist</Link>}>
          {reviewQueue.length === 0 ? (
            <EmptyState title="Nothing shortlisted yet">Run a match analysis and shortlist a candidate to start a review trail.</EmptyState>
          ) : (
            <ul className="divide-y divide-rule">
              {reviewQueue.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link href={`/match/runs/${s.runId}/${s.applicationId}`} className="font-semibold hover:text-copper">
                      {appById.get(s.applicationId)?.name ?? s.applicationId}
                    </Link>
                    <div className="truncate text-sm text-ink-3">{matById.get(s.materialId)?.name ?? s.materialId}</div>
                  </div>
                  <span className="shrink-0 border border-rule-strong px-1.5 py-0.5 text-xs font-semibold">{SHORTLIST_STATUS_LABELS[s.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Promising candidates, baseline assumptions" aside="Live screening, not a saved run">
        <TableWrap label="Promising candidates">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className={th}>Material</th>
                <th className={th}>Application</th>
                <th className={th}>State</th>
                <th className={th}>Leading blocker</th>
                <th className={th}>Score</th>
              </tr>
            </thead>
            <tbody>
              {promising
                .toSorted((a, b) => (b.score.total ?? 0) - (a.score.total ?? 0))
                .map((r) => {
                  const blocker = r.bridge.find((b) => b.blocking && b.category !== "human_review");
                  return (
                    <tr key={`${r.materialId}-${r.applicationId}`}>
                      <td className={td}>
                        <Link href={`/materials/${r.materialId}`} className="font-semibold hover:text-copper">{matById.get(r.materialId)?.name}</Link>
                      </td>
                      <td className={td}>{appById.get(r.applicationId)?.name}</td>
                      <td className={td}><StateBadge state={r.state} /></td>
                      <td className={`${td} text-ink-2`}>{blocker ? blocker.target : "Technical review only"}</td>
                      <td className={`${td} whitespace-nowrap`}>{r.score.total === null ? "Insufficient data" : `${r.score.total.toFixed(1)}${r.score.status === "provisional" ? " (provisional)" : ""}`}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent activity">
          {audit.length === 0 ? (
            <EmptyState title="No activity recorded" />
          ) : (
            <ol className="space-y-2.5 text-sm">
              {audit.map((e) => (
                <li key={e.id} className="grid grid-cols-[auto_1fr] gap-3">
                  <time className="pt-0.5 text-xs whitespace-nowrap text-ink-3" dateTime={e.createdAt}>{fmtDateTime(e.createdAt)}</time>
                  <span>
                    {e.summary} <span className="text-ink-3">by {e.actor}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        <Panel title="Recent matching runs" aside={<Link className="text-copper hover:underline" href="/match">All runs</Link>}>
          {runs.length === 0 ? (
            <EmptyState title="No saved runs yet" action={<ButtonLink href="/match" variant="primary">Run a match analysis</ButtonLink>} />
          ) : (
            <ul className="divide-y divide-rule text-sm">
              {runs.map((r) => (
                <li key={r.id} className="py-2">
                  <Link href={`/match/runs/${r.id}`} className="font-semibold hover:text-copper">{r.materialName}</Link>
                  <div className="text-ink-3">
                    {r.label}, {fmtDateTime(r.createdAt)}. {r.counts.potentially_eligible} potentially eligible, {r.counts.incomplete_evidence} incomplete.
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
