import Link from "next/link";
import { Suspense } from "react";
import { ShortlistControls } from "@/components/shortlist-controls";
import { ButtonLink, EmptyState, PageHeader, StateBadge, TableWrap, td, th } from "@/components/ui";
import { SHORTLIST_STATUS_LABELS, type ShortlistStatus } from "@/domain/records";
import { fmtDateTime } from "@/lib/format";
import { requireContext } from "@/server/context";

export const metadata = { title: "Shortlist" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ShortlistPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader
        title="Shortlist and review queue"
        lede="Candidates you chose to pursue, with their review state. States record your workflow; they never certify or approve a material."
      />
      <Suspense fallback={<p className="text-ink-3">Loading shortlist…</p>}>
        <ShortlistContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ShortlistContent({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = (Array.isArray(sp.status) ? sp.status[0] : sp.status) as ShortlistStatus | undefined;
  const { repo } = await requireContext();
  const [entries, materials, applications] = await Promise.all([repo.listShortlist(), repo.listMaterials(), repo.listApplications()]);
  const runIds = [...new Set(entries.map((e) => e.runId))];
  const runs = new Map((await Promise.all(runIds.map((id) => repo.getRun(id)))).filter(Boolean).map((r) => [r!.id, r!]));
  const mat = new Map(materials.map((m) => [m.id, m]));
  const app = new Map(applications.map((a) => [a.id, a]));
  const shown = entries.filter((e) => !status || e.status === status).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (entries.length === 0) {
    return (
      <EmptyState title="Your shortlist is empty" action={<ButtonLink href="/match" variant="primary">Open the matching workspace</ButtonLink>}>
        Run a match analysis and choose “Save to shortlist” on a candidate.
      </EmptyState>
    );
  }

  return (
    <>
      <nav aria-label="Filter by review state" className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/shortlist" aria-current={!status ? "page" : undefined} className={`border px-2.5 py-1 ${!status ? "border-ink bg-ink text-panel" : "border-rule-strong"}`}>
          All ({entries.length})
        </Link>
        {(Object.keys(SHORTLIST_STATUS_LABELS) as ShortlistStatus[]).map((s) => (
          <Link key={s} href={`/shortlist?status=${s}`} aria-current={status === s ? "page" : undefined} className={`border px-2.5 py-1 ${status === s ? "border-ink bg-ink text-panel" : "border-rule-strong"}`}>
            {SHORTLIST_STATUS_LABELS[s]} ({entries.filter((e) => e.status === s).length})
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <EmptyState title="No candidates in this state" />
      ) : (
        <TableWrap label="Shortlist">
          <table className="w-full min-w-[900px] border border-rule bg-panel text-sm">
            <thead>
              <tr>
                <th className={th}>Candidate</th>
                <th className={th}>Engine state (at run time)</th>
                <th className={th}>Leading blocker</th>
                <th className={th}>Updated</th>
                <th className={th}>Review state</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const result = runs.get(e.runId)?.results.find((r) => r.applicationId === e.applicationId);
                const blocker = result?.bridge.find((b) => b.blocking && b.category !== "human_review");
                return (
                  <tr key={e.id}>
                    <td className={td}>
                      <Link href={`/match/runs/${e.runId}/${e.applicationId}`} className="font-semibold hover:text-copper">{app.get(e.applicationId)?.name ?? e.applicationId}</Link>
                      <div className="text-xs text-ink-3">{mat.get(e.materialId)?.name ?? "Material not visible"}</div>
                    </td>
                    <td className={td}>{result ? <StateBadge state={result.state} /> : <span className="text-ink-3">Run unavailable</span>}</td>
                    <td className={`${td} text-ink-2`}>{blocker?.target ?? "Technical review only"}</td>
                    <td className={`${td} whitespace-nowrap text-ink-2`}>{fmtDateTime(e.updatedAt)}</td>
                    <td className={td}>
                      <ShortlistControls materialId={e.materialId} applicationId={e.applicationId} runId={e.runId} entry={e} ineligible={result?.state === "ineligible"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
