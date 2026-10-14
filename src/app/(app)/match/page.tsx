import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { EmptyState, OriginBadge, PageHeader, Panel, TableWrap, td, th } from "@/components/ui";
import { FAMILY_SHORT } from "@/domain/labels";
import { fmtDateTime, fmtTonnes } from "@/lib/format";
import { runMatchAction } from "@/server/actions";
import { requireContext } from "@/server/context";

export const metadata = { title: "Matching workspace" };

export default function MatchPage() {
  return (
    <>
      <PageHeader
        title="Matching workspace"
        lede="Choose a material and run the engine against every application in the registry. Each run is saved with its inputs, engine version, scoring model version and ruleset versions so it can be reproduced."
      />
      <Suspense fallback={<p className="text-ink-3">Loading…</p>}>
        <Workspace />
      </Suspense>
    </>
  );
}

async function Workspace() {
  const { repo } = await requireContext();
  const [materials, runs] = await Promise.all([repo.listMaterials(), repo.listRuns({ limit: 30 })]);
  return (
    <div className="space-y-6">
      <Panel title="Run a new analysis" aside="Baseline assumptions; adjust later in Scenarios">
        <form action={runMatchAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            Material
            <select name="materialId" required className="mt-1 block w-full border border-rule-strong bg-panel px-2 py-2 text-sm">
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}, {m.name} ({FAMILY_SHORT[m.family]})
                </option>
              ))}
            </select>
          </label>
          <SubmitButton pendingLabel="Running engine…">Run match analysis</SubmitButton>
        </form>
      </Panel>

      <Panel title="Materials" aside={`${materials.length} profiles`}>
        <TableWrap label="Materials to analyse">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                <th className={th}>Material</th>
                <th className={th}>Family</th>
                <th className={th}>Volume</th>
                <th className={th}>Data status</th>
                <th className={th}><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id}>
                  <td className={td}>
                    <Link href={`/materials/${m.id}`} className="font-semibold hover:text-copper">{m.name}</Link>
                    <div className="font-mono text-xs text-ink-3">{m.code}</div>
                  </td>
                  <td className={td}>{FAMILY_SHORT[m.family]}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtTonnes(m.volume.tonnesPerYear)}</td>
                  <td className={td}><OriginBadge origin={m.dataOrigin} /></td>
                  <td className={`${td} text-right`}>
                    <form action={runMatchAction}>
                      <input type="hidden" name="materialId" value={m.id} />
                      <SubmitButton variant="secondary" pendingLabel="Running…">
                        Run<span className="sr-only"> analysis for {m.name}</span>
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <Panel title="Saved runs">
        {runs.length === 0 ? (
          <EmptyState title="No runs yet">Run an analysis above. Results are stored with the exact inputs used.</EmptyState>
        ) : (
          <TableWrap label="Saved runs">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Material</th>
                  <th className={th}>Scenario</th>
                  <th className={th}>Outcome</th>
                  <th className={th}>Versions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} whitespace-nowrap`}>
                      <Link href={`/match/runs/${r.id}`} className="font-semibold hover:text-copper">{fmtDateTime(r.createdAt)}</Link>
                    </td>
                    <td className={td}>{r.materialName}<div className="font-mono text-xs text-ink-3">{r.materialCode}</div></td>
                    <td className={td}>{r.label}</td>
                    <td className={`${td} text-ink-2`}>
                      {r.counts.potentially_eligible} potentially eligible, {r.counts.incomplete_evidence} incomplete, {r.counts.ineligible} ineligible
                    </td>
                    <td className={`${td} font-mono text-xs text-ink-3`}>
                      {r.engineVersion}
                      <br />
                      {r.scoringModelVersion}, input {r.inputHash}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
