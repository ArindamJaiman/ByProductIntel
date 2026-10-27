"use client";

import { useActionState, useEffect, useState } from "react";
import { DOC_LABELS } from "@/domain/engine/bridge";
import { PROPERTIES } from "@/domain/properties";
import { DOC_TYPES, FLAG_TEXT, suggestDocTypes, type ReviewedFinding } from "@/domain/report-reading";
import { unitLabel, type UnitId } from "@/domain/units";
import { unitsForProperty } from "@/domain/validation";
import type { FormState } from "@/server/actions";
import { readReportAction, saveReportValuesAction, type ReadState } from "@/server/report-actions";
import { SubmitButton } from "./submit-button";
import { TableWrap, buttonStyles, cx, td, th } from "./ui";

const field = "mt-1 block w-full border border-rule-strong bg-panel px-2 py-1.5 text-sm";

const SERVICE_NAMES = { Gemini: "Google's Gemini API", Mistral: "Mistral AI" } as const;

export function ReportReader({
  materialId,
  sampleHref,
  providers,
}: {
  materialId: string;
  sampleHref: string | null;
  providers: (keyof typeof SERVICE_NAMES)[];
}) {
  const services = providers.map((p) => SERVICE_NAMES[p]);
  const [state, readAction, reading] = useActionState(readReportAction, { ok: true } as ReadState);
  const [preview, setPreview] = useState<{ url: string; type: string; name: string } | null>(null);

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview.url) : undefined), [preview]);

  return (
    <div className="space-y-6">
      <form action={readAction} className="border border-rule bg-panel p-4">
        <input type="hidden" name="materialId" value={materialId} />
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="min-w-0 flex-1 text-sm">
            Laboratory report (PDF, PNG, JPEG or WebP, up to 4 MB)
            <input
              type="file"
              name="report"
              required
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className={field}
              onChange={(e) => {
                const f = e.target.files?.[0];
                setPreview(f ? { url: URL.createObjectURL(f), type: f.type, name: f.name } : null);
              }}
            />
          </label>
          <button type="submit" className={buttonStyles.primary} disabled={reading} aria-busy={reading}>
            {reading ? "Reading the report…" : "Read the report"}
          </button>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          The file is sent to {services[0]} to transcribe the printed results
          {services[1] ? `, or to ${services[1]} if that is unavailable` : ""}, and is not stored by this app. On free tiers, uploads may be used to improve
          the provider&apos;s models, so do not upload confidential reports here.
          {sampleHref ? (
            <>
              {" "}
              No report to hand?{" "}
              <a href={sampleHref} download className="font-semibold text-copper hover:underline">
                Download a synthetic sample report
              </a>
              .
            </>
          ) : null}
        </p>
        {reading ? <p className="mt-3 text-sm text-ink-2" role="status">Reading usually takes 10 to 40 seconds.</p> : null}
        {!state.ok && state.message ? (
          <p role="alert" className="mt-3 border border-oxide/40 bg-oxide-wash px-3 py-2 text-sm text-oxide">{state.message}</p>
        ) : null}
      </form>

      {state.result ? <Review key={state.result.readAt} materialId={materialId} result={state.result} preview={preview} /> : null}
    </div>
  );
}

interface Row {
  checked: boolean;
  value: string;
  unit: UnitId | "";
}

function Review({
  materialId,
  result,
  preview,
}: {
  materialId: string;
  result: NonNullable<ReadState["result"]>;
  preview: { url: string; type: string; name: string } | null;
}) {
  const [saveState, saveAction] = useActionState(saveReportValuesAction, { ok: true } as FormState);
  const { reading, reviewed } = result;
  const [rows, setRows] = useState<Row[]>(() => reviewed.map((r) => ({ checked: r.suggested, value: r.raw.value === null ? "" : String(r.raw.value), unit: r.unit ?? "" })));
  const [doc, setDoc] = useState(() => {
    const types = suggestDocTypes(reading, reviewed.filter((r) => r.suggested && r.property).map((r) => r.property!));
    return { record: types.length > 0, types, laboratory: reading.laboratory ?? "", date: reading.reportDate ?? "", reference: reading.reportReference ?? "" };
  });
  const [confirmed, setConfirmed] = useState(false);

  const chosen = reviewed.filter((r, i) => r.selectable && rows[i].checked);
  const payload = JSON.stringify({
    materialId,
    fileName: result.fileName,
    confirmed,
    values: chosen.map((r) => ({
      property: r.property,
      value: Number(rows[r.index].value),
      unit: rows[r.index].unit,
      method: r.raw.method,
      page: r.raw.page,
    })),
    document: doc.record
      ? { types: doc.types, laboratory: doc.laboratory.trim() || null, date: doc.date.trim() || null, reference: doc.reference.trim() || null }
      : null,
  });
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section aria-labelledby="review-title" className="border border-rule-strong bg-panel">
      <div className="border-b border-rule px-4 py-3">
        <h2 id="review-title" className="wide text-lg font-bold">Check what was read</h2>
        <p className="text-sm text-ink-2">
          {reviewed.length} result{reviewed.length === 1 ? "" : "s"} transcribed from {result.fileName}
          {reading.laboratory ? `, issued by ${reading.laboratory}` : ""}
          {reading.reportDate ? ` on ${reading.reportDate}` : ""}. Read by {result.provider} ({result.model}). Tick only values you have checked against the report.
        </p>
        {reading.remarks ? <p className="mt-1 text-sm text-ochre">Note from the report: {reading.remarks}</p> : null}
      </div>

      <div className={cx("grid gap-6 p-4", preview ? "xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]" : "")}>
        {preview ? (
          <div className="min-w-0">
            <div className="mb-1 text-xs text-ink-3">Your file, for comparison</div>
            {preview.type === "application/pdf" ? (
              <iframe src={preview.url} title={`Uploaded report ${preview.name}`} className="h-[70vh] w-full border border-rule-strong bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an optimisable asset
              <img src={preview.url} alt={`Uploaded report ${preview.name}`} className="max-h-[70vh] w-full border border-rule-strong object-contain" />
            )}
          </div>
        ) : null}

        <div className="min-w-0 space-y-5">
          {reviewed.length === 0 ? (
            <p className="hatch border border-dashed border-ink-3 p-0.5 text-sm">
              <span className="block bg-panel p-3">No measured results were found in this file.</span>
            </p>
          ) : (
            <TableWrap label="Transcribed results">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr>
                    <th className={`${th} w-8`}><span className="sr-only">Save</span></th>
                    <th className={th}>Result in the report</th>
                    <th className={`${th} w-28`}>Value</th>
                    <th className={`${th} w-28`}>Unit</th>
                    <th className={th}>Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewed.map((r: ReviewedFinding, i) => (
                    <tr key={r.index} className={r.selectable ? undefined : "bg-panel-sunk"}>
                      <td className={td}>
                        <input
                          type="checkbox"
                          aria-label={`Save ${r.raw.printedName}`}
                          checked={r.selectable && rows[i].checked}
                          disabled={!r.selectable}
                          onChange={(e) => set(i, { checked: e.target.checked })}
                        />
                      </td>
                      <td className={td}>
                        <div className="font-semibold">{r.property ? PROPERTIES[r.property].label : r.raw.printedName}</div>
                        <div className="text-xs text-ink-3">
                          Printed: &ldquo;{r.raw.quote}&rdquo;{r.raw.page ? `, page ${r.raw.page}` : ""}
                        </div>
                        {r.raw.method ? <div className="text-xs text-ink-3">Method: {r.raw.method}</div> : null}
                      </td>
                      <td className={td}>
                        {r.selectable ? (
                          <input
                            aria-label={`Value for ${r.raw.printedName}`}
                            inputMode="decimal"
                            value={rows[i].value}
                            onChange={(e) => set(i, { value: e.target.value })}
                            className="w-full border border-rule-strong bg-panel px-1.5 py-1 text-right"
                          />
                        ) : (
                          <span className="text-ink-2">{r.raw.printedValue}</span>
                        )}
                      </td>
                      <td className={td}>
                        {r.selectable && r.property ? (
                          <select
                            aria-label={`Unit for ${r.raw.printedName}`}
                            value={rows[i].unit}
                            onChange={(e) => set(i, { unit: e.target.value as UnitId })}
                            className="w-full border border-rule-strong bg-panel px-1 py-1"
                          >
                            {unitsForProperty(r.property).map((u) => (
                              <option key={u} value={u}>{unitLabel(u)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-ink-2">{r.raw.printedUnit || "none"}</span>
                        )}
                      </td>
                      <td className={`${td} text-xs`}>
                        {r.flags.length === 0 ? <span className="text-verdigris">Passes the automatic checks</span> : null}
                        <ul className="space-y-0.5">
                          {r.flags.map((f) => (
                            <li key={f} className={f === "differs_from_record" || f === "reported_twice" ? "text-ochre" : "text-oxide"}>
                              {FLAG_TEXT[f]}
                              {f === "differs_from_record" && r.existing ? ` Now: ${r.existing.value} ${unitLabel(r.existing.unit)}.` : ""}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}

          <fieldset className="border border-rule p-3">
            <legend className="px-1 text-sm font-semibold">The report itself</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={doc.record} onChange={(e) => setDoc({ ...doc, record: e.target.checked })} />
              Record this report on the profile as unverified evidence
            </label>
            {doc.record ? (
              <>
                <fieldset className="mt-3">
                  <legend className="text-sm">Evidence this report provides (a combined report can provide several)</legend>
                  <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    {DOC_TYPES.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={doc.types.includes(t)}
                          onChange={(e) =>
                            setDoc({ ...doc, types: e.target.checked ? DOC_TYPES.filter((x) => x === t || doc.types.includes(x)) : doc.types.filter((x) => x !== t) })
                          }
                        />
                        {DOC_LABELS[t]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="text-sm">
                    Laboratory
                    <input value={doc.laboratory} onChange={(e) => setDoc({ ...doc, laboratory: e.target.value })} maxLength={200} className={field} />
                  </label>
                  <label className="text-sm">
                    Report date
                    <input value={doc.date} onChange={(e) => setDoc({ ...doc, date: e.target.value })} maxLength={40} className={field} />
                  </label>
                  <label className="text-sm">
                    Report number
                    <input value={doc.reference} onChange={(e) => setDoc({ ...doc, reference: e.target.value })} maxLength={120} className={field} />
                  </label>
                </div>
              </>
            ) : null}
          </fieldset>

          <form action={saveAction} className="space-y-3">
            <input type="hidden" name="payload" value={payload} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>
                I have checked each ticked value, its unit and its page against the report. Values are saved as user-supplied and laboratory-reported,
                with a note that they were transcribed with AI assistance.
              </span>
            </label>
            {confirmed && chosen.length > 0 ? (
              <SubmitButton pendingLabel="Saving values…">
                Save {chosen.length} value{chosen.length === 1 ? "" : "s"} to the profile
              </SubmitButton>
            ) : (
              <button type="button" disabled className={buttonStyles.primary}>
                {chosen.length === 0 ? "Tick at least one value to save" : `Save ${chosen.length} value${chosen.length === 1 ? "" : "s"} to the profile`}
              </button>
            )}
            {!saveState.ok && saveState.message ? (
              <p role="alert" className="border border-oxide/40 bg-oxide-wash px-3 py-2 text-sm text-oxide">{saveState.message}</p>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}
