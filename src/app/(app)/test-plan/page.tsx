import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink, EmptyState, PageHeader, Panel, StateBadge, TableWrap, buttonStyles, cx, td, th } from "@/components/ui";
import type { GapItem, GapKind } from "@/domain/engine/test-plan";
import { FAMILY_SHORT, REVIEWER_LABELS } from "@/domain/labels";
import { fmtInrCompact, fmtNumber } from "@/lib/format";
import { requireContext } from "@/server/context";
import { portfolioInsights } from "@/server/insights";

export const metadata = { title: "Test planner" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const KIND_LABELS: Record<GapKind, string> = {
  laboratory_package: "Laboratory package",
  measurement: "Measurement",
  declaration: "Producer declaration",
  specification: "Recipient specification",
};

export default function TestPlanPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader
        title="Test planner"
        lede="Which single test unlocks the most value? Outstanding evidence is grouped into laboratory packages and ranked by how many pathways each one makes fully assessable. Assessable is not eligible: a new result can still fail its threshold."
        actions={<ButtonLink href="/portfolio">Group portfolio</ButtonLink>}
      />
      <Suspense fallback={<p className="text-ink-3">Planning tests…</p>}>
        <TestPlanContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function TestPlanContent({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { repo } = await requireContext();
  const p = await portfolioInsights(repo);
  const appNames = new Map(p.applications.map((a) => [a.id, a.name]));
  if (p.positions.length === 0) return <EmptyState title="No materials yet" />;

  const ranked = p.positions
    .filter((x) => !x.invalid)
    .toSorted(
      (a, b) =>
        (b.plan.bestSingle?.unlocks.length ?? -1) - (a.plan.bestSingle?.unlocks.length ?? -1) ||
        (b.plan.bestSingle?.valueAtStakeInr ?? 0) - (a.plan.bestSingle?.valueAtStakeInr ?? 0) ||
        a.material.code.localeCompare(b.material.code),
    );
  const selected = p.positions.find((x) => x.material.id === one(sp.material)) ?? ranked.find((x) => x.plan.items.length > 0) ?? ranked[0];
  const plan = selected.plan;
  const gated = plan.considered.filter((a) => !plan.alreadyAssessable.includes(a));
  const blocking = plan.items.filter((i) => i.gates.length > 0);
  const informing = plan.items.filter((i) => i.gates.length === 0);

  return (
    <div className="space-y-6">
      <Panel title="Next test for each material" aside="Baseline assumptions">
        <TableWrap label="Next test for each material">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr>
                <th className={th}>Material</th>
                <th className={th}>Commission next</th>
                <th className={`${th} text-right`}>Pathways it makes assessable</th>
                <th className={`${th} text-right`}>Indicative value at stake / yr</th>
                <th className={th}>Reviewed by</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((x) => {
                const n = x.plan.bestSingle;
                const isSel = x.material.id === selected.material.id;
                return (
                  <tr key={x.material.id} className={isSel ? "bg-copper-wash" : undefined}>
                    <td className={td}>
                      <Link href={`/test-plan?material=${x.material.id}`} className="font-semibold hover:text-copper" aria-current={isSel ? "true" : undefined}>
                        {x.material.name}
                      </Link>
                      <div className="text-xs text-ink-3">{x.material.code}, {FAMILY_SHORT[x.material.family]}</div>
                    </td>
                    <td className={td}>
                      {n ? (
                        <>
                          <div className="font-semibold">{n.label}</div>
                          <div className="text-xs text-ink-3">{n.covers.join("; ")}</div>
                        </>
                      ) : (
                        <span className="text-ink-3">Nothing blocking</span>
                      )}
                    </td>
                    <td className={`${td} text-right`}>{n ? (n.unlocks.length ? n.unlocks.length : <span className="text-ink-3">0 alone, needed by {n.gates.length}</span>) : "—"}</td>
                    <td className={`${td} text-right font-semibold`}>{n && n.valueAtStakeInr > 0 ? fmtInrCompact(n.valueAtStakeInr) : "—"}</td>
                    <td className={`${td} text-ink-2`}>{n ? n.reviewers.map((r) => REVIEWER_LABELS[r]).join(", ") || "—" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <section aria-labelledby="plan-title" className="border border-rule-strong bg-panel">
        <div className="flex flex-col gap-3 border-b border-rule px-4 py-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 id="plan-title" className="wide text-xl font-bold">{selected.material.name}</h2>
            <p className="text-sm text-ink-2">
              {plan.considered.length} pathway{plan.considered.length === 1 ? "" : "s"} not ruled out, {plan.alreadyAssessable.length} already fully assessable,{" "}
              {plan.excludedIneligible.length} excluded because a known hard rule fails (no test changes a known failure).
            </p>
          </div>
          <form method="get" className="flex shrink-0 items-end gap-2 print:hidden">
            <label className="min-w-0 text-sm">
              <span className="sr-only">Material</span>
              <select name="material" defaultValue={selected.material.id} className="block w-full max-w-[18rem] border border-rule-strong bg-panel px-2 py-2 text-sm">
                {p.positions.map((x) => (
                  <option key={x.material.id} value={x.material.id}>{x.material.code}, {x.material.name}</option>
                ))}
              </select>
            </label>
            <button type="submit" className={`${buttonStyles.secondary} whitespace-nowrap`}>Show plan</button>
          </form>
        </div>

        <div className="p-4 md:p-6">
          {selected.invalid ? (
            <p className="text-sm text-oxide">{selected.invalid}</p>
          ) : plan.sequence.length === 0 ? (
            <EmptyState title="Nothing is blocking assessment">
              Every pathway that is not ruled out can already be assessed on the available data. {informing.length ? "Optional items below would only sharpen scores and confidence." : ""}
            </EmptyState>
          ) : (
            <>
              <h3 className="mb-3 font-semibold">Recommended order</h3>
              <ol className="relative space-y-0">
                {plan.sequence.map((s, i) => (
                  <li key={s.item.key} className="grid grid-cols-[2.5rem_1fr] gap-x-3 md:grid-cols-[2.5rem_1fr_15rem]">
                    <div className="flex flex-col items-center">
                      <span className={cx("wide flex size-9 items-center justify-center text-lg font-bold", s.completes.length ? "bg-verdigris text-white" : "hatch border border-ink-3")}>
                        <span className={s.completes.length ? "" : "bg-panel px-1"}>{i + 1}</span>
                      </span>
                      {i < plan.sequence.length - 1 ? <span className="w-0.5 flex-1 bg-rule-strong" aria-hidden /> : null}
                    </div>
                    <div className="pb-6">
                      <ItemHeading item={s.item} />
                      <p className="mt-1 text-sm text-ink-2">Supplies: {s.item.covers.join("; ")}.</p>
                      <p className="mt-1 text-sm">
                        {s.completes.length ? (
                          <>
                            <span className="font-semibold text-verdigris">Completes:</span> {s.completes.map((a) => appNames.get(a)).join("; ")}
                          </>
                        ) : (
                          <span className="text-ink-3">Needed, together with later steps, by {s.item.gates.map((a) => appNames.get(a)).join("; ")}.</span>
                        )}
                      </p>
                    </div>
                    <div className="col-start-2 mb-6 border-l-2 border-rule-strong pl-3 text-sm md:col-start-3">
                      <div className="text-ink-3">After this step</div>
                      <div className="wide font-bold">
                        {s.cumulativeAssessable} of {gated.length} assessable
                      </div>
                      <div className="text-ink-2">{s.cumulativeValueInr > 0 ? `${fmtInrCompact(s.cumulativeValueInr)}/yr indicative value in play` : "No priced value yet"}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </section>

      {plan.items.length ? (
        <Panel title="Evidence matrix" aside="Hatched cells: outstanding for that pathway">
          <TableWrap label="Evidence matrix">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Pathway</th>
                  {plan.items.map((i) => (
                    <th key={i.key} className={cx(th, "text-center whitespace-normal")} style={{ minWidth: "7.5rem" }}>{i.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.considered.map((appId) => (
                  <tr key={appId}>
                    <th scope="row" className={`${td} text-left font-semibold`}>
                      {appNames.get(appId)}
                      {plan.alreadyAssessable.includes(appId) ? <div className="text-xs font-normal text-verdigris">Already assessable</div> : null}
                    </th>
                    {plan.items.map((i) => {
                      const blocks = i.gates.includes(appId);
                      const soft = i.informs.includes(appId);
                      return (
                        <td key={i.key} className={cx(td, "text-center", blocks && "hatch")}>
                          {blocks ? (
                            <span className="bg-panel px-1 text-xs font-semibold">{i.safetyCritical ? "Safety-critical" : "Required"}</span>
                          ) : soft ? (
                            <span className="text-xs text-ink-3">Improves score</span>
                          ) : (
                            <span className="sr-only">Not needed</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}

      {blocking.length || informing.length ? (
        <Panel title="Every outstanding item" aside="Ranked: pathways completed alone, value at stake, pathways gated">
          <ul className="divide-y divide-rule">
            {[...blocking, ...informing].map((i) => (
              <li key={i.key} className="grid gap-2 py-3 md:grid-cols-[1.4fr_1fr_10rem]">
                <div>
                  <ItemHeading item={i} />
                  <div className="text-xs text-ink-3">{i.covers.join("; ")}</div>
                </div>
                <div className="text-sm text-ink-2">
                  {i.gates.length ? <div>Needed by: {i.gates.map((a) => appNames.get(a)).join("; ")}</div> : null}
                  {i.informs.length ? <div className="text-ink-3">Sharpens the score for: {i.informs.map((a) => appNames.get(a)).join("; ")}</div> : null}
                </div>
                <div className="text-sm md:text-right">
                  <div className="font-semibold">{i.unlocks.length ? `Completes ${i.unlocks.length} alone` : i.gates.length ? "Completes none alone" : "Optional"}</div>
                  <div className="text-ink-3">{i.valueAtStakeInr > 0 ? `${fmtInrCompact(i.valueAtStakeInr)}/yr at stake` : i.tonnesAtStake > 0 ? `${fmtNumber(i.tonnesAtStake)} t/yr at stake` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="How the plan is built">
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          <li>An item is outstanding when a hard or safety-critical requirement depends on it and its value or document is unknown.</li>
          <li>Measurements are grouped with the report that normally supplies them (for example, total chromium and lead with a heavy metals analysis). This is a grouping assumption; it never marks anything as measured.</li>
          <li>The order is greedy: each step takes the item that completes the most pathways, then the most indicative value, then the pathway closest to completion, with safety-critical items first on ties.</li>
          <li>Value at stake is the positive indicative annual net benefit of the pathways an item completes, from illustrative prices. It is realised only if the results pass and reviewers approve.</li>
          <li>Pathways with a known hard failure are left out. Pooling and processing routes for those are shown on the <Link href="/portfolio#pooling" className="text-copper hover:underline">group portfolio</Link> and in each Missing-Bridge plan.</li>
        </ul>
        {selected.lead ? (
          <p className="mt-3 text-sm">
            Current best pathway for this material: <span className="font-semibold">{appNames.get(selected.lead.applicationId)}</span>{" "}
            <StateBadge state={selected.lead.state} />
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function ItemHeading({ item }: { item: GapItem }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="font-semibold">{item.label}</span>
      <span className="text-xs text-ink-3">{KIND_LABELS[item.kind]}</span>
      {item.safetyCritical ? <span className="border border-oxide/50 px-1 text-[11px] font-semibold text-oxide">Safety-critical</span> : null}
      {item.reviewers.length ? <span className="text-xs text-ink-3">Reviewed by {item.reviewers.map((r) => REVIEWER_LABELS[r].toLowerCase()).join(", ")}</span> : null}
    </div>
  );
}
