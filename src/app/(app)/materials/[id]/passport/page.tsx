import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { OriginBadge, ProvenanceTag, StateBadge, TableWrap, cx, td, th } from "@/components/ui";
import { DOC_LABELS } from "@/domain/engine/bridge";
import { fnv1a, stableStringify } from "@/domain/engine/run";
import { DOC_STATUS_LABELS, FAMILY_LABELS, REVIEWER_LABELS, VERIFICATION_LABELS } from "@/domain/labels";
import { PROPERTIES } from "@/domain/properties";
import { ENGINE_VERSION, SCORING_MODEL_VERSION } from "@/domain/scoring-config";
import type { ReviewerType } from "@/domain/types";
import { unitLabel } from "@/domain/units";
import { fmtDateTime, fmtInr, fmtInrCompact, fmtNumber, fmtTonnes } from "@/lib/format";
import { baselineScreen } from "@/server/analysis";
import { requireContext } from "@/server/context";
import { portfolioInsights } from "@/server/insights";

export const metadata = { title: "Evidence passport" };

const HAZARD_TEXT = {
  declared_non_hazardous: "Declared non-hazardous",
  declared_hazardous: "Declared hazardous",
  not_declared: "Not declared",
} as const;

export default function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Assembling the passport…</p>}>
      <PassportContent params={params} />
    </Suspense>
  );
}

async function PassportContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo } = await requireContext();
  const [material, p, { screens }, orgs] = await Promise.all([repo.getMaterial(id), portfolioInsights(repo), baselineScreen(repo), repo.listOrganisations()]);
  if (!material) notFound();
  const position = p.positions.find((x) => x.material.id === id);
  const appNames = new Map(p.applications.map((a) => [a.id, a.name]));
  const inScope = screens.find((s) => s.material.id === id)?.inScope ?? [];
  const fingerprint = fnv1a(stableStringify(material));
  const org = orgs.find((o) => o.id === material.organisationId);

  const open = inScope
    .filter((r) => r.state !== "ineligible")
    .flatMap((r) => r.bridge.filter((b) => b.blocking).map((b) => ({ ...b, applicationId: r.applicationId })));
  const byReviewer = new Map<ReviewerType | "none", typeof open>();
  for (const a of open) byReviewer.set(a.reviewer ?? "none", [...(byReviewer.get(a.reviewer ?? "none") ?? []), a]);

  return (
    <article className="mx-auto max-w-[920px] bg-panel p-5 shadow-[0_1px_0_var(--rule)] md:p-10 print:bg-white print:p-0 print:shadow-none">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/materials/${material.id}`} className="text-sm text-ink-3 hover:text-copper">Back to the material profile</Link>
        <PrintButton />
      </div>

      <header className="border-b-4 border-ink pb-5">
        <div className="text-sm text-ink-3">Material evidence passport</div>
        <h1 className="display mt-1 text-3xl md:text-4xl">{material.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="font-mono">{material.code}</span>
          <OriginBadge origin={material.dataOrigin} />
          <span className="text-ink-2">{org?.name ?? material.organisationId}</span>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-1 font-mono text-xs text-ink-3 sm:grid-cols-2">
          <div>Record fingerprint {fingerprint}</div>
          <div>Screened with {ENGINE_VERSION}, {SCORING_MODEL_VERSION}</div>
          <div>Record last updated {fmtDateTime(material.updatedAt)}</div>
          <div>Passport generated {fmtDateTime(new Date().toISOString())}</div>
        </dl>
      </header>

      <Section title="Identity and context">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="Material family">{FAMILY_LABELS[material.family]}</Field>
          <Field label="Source process">{material.sourceProcess}</Field>
          <Field label="Location">{material.location.site}, {material.location.region}, {material.location.country}</Field>
          <Field label="Available volume">{fmtTonnes(material.volume.tonnesPerYear)} <span className="text-ink-3">({material.volume.reportingPeriod})</span></Field>
          <Field label="Hazard declaration">
            {HAZARD_TEXT[material.hazard.status]}
            <span className="text-ink-3">
              {material.hazard.basis ? `, ${material.hazard.basis}` : ""}, {VERIFICATION_LABELS[material.hazard.verification].toLowerCase()}
            </span>
          </Field>
          <Field label="Current handling">
            {material.currentHandling.pathway}
            <span className="text-ink-3">, {material.currentHandling.costInrPerTonne === null ? "cost not reported" : fmtInr(material.currentHandling.costInrPerTonne, "/t")}</span>
          </Field>
        </dl>
      </Section>

      <Section title={`Measurements (${material.measurements.length})`}>
        {material.measurements.length === 0 ? (
          <p className="text-sm text-ink-3">No measurements recorded.</p>
        ) : (
          <TableWrap label="Measurements">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className={th}>Property</th>
                <th className={`${th} text-right`}>Value</th>
                <th className={th}>Provenance</th>
                <th className={th}>Method</th>
              </tr>
            </thead>
            <tbody>
              {material.measurements.map((m) => (
                <tr key={m.property}>
                  <td className={td}>{PROPERTIES[m.property].label}</td>
                  <td className={`${td} text-right font-semibold whitespace-nowrap`}>{fmtNumber(m.value, 3)} {unitLabel(m.unit)}</td>
                  <td className={td}><ProvenanceTag provenance={m.provenance} verification={m.verification} /></td>
                  <td className={`${td} text-xs text-ink-2`}>{m.method ?? "Not stated"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
        )}
      </Section>

      <Section title={`Documents (${material.documents.length})`}>
        {material.documents.length === 0 ? (
          <p className="text-sm text-ink-3">No documents recorded.</p>
        ) : (
          <ul className="divide-y divide-rule text-sm">
            {material.documents.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  <span className="font-semibold">{DOC_LABELS[d.type]}</span>
                  <span className="text-ink-3">: {d.title}{d.issuedBy ? `, ${d.issuedBy}` : ""}{d.date ? `, ${d.date}` : ""}</span>
                </span>
                <span className={cx("text-xs font-semibold", d.status === "available_verified" ? "text-verdigris" : d.status === "requested" ? "text-ochre" : "text-ink-2")}>
                  {DOC_STATUS_LABELS[d.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Screening outcome, baseline assumptions">
        {inScope.length === 0 ? (
          <p className="text-sm text-ink-3">{position?.invalid ?? "No application in the registry covers this material family."}</p>
        ) : (
          <TableWrap label="Screening outcome">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr>
                <th className={th}>Application</th>
                <th className={th}>State</th>
                <th className={`${th} text-right`}>Score</th>
                <th className={`${th} text-right`}>Indicative value / yr</th>
              </tr>
            </thead>
            <tbody>
              {inScope.map((r) => (
                <tr key={r.applicationId} className="print-avoid-break">
                  <td className={td}>
                    {appNames.get(r.applicationId)}
                    <div className="text-xs text-ink-3">{r.headline}</div>
                  </td>
                  <td className={td}><StateBadge state={r.state} /></td>
                  <td className={`${td} text-right whitespace-nowrap`}>{r.score.total === null ? "No score" : `${r.score.total.toFixed(1)}${r.score.status === "provisional" ? " (prov.)" : ""}`}</td>
                  <td className={`${td} text-right`}>{fmtInrCompact(r.economics.annualNetInr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableWrap>
        )}
      </Section>

      <Section title="Open blocking actions, by who must act">
        {open.length === 0 ? (
          <p className="text-sm text-ink-3">None.</p>
        ) : (
          <div className="space-y-4">
            {[...byReviewer].map(([rev, actions]) => (
              <div key={rev} className="print-avoid-break">
                <h3 className="text-sm font-semibold">{rev === "none" ? "Unassigned" : REVIEWER_LABELS[rev]}</h3>
                <ul className="mt-1 space-y-1.5 text-sm">
                  {actions.map((a) => (
                    <li key={`${a.applicationId}-${a.id}`} className="border-l-2 border-oxide/50 pl-3">
                      <span className="font-semibold">{a.target}</span> <span className="text-ink-3">for {appNames.get(a.applicationId)}</span>
                      <div className="text-ink-2">{a.nextAction}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {position?.plan.bestSingle ? (
          <p className="mt-4 border-t border-rule pt-3 text-sm">
            <span className="font-semibold">Commission next:</span> {position.plan.bestSingle.label}
            {position.plan.bestSingle.unlocks.length
              ? `, which makes ${position.plan.bestSingle.unlocks.length} pathway${position.plan.bestSingle.unlocks.length > 1 ? "s" : ""} fully assessable.`
              : "."}
          </p>
        ) : null}
      </Section>

      <footer className="mt-8 border-t border-rule-strong pt-4 text-xs text-ink-3">
        This passport records what is known and what is missing. It is not a certificate, an approval or a statement that the material is safe for any use.
        Laboratory testing, qualified engineering review and regulatory confirmation remain necessary.
        {material.dataOrigin === "synthetic_demo" ? " Every value in this record is synthetic demonstration data." : ""} The fingerprint changes whenever any field of the
        record changes.
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="wide mb-2 border-b border-rule pb-1 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
