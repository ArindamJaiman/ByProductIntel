import Link from "next/link";
import { Suspense } from "react";
import { BridgeSpan } from "@/components/bridge-span";
import { ButtonLink, EmptyState, OriginBadge, PageHeader, TableWrap, buttonStyles, td, th } from "@/components/ui";
import { FAMILY_LABELS, FAMILY_SHORT, ORIGIN_LABELS } from "@/domain/labels";
import type { DataOrigin, MaterialFamily } from "@/domain/types";
import { fmtDate, fmtTonnes } from "@/lib/format";
import { baselineScreen } from "@/server/analysis";
import { requireContext } from "@/server/context";

export const metadata = { title: "Materials" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function MaterialsPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader
        title="Materials registry"
        lede="Each record is one specific by-product stream. Values carry units, provenance and verification state; anything not reported is shown as unknown, never as zero."
        actions={
          <>
            <ButtonLink href="/materials/import">Import CSV</ButtonLink>
            <ButtonLink href="/materials/new" variant="primary">Add material</ButtonLink>
          </>
        }
      />
      <Suspense fallback={<p className="text-ink-3">Loading materials…</p>}>
        <MaterialsTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MaterialsTable({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).trim().toLowerCase();
  const family = one(sp.family) as MaterialFamily | "";
  const region = one(sp.region);
  const origin = one(sp.origin) as DataOrigin | "";
  const sort = one(sp.sort) || "updated";

  const { repo } = await requireContext();
  const { screens, applications } = await baselineScreen(repo);
  const appName = new Map(applications.map((a) => [a.id, a.name]));
  const regions = [...new Set(screens.map((s) => s.material.location.region))].sort();

  const rows = screens
    .filter(({ material: m }) => {
      if (q && !`${m.name} ${m.code} ${FAMILY_LABELS[m.family]} ${m.sourceProcess}`.toLowerCase().includes(q)) return false;
      if (family && m.family !== family) return false;
      if (region && m.location.region !== region) return false;
      if (origin && m.dataOrigin !== origin) return false;
      return true;
    })
    .toSorted((a, b) => {
      if (sort === "volume") return (b.material.volume.tonnesPerYear ?? -1) - (a.material.volume.tonnesPerYear ?? -1);
      if (sort === "name") return a.material.name.localeCompare(b.material.name);
      return b.material.updatedAt.localeCompare(a.material.updatedAt);
    });

  const select = "border border-rule-strong bg-panel px-2 py-1.5 text-sm";
  return (
    <>
      <form method="get" className="mb-4 grid gap-3 border border-rule bg-panel p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]" role="search" aria-label="Filter materials">
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Search name, code or category
          <input name="q" defaultValue={one(sp.q)} placeholder="e.g. slag, ASH-001" className={select} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Material family
          <select name="family" defaultValue={family} className={select}>
            <option value="">All families</option>
            {Object.entries(FAMILY_SHORT).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Location
          <select name="region" defaultValue={region} className={select}>
            <option value="">All locations</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Data status
          <select name="origin" defaultValue={origin} className={select}>
            <option value="">Any</option>
            {Object.entries(ORIGIN_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Sort by
          <select name="sort" defaultValue={sort} className={select}>
            <option value="updated">Recently updated</option>
            <option value="volume">Available volume</option>
            <option value="name">Name</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonStyles.primary}>Apply</button>
          <Link href="/materials" className={buttonStyles.ghost}>Reset</Link>
        </div>
      </form>

      <p className="mb-2 text-sm text-ink-3" aria-live="polite">
        {rows.length} of {screens.length} materials
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No materials match these filters" action={<Link href="/materials" className={buttonStyles.secondary}>Clear filters</Link>} />
      ) : (
        <TableWrap label="Materials">
          <table className="w-full min-w-[900px] border border-rule bg-panel text-sm">
            <thead>
              <tr>
                <th className={th}>Material</th>
                <th className={th}>Family</th>
                <th className={th}>Location</th>
                <th className={th}>Available volume</th>
                <th className={th}>Data status</th>
                <th className={th}>Best in-scope pathway (baseline)</th>
                <th className={th}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ material: m, inScope, invalid }) => {
                const best = inScope[0];
                return (
                  <tr key={m.id} className="hover:bg-panel-sunk">
                    <td className={`${td} min-w-[200px]`}>
                      <Link href={`/materials/${m.id}`} className="font-semibold hover:text-copper">{m.name}</Link>
                      <div className="font-mono text-xs text-ink-3">{m.code}</div>
                    </td>
                    <td className={td}>{FAMILY_SHORT[m.family]}</td>
                    <td className={td}>{m.location.region}</td>
                    <td className={`${td} whitespace-nowrap`}>{fmtTonnes(m.volume.tonnesPerYear)}</td>
                    <td className={td}><OriginBadge origin={m.dataOrigin} /></td>
                    <td className={`${td} w-[240px]`}>
                      {invalid ? (
                        <span className="text-oxide">Invalid data, not screened</span>
                      ) : best ? (
                        <div className="space-y-1">
                          <div className="text-xs text-ink-2">{best.rank ? appName.get(best.applicationId) : "No actionable pathway"}</div>
                          <BridgeSpan result={best} materialLabel={m.name} applicationLabel={appName.get(best.applicationId) ?? best.applicationId} compact />
                        </div>
                      ) : (
                        <span className="text-ink-3">No in-scope application</span>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap text-ink-2`}>{fmtDate(m.updatedAt)}</td>
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
