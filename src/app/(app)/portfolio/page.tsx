import Link from "next/link";
import { Suspense } from "react";
import { FlowDiagram } from "@/components/flow-diagram";
import { PrintButton } from "@/components/print-button";
import { ButtonLink, EmptyState, PageHeader, Panel, Stat, StateBadge, TableWrap, cx, td, th } from "@/components/ui";
import { POOLING_CAVEATS } from "@/domain/engine/pooling";
import { FAMILY_SHORT, REVIEWER_LABELS } from "@/domain/labels";
import { fmtInrCompact, fmtNumber, fmtPct } from "@/lib/format";
import { requireContext } from "@/server/context";
import { portfolioInsights, type OrganisationRollup } from "@/server/insights";

export const metadata = { title: "Group portfolio" };

const kt = (t: number) => (
  <>
    {fmtNumber(t / 1000, t > 0 && t < 10000 ? 1 : 0)}
    <span className="text-base font-medium text-ink-3"> kt/yr</span>
  </>
);

export default function PortfolioPage() {
  return (
    <>
      <PageHeader
        title="Group portfolio"
        lede="Every producer company in this workspace, screened live under baseline assumptions. Each material counts once, against its best pathway. Rupee figures come from illustrative prices and freight rates: they are scenario estimates, not savings."
        actions={
          <>
            <ButtonLink href="/test-plan">Test planner</ButtonLink>
            <PrintButton />
          </>
        }
      />
      <Suspense fallback={<p className="text-ink-3">Screening the portfolio…</p>}>
        <PortfolioContent />
      </Suspense>
    </>
  );
}

async function PortfolioContent() {
  const { repo } = await requireContext();
  const p = await portfolioInsights(repo);
  const appNames = new Map(p.applications.map((a) => [a.id, a.name]));
  const t = p.totals;
  if (p.positions.length === 0) return <EmptyState title="No materials yet" action={<ButtonLink href="/materials/new" variant="primary">Add a material</ButtonLink>} />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-y-5 border border-rule bg-panel py-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Registered by-products" value={kt(t.registeredTonnes)} note={`${p.positions.length} streams, ${p.organisations.length} producer companies`} />
        <Stat
          label="Placed, potentially eligible"
          value={kt(t.placedEligibleTonnes)}
          note={`${fmtPct(t.registeredTonnes ? t.placedEligibleTonnes / t.registeredTonnes : 0)} of registered, subject to review`}
        />
        <Stat label="Placed, awaiting evidence" value={kt(t.placedPendingTonnes)} note="Could move once tests come back" href="/test-plan" />
        <Stat label="Indicative value, screened" value={fmtInrCompact(t.screenedValueInr)} note="Per year, eligible pathways with a positive net" />
        <Stat label="Indicative value, awaiting evidence" value={fmtInrCompact(t.pendingValueInr)} note="Per year, if the evidence supports it" href="/test-plan" />
      </div>

      <Panel title="Where the tonnes go" aside="Baseline assumptions, best pathway per material">
        <FlowDiagram flows={p.flows} appNames={appNames} />
        {t.transportTco2ePerYear > 0 ? (
          <p className="mt-3 border-t border-rule pt-3 text-sm text-ink-2">
            Moving the placed tonnes by road would add about <span className="font-semibold text-ink">{fmtNumber(t.transportTco2ePerYear)} t CO₂e a year</span>,
            tank-to-wheel, using the{" "}
            <Link href="/evidence#src-glec-v32-india-road" className="text-copper hover:underline">GLEC v3.2 Indian heavy-truck factor</Link>. Emissions avoided by
            displacing primary materials are not estimated.
          </p>
        ) : null}
      </Panel>

      <Panel title="Producer companies" aside={`${p.organisations.length} in this workspace`}>
        <TableWrap label="Producer companies">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr>
                <th className={th}>Company and streams</th>
                <th className={`${th} w-56`}>Registered and placed</th>
                <th className={th}>Best pathway</th>
                <th className={`${th} text-right`}>Indicative value / yr</th>
                <th className={th}>Next test to commission</th>
              </tr>
            </thead>
            {p.organisations.map((o) => (
              <OrganisationRows key={o.organisation.id} o={o} appNames={appNames} />
            ))}
          </table>
        </TableWrap>
      </Panel>

      <Panel
        id="pooling"
        title="Pooling opportunities"
        aside={p.pools.length ? `${p.pools.length} found` : undefined}
      >
        <p className="mb-4 max-w-[75ch] text-sm text-ink-2">
          Sources that miss a recipient&apos;s minimum offtake on their own, fail nothing else, and could reach it together: same material family, same
          demand site, each within the transport limit. Useful for smaller producers who cannot meet a bulk buyer&apos;s volume alone.
        </p>
        {p.pools.length === 0 ? (
          <EmptyState title="No pooling opportunities in the current records">A pool appears when two or more sources of one family fall short of the same minimum offtake.</EmptyState>
        ) : (
          <div className="space-y-4">
            {p.pools.map((pool) => (
              <article key={`${pool.applicationId}-${pool.demandSiteId}-${pool.family}`} className="border border-rule-strong">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule bg-panel-sunk px-4 py-2.5">
                  <h3 className="font-semibold">
                    {FAMILY_SHORT[pool.family]} for {appNames.get(pool.applicationId)}
                  </h3>
                  <span className="text-sm text-ink-3">{pool.demandSiteLabel}</span>
                </div>
                <div className="grid gap-5 p-4 lg:grid-cols-[1fr_1.2fr]">
                  <div>
                    <div className="text-sm text-ink-2">Combined supply against the minimum offtake</div>
                    <div className="wide mt-1 text-2xl font-bold">
                      {fmtNumber(pool.combinedTonnes)} <span className="text-base font-medium text-ink-3">of {fmtNumber(pool.minTonnes)} t/yr needed</span>
                    </div>
                    <PoolBar pool={pool} />
                  </div>
                  <ul className="divide-y divide-rule text-sm">
                    {pool.members.map((m) => {
                      const pos = p.positions.find((x) => x.material.id === m.materialId)!;
                      return (
                        <li key={m.materialId} className="py-2 first:pt-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <Link href={`/materials/${m.materialId}`} className="font-semibold hover:text-copper">{pos.material.name}</Link>
                            <span>{fmtNumber(m.offeredTonnes)} t/yr, {fmtNumber(m.distanceKm)} km</span>
                          </div>
                          <div className="text-xs text-ink-3">{p.organisations.find((o) => o.organisation.id === m.organisationId)?.organisation.name}</div>
                          <div className={cx("mt-0.5 text-xs", m.outstanding.length ? "font-semibold text-ochre" : "text-ink-2")}>
                            {m.outstanding.length ? `Still needs on its own: ${m.outstanding.join("; ")}` : "No outstanding items of its own"}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <ul className="list-disc space-y-0.5 border-t border-rule px-4 py-3 pl-8 text-xs text-ink-3">
                  {POOLING_CAVEATS.map((c) => <li key={c}>{c}</li>)}
                </ul>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Who needs to act" aside="Open actions across pathways not already ruled out">
        <TableWrap label="Review workload">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className={th}>Reviewer</th>
                <th className={`${th} text-right`}>Blocking actions</th>
                <th className={`${th} text-right`}>All actions</th>
                <th className={`${th} text-right`}>Pathways involved</th>
              </tr>
            </thead>
            <tbody>
              {p.workload.map((w) => (
                <tr key={w.reviewer}>
                  <td className={`${td} font-semibold`}>{REVIEWER_LABELS[w.reviewer]}</td>
                  <td className={cx(td, "text-right", w.blocking > 0 && "font-semibold text-oxide")}>{w.blocking}</td>
                  <td className={`${td} text-right`}>{w.total}</td>
                  <td className={`${td} text-right`}>{w.pathways}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <p className="mt-3 text-xs text-ink-3">Technical review appears on every pathway that is not ruled out: screening never replaces a qualified engineer.</p>
      </Panel>
    </div>
  );
}

function OrganisationRows({ o, appNames }: { o: OrganisationRollup; appNames: Map<string, string> }) {
  // The company line adds up the rows below it, losses included.
  const leadNet = o.materials.reduce((s, m) => s + (m.lead?.economics.annualNetInr ?? 0), 0);
  return (
    <tbody className="border-b-2 border-rule-strong">
      <tr className="bg-panel-sunk">
        <th scope="rowgroup" colSpan={3} className="px-3 py-2 text-left font-semibold">{o.organisation.name}</th>
        <td className={cx("px-3 py-2 text-right font-semibold", leadNet < 0 && "text-oxide")}>{fmtInrCompact(leadNet)}</td>
        <td className="px-3 py-2 text-xs text-ink-3">{o.openBlockingActions} blocking action{o.openBlockingActions === 1 ? "" : "s"}</td>
      </tr>
      {o.materials.map((m) => {
        const reported = m.material.volume.tonnesPerYear ?? 0;
        const lead = m.lead;
        const placed = lead ? Math.min(reported, lead.economics.acceptedTonnes ?? 0) : 0;
        const next = m.plan.bestSingle;
        return (
          <tr key={m.material.id}>
            <td className={td}>
              <Link href={`/materials/${m.material.id}`} className="font-semibold hover:text-copper">{m.material.name}</Link>
              <div className="text-xs text-ink-3">{m.material.code}, {m.material.location.region}</div>
            </td>
            <td className={td}>
              <div className="flex h-2.5 w-full bg-panel-sunk" aria-hidden>
                {lead && placed > 0 ? (
                  <span
                    className={lead.state === "potentially_eligible" ? "bg-verdigris" : "hatch border border-ochre bg-ochre-wash"}
                    style={{ width: `${reported ? (placed / reported) * 100 : 0}%` }}
                  />
                ) : null}
              </div>
              <div className="mt-1 text-xs text-ink-2">
                {fmtNumber(placed)} of {reported ? `${fmtNumber(reported)} t/yr` : "unreported volume"} placed
              </div>
            </td>
            <td className={td}>
              {lead ? (
                <>
                  <div>{appNames.get(lead.applicationId)}</div>
                  <StateBadge state={lead.state} className="mt-1" />
                </>
              ) : (
                <span className="text-ink-3">{m.invalid ? "Profile failed validation" : "No pathway passes screening"}</span>
              )}
            </td>
            <td className={cx(td, "text-right", lead && (lead.economics.annualNetInr ?? 0) < 0 && "text-oxide")}>
              {lead?.economics.annualNetInr == null ? "—" : fmtInrCompact(lead.economics.annualNetInr)}
            </td>
            <td className={td}>
              {next ? (
                <Link href={`/test-plan?material=${m.material.id}`} className="font-semibold hover:text-copper">
                  {next.label}
                  <div className="text-xs font-normal text-ink-3">
                    {next.unlocks.length ? `Makes ${next.unlocks.length} pathway${next.unlocks.length > 1 ? "s" : ""} assessable` : `Needed by ${next.gates.length} pathway${next.gates.length > 1 ? "s" : ""}`}
                  </div>
                </Link>
              ) : (
                <span className="text-ink-3">Nothing outstanding</span>
              )}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

function PoolBar({ pool }: { pool: { combinedTonnes: number; minTonnes: number; members: { materialId: string; offeredTonnes: number }[] } }) {
  const scale = Math.max(pool.combinedTonnes, pool.minTonnes) * 1.1;
  return (
    <div className="mt-3">
      <div className="relative flex h-6 bg-panel-sunk" aria-hidden>
        {pool.members.map((m, i) => (
          <span
            key={m.materialId}
            className={cx("h-full border-r-2 border-panel", i % 2 ? "bg-copper/70" : "bg-copper")}
            style={{ width: `${(m.offeredTonnes / scale) * 100}%` }}
          />
        ))}
        <span className="absolute inset-y-[-4px] w-0.5 bg-ink" style={{ left: `${(pool.minTonnes / scale) * 100}%` }} />
      </div>
      <div className="relative mt-1 h-4 text-xs text-ink-3">
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(pool.minTonnes / scale) * 100}%` }}>minimum offtake</span>
      </div>
    </div>
  );
}
