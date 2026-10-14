import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, EmptyState, OriginBadge, PageHeader, Panel, ProvenanceTag, TableWrap, Term, td, th } from "@/components/ui";
import { DOC_LABELS } from "@/domain/engine/bridge";
import { DOC_STATUS_LABELS, FAMILY_LABELS, PROVENANCE_LABELS, VERIFICATION_LABELS } from "@/domain/labels";
import { PROPERTIES, type PropertyGroup } from "@/domain/properties";
import { unitLabel } from "@/domain/units";
import { fmtDateTime, fmtInr, fmtNumber, fmtTonnes } from "@/lib/format";
import { runMatchAction } from "@/server/actions";
import { baselineScreen } from "@/server/analysis";
import { requireContext } from "@/server/context";

export const metadata = { title: "Material profile" };

const GROUP_TITLES: Record<PropertyGroup, string> = {
  composition: "Composition",
  physical: "Physical properties",
  stability: "Volume stability",
  performance: "Performance tests",
  contamination: "Contaminants",
};

const HAZARD_TEXT = {
  declared_non_hazardous: "Declared non-hazardous",
  declared_hazardous: "Declared hazardous",
  not_declared: "Not declared",
} as const;

export default function MaterialPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Loading material…</p>}>
      <MaterialContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MaterialContent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { repo } = await requireContext();
  const [material, { screens, applications }, runs] = await Promise.all([repo.getMaterial(id), baselineScreen(repo), repo.listRuns({ materialId: id, limit: 5 })]);
  if (!material) notFound();
  const screen = screens.find((s) => s.material.id === id);
  const appById = new Map(applications.map((a) => [a.id, a]));

  // Missing information = unknown requirements and documents across in-scope applications.
  const missing = new Map<string, { label: string; kind: "Measurement" | "Document" | "Declaration"; apps: string[]; safety: boolean }>();
  for (const r of (screen?.inScope ?? []).filter((x) => x.state !== "ineligible")) {
    for (const c of r.checks) {
      if (c.status !== "unknown" || !["specification", "evidence", "hazard", "volume"].includes(c.stage) || (!c.property && !c.docType && c.stage === "specification")) continue;
      const key = c.property ?? c.docType ?? c.id;
      const entry = missing.get(key) ?? {
        label: c.label,
        kind: c.property ? ("Measurement" as const) : c.docType ? ("Document" as const) : ("Declaration" as const),
        apps: [],
        safety: false,
      };
      entry.apps.push(appById.get(r.applicationId)?.name ?? r.applicationId);
      entry.safety ||= c.safetyCritical;
      missing.set(key, entry);
    }
  }
  const missingList = [...missing.values()].sort((a, b) => Number(b.safety) - Number(a.safety) || b.apps.length - a.apps.length);

  const groups = (Object.keys(GROUP_TITLES) as PropertyGroup[])
    .map((g) => ({ group: g, rows: material.measurements.filter((m) => PROPERTIES[m.property].group === g) }))
    .filter((g) => g.rows.length);

  return (
    <>
      {sp.saved ? (
        <p role="status" className="mb-4 border border-verdigris/40 bg-verdigris-wash px-4 py-2 text-sm text-verdigris">Material profile saved.</p>
      ) : null}
      <PageHeader
        kicker={<Link href="/materials" className="hover:text-copper">Materials registry</Link>}
        title={material.name}
        lede={material.description || undefined}
        actions={
          <>
            <ButtonLink href={`/materials/${material.id}/edit`}>Edit profile</ButtonLink>
            <ButtonLink href={`/scenarios?material=${material.id}`}>Explore scenarios</ButtonLink>
            <form action={runMatchAction}>
              <input type="hidden" name="materialId" value={material.id} />
              <SubmitButton pendingLabel="Running engine…">Run match analysis</SubmitButton>
            </form>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Identity and production context">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Code"><span className="font-mono">{material.code}</span></Field>
              <Field label="Data status"><OriginBadge origin={material.dataOrigin} /></Field>
              <Field label="Material family">{FAMILY_LABELS[material.family]}</Field>
              <Field label="Source process">{material.sourceProcess}</Field>
              <Field label="Location">
                {material.location.site}, {material.location.region}, {material.location.country}
                <div className="text-xs text-ink-3">{material.location.lat.toFixed(2)}°, {material.location.lon.toFixed(2)}°</div>
              </Field>
              <Field label="Available volume">
                {fmtTonnes(material.volume.tonnesPerYear)}
                <div className="text-xs text-ink-3">{material.volume.reportingPeriod}; {PROVENANCE_LABELS[material.volume.provenance].toLowerCase()}</div>
              </Field>
              <Field label="Hazard declaration">
                <span className={material.hazard.status === "not_declared" ? "font-semibold text-ochre" : ""}>{HAZARD_TEXT[material.hazard.status]}</span>
                <div className="text-xs text-ink-3">
                  {material.hazard.basis ? `${material.hazard.basis}; ` : ""}
                  {VERIFICATION_LABELS[material.hazard.verification].toLowerCase()}
                </div>
              </Field>
              <Field label="Current handling">
                {material.currentHandling.pathway}
                <div className="text-xs text-ink-3">
                  Cost {material.currentHandling.costInrPerTonne === null ? "not reported" : fmtInr(material.currentHandling.costInrPerTonne, "/t")}
                </div>
              </Field>
              <Field label="Last updated">{fmtDateTime(material.updatedAt)}</Field>
            </dl>
          </Panel>

          {groups.length === 0 ? (
            <EmptyState title="No measurements recorded">Add composition and property data so the engine can compare this material with application requirements.</EmptyState>
          ) : (
            groups.map(({ group, rows }) => (
              <Panel key={group} title={GROUP_TITLES[group]} aside={`${rows.length} reported`}>
                <TableWrap label={GROUP_TITLES[group]}>
                  <table className="w-full min-w-[620px] text-sm">
                    <thead>
                      <tr>
                        <th className={th}>Property</th>
                        <th className={`${th} text-right`}>Value</th>
                        <th className={th}>Unit</th>
                        <th className={th}>Provenance and verification</th>
                        <th className={th}>Method / document</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m) => {
                        const def = PROPERTIES[m.property];
                        const doc = material.documents.find((d) => d.id === m.documentId);
                        return (
                          <tr key={m.property}>
                            <td className={td}><Term help={def.help}>{def.label}</Term></td>
                            <td className={`${td} text-right font-semibold`}>{fmtNumber(m.value, 3)}</td>
                            <td className={`${td} text-ink-2`}>{unitLabel(m.unit)}</td>
                            <td className={td}><ProvenanceTag provenance={m.provenance} verification={m.verification} /></td>
                            <td className={`${td} text-xs text-ink-2`}>
                              {m.method ?? "Method not stated"}
                              {doc ? <div className="text-ink-3">{doc.title}</div> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              </Panel>
            ))
          )}

          <Panel title="Certificates and laboratory reports">
            {material.documents.length === 0 ? (
              <p className="text-sm text-ink-3">No documents recorded.</p>
            ) : (
              <ul className="divide-y divide-rule text-sm">
                {material.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div>
                      <div className="font-semibold">{d.title}</div>
                      <div className="text-xs text-ink-3">
                        {DOC_LABELS[d.type]}
                        {d.issuedBy ? `, ${d.issuedBy}` : ""}
                        {d.date ? `, ${d.date}` : ""}
                      </div>
                      {d.note ? <div className="text-xs text-ink-2">{d.note}</div> : null}
                    </div>
                    <span
                      className={`border px-1.5 py-0.5 text-xs font-semibold ${d.status === "requested" ? "hatch border-ink-3" : d.status === "available_verified" ? "border-verdigris/50 text-verdigris" : "border-rule-strong text-ink-2"}`}
                    >
                      <span className={d.status === "requested" ? "bg-panel px-1" : ""}>{DOC_STATUS_LABELS[d.status]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Missing information" aside={`${missingList.length} item(s)`}>
            {screen?.invalid ? (
              <p className="text-sm text-oxide">{screen.invalid}</p>
            ) : missingList.length === 0 ? (
              <p className="text-sm text-ink-2">No unknown items for the applications in scope.</p>
            ) : (
              <>
                <p className="mb-3 text-xs text-ink-3">Required by at least one in-scope pathway that is not already ruled out, under baseline assumptions.</p>
                <ul className="space-y-3 text-sm">
                  {missingList.map((m) => (
                    <li key={m.label} className="hatch border border-dashed border-ink-3 p-0.5">
                      <div className="bg-panel px-2.5 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold">{m.label}</span>
                          <span className="shrink-0 text-xs text-ink-3">{m.kind}</span>
                        </div>
                        {m.safety ? <div className="text-xs font-semibold text-oxide">Safety-critical</div> : null}
                        <div className="mt-0.5 text-xs text-ink-2">Needed for: {m.apps.join("; ")}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
          <Panel title="Matching runs">
            {runs.length === 0 ? (
              <p className="text-sm text-ink-3">No saved runs for this material yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {runs.map((r) => (
                  <li key={r.id}>
                    <Link href={`/match/runs/${r.id}`} className="font-semibold hover:text-copper">{r.label}</Link>
                    <div className="text-xs text-ink-3">{fmtDateTime(r.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </>
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
