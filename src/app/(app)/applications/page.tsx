import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, TableWrap, td, th } from "@/components/ui";
import { FAMILY_SHORT, SPEC_STATUS_LABELS } from "@/domain/labels";
import { fmtInr, fmtNumber } from "@/lib/format";
import { requireContext } from "@/server/context";

export const metadata = { title: "Applications" };

export default function ApplicationsPage() {
  return (
    <>
      <PageHeader
        title="Application registry"
        lede="Possible uses with structured acceptance rules. Each rule is labelled as source-referenced or a demonstration assumption; none is presented as a universal industrial standard. Reference specifications are read-only."
      />
      <Suspense fallback={<p className="text-ink-3">Loading applications…</p>}>
        <ApplicationsTable />
      </Suspense>
    </>
  );
}

async function ApplicationsTable() {
  const { repo } = await requireContext();
  const apps = await repo.listApplications();
  return (
    <TableWrap label="Applications">
      <table className="w-full min-w-[960px] border border-rule bg-panel text-sm">
        <thead>
          <tr>
            <th className={th}>Application</th>
            <th className={th}>Target industry</th>
            <th className={th}>Material scope</th>
            <th className={th}>Rules</th>
            <th className={th}>Specification basis</th>
            <th className={th}>Demand (t/yr)</th>
            <th className={th}>Indicative price</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => {
            const sourced = a.requirements.filter((r) => r.basis === "source_referenced").length;
            return (
              <tr key={a.id} className="hover:bg-panel-sunk">
                <td className={td}>
                  <Link href={`/applications/${a.id}`} className="font-semibold hover:text-copper">{a.name}</Link>
                  <div className="font-mono text-xs text-ink-3">{a.code}</div>
                </td>
                <td className={td}>{a.industry}</td>
                <td className={td}>{a.acceptedFamilies.map((f) => FAMILY_SHORT[f]).join(", ")}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {a.requirements.length} property, {a.evidenceRequirements.length} evidence
                </td>
                <td className={td}>
                  {SPEC_STATUS_LABELS[a.specStatus]}
                  {a.requirements.length ? <div className="text-xs text-ink-3">{sourced} of {a.requirements.length} property rules source-referenced</div> : null}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {fmtNumber(a.demand.minTonnesPerYear)}–{fmtNumber(a.demand.maxTonnesPerYear)}
                </td>
                <td className={`${td} whitespace-nowrap`}>{a.economics.indicativePriceInrPerTonne === null ? "Not set" : fmtInr(a.economics.indicativePriceInrPerTonne, "/t")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}
