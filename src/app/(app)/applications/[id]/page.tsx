import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BasisTag, PageHeader, Panel, TableWrap, Term, td, th } from "@/components/ui";
import { describeRequirement } from "@/domain/engine/requirements";
import { CIRCULARITY_TIER_LABEL } from "@/domain/scoring-config";
import { FAMILY_LABELS, PROVENANCE_LABELS, REVIEWER_LABELS, SPEC_STATUS_LABELS } from "@/domain/labels";
import { PROPERTIES } from "@/domain/properties";
import { fmtInr, fmtNumber } from "@/lib/format";
import type { EvidenceSource } from "@/domain/types";
import { requireContext } from "@/server/context";

function SourceLink({ source }: { source?: EvidenceSource }) {
  return source ? (
    <Link href={`/evidence#${source.id}`} className="text-xs text-copper hover:underline">{source.organisation.split(",")[0]}</Link>
  ) : (
    <span className="text-xs text-ink-3">No external source</span>
  );
}

export const metadata = { title: "Application" };

export default function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Loading application…</p>}>
      <ApplicationContent params={params} />
    </Suspense>
  );
}

async function ApplicationContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo } = await requireContext();
  const [app, evidence] = await Promise.all([repo.getApplication(id), repo.listEvidence()]);
  if (!app) notFound();
  const src = new Map(evidence.map((e) => [e.id, e]));

  return (
    <>
      <PageHeader
        kicker={<Link href="/applications" className="hover:text-copper">Application registry</Link>}
        title={app.name}
        lede={app.description}
      />
      <div className="mb-6 grid gap-4 border border-rule bg-panel p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><div className="text-xs text-ink-3">Target industry</div>{app.industry}</div>
        <div><div className="text-xs text-ink-3">Specification basis</div>{SPEC_STATUS_LABELS[app.specStatus]}</div>
        <div><div className="text-xs text-ink-3">Ruleset version</div><span className="font-mono text-xs">{app.rulesetVersion}</span></div>
        <div><div className="text-xs text-ink-3">Review status</div>{app.reviewStatus === "source_checked" ? "Sources checked" : "Demo, unreviewed"}</div>
      </div>

      <div className="space-y-6">
        <Panel title="Required material characteristics" aside={`${app.requirements.length} rules`}>
          {app.requirements.length === 0 ? (
            <p className="hatch border border-dashed border-ink-3 p-0.5 text-sm">
              <span className="block bg-panel p-3">
                No validated acceptance specification exists for this application in the dataset. Every material is treated as having incomplete evidence until one is agreed.
              </span>
            </p>
          ) : (
            <TableWrap label="Property requirements">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr>
                    <th className={th}>Property</th>
                    <th className={th}>Acceptance</th>
                    <th className={th}>Enforcement</th>
                    <th className={th}>Basis</th>
                    <th className={th}>Rationale</th>
                    <th className={th}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {app.requirements.map((r) => (
                    <tr key={r.id}>
                      <td className={td}><Term help={PROPERTIES[r.property].help}>{PROPERTIES[r.property].label}</Term></td>
                      <td className={`${td} whitespace-nowrap font-semibold`}>{describeRequirement(r)}</td>
                      <td className={td}>
                        {r.enforcement === "hard" ? "Hard constraint" : "Soft (scored)"}
                        {r.safetyCritical ? <div className="text-xs font-semibold text-oxide">Safety-critical</div> : null}
                      </td>
                      <td className={td}><BasisTag basis={r.basis} /></td>
                      <td className={`${td} max-w-[42ch] text-ink-2`}>
                        {r.rationale}
                        {r.remediation ? <div className="mt-1 text-xs text-ink-3">Possible processing: {r.remediation}</div> : null}
                      </td>
                      <td className={td}><SourceLink source={r.sourceId ? src.get(r.sourceId) : undefined} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Panel>

        <Panel title="Required tests and documentary evidence">
          {app.evidenceRequirements.length === 0 ? (
            <p className="text-sm text-ink-3">None defined.</p>
          ) : (
            <ul className="divide-y divide-rule text-sm">
              {app.evidenceRequirements.map((e) => (
                <li key={e.id} className="grid gap-1 py-2.5 md:grid-cols-[1fr_2fr_auto]">
                  <div>
                    <div className="font-semibold">{e.label}</div>
                    <div className="text-xs text-ink-3">
                      {e.enforcement === "hard" ? "Hard" : "Soft"}
                      {e.safetyCritical ? ", safety-critical" : ""}; reviewer: {REVIEWER_LABELS[e.reviewer].toLowerCase()}
                    </div>
                  </div>
                  <div className="text-ink-2">{e.why}</div>
                  <div className="flex items-start gap-2"><BasisTag basis={e.basis} /><SourceLink source={e.sourceId ? src.get(e.sourceId) : undefined} /></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Scope, demand and logistics">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-ink-3">Material families in scope</dt><dd>{app.acceptedFamilies.map((f) => FAMILY_LABELS[f]).join("; ")}</dd></div>
              <div><dt className="text-xs text-ink-3">Hazardous materials</dt><dd>{app.excludesDeclaredHazardous ? "Excluded; undeclared status blocks assessment" : "Not excluded by rule"}</dd></div>
              <div>
                <dt className="text-xs text-ink-3">Illustrative demand</dt>
                <dd>{fmtNumber(app.demand.minTonnesPerYear)}–{fmtNumber(app.demand.maxTonnesPerYear)} t/yr ({PROVENANCE_LABELS[app.demand.provenance].toLowerCase()})</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Demand sites (illustrative)</dt>
                <dd>
                  <ul className="list-disc pl-5">
                    {app.demandSites.map((s) => (
                      <li key={s.id}>{s.label}, {s.region}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div><dt className="text-xs text-ink-3">Maximum transport distance</dt><dd>{app.logistics.maxTransportKm} km by road <BasisTag basis={app.logistics.basis} /></dd></div>
            </dl>
          </Panel>
          <Panel title="Processing and economics">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-ink-3">Expected processing</dt><dd>{app.processingSteps.join("; ")}</dd></div>
              <div>
                <dt className="text-xs text-ink-3">Indicative price / processing cost</dt>
                <dd>
                  {app.economics.indicativePriceInrPerTonne === null ? "Price not set" : fmtInr(app.economics.indicativePriceInrPerTonne, "/t")} /{" "}
                  {app.economics.processingCostInrPerTonne === null ? "processing cost not set" : fmtInr(app.economics.processingCostInrPerTonne, "/t")}
                  <div className="text-xs text-ink-3">{PROVENANCE_LABELS[app.economics.provenance]}; illustrative, not a quotation.</div>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">Circularity tier</dt>
                <dd>{CIRCULARITY_TIER_LABEL[app.circularity.tier]}. Substitutes: {app.circularity.substitutes}.</dd>
              </div>
              <div><dt className="text-xs text-ink-3">Regulatory review</dt><dd>{app.requiresRegulatoryReview ? "Required before use" : "Not flagged by this ruleset (technical review still required)"}</dd></div>
            </dl>
          </Panel>
        </div>

        <Panel title="References">
          {app.sourceIds.length === 0 ? (
            <p className="text-sm text-ink-3">No external references. All rules for this application are demonstration assumptions.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {app.sourceIds.map((sid) => {
                const s = src.get(sid);
                return s ? (
                  <li key={sid}>
                    <Link href={`/evidence#${sid}`} className="font-semibold hover:text-copper">{s.title}</Link>
                    <div className="text-xs text-ink-3">{s.organisation}. Used for: {s.claim}</div>
                  </li>
                ) : null;
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
