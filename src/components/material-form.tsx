"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DOC_LABELS } from "@/domain/engine/bridge";
import { DOC_STATUS_LABELS, FAMILY_LABELS, PROVENANCE_LABELS, VERIFICATION_LABELS } from "@/domain/labels";
import { PROPERTIES, PROPERTY_KEYS, type PropertyKey } from "@/domain/properties";
import type { EvidenceDocType, Material, MaterialFamily, Provenance, VerificationState } from "@/domain/types";
import { unitLabel, type UnitId } from "@/domain/units";
import { materialInputSchema, unitsForProperty, validateMaterial, type MaterialInput } from "@/domain/validation";
import type { FormState } from "@/server/actions";
import { buttonStyles, cx } from "./ui";

interface MeasurementRow {
  key: string;
  property: PropertyKey;
  value: string;
  unit: UnitId;
  provenance: Provenance;
  verification: VerificationState;
  method: string;
  documentId: string;
}
interface DocRow {
  key: string;
  id: string;
  type: EvidenceDocType;
  title: string;
  status: "available_unverified" | "available_verified" | "requested";
  issuedBy: string;
  date: string;
  provenance: Provenance;
  note: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const toNum = (s: string) => (s.trim() === "" ? null : Number(s));

function initialState(m: Material | null) {
  return {
    name: m?.name ?? "",
    family: (m?.family ?? "steel_slag_bof") as MaterialFamily,
    sourceProcess: m?.sourceProcess ?? "",
    description: m?.description ?? "",
    site: m?.location.site ?? "",
    region: m?.location.region ?? "",
    country: m?.location.country ?? "India",
    lat: m ? String(m.location.lat) : "",
    lon: m ? String(m.location.lon) : "",
    tonnes: m?.volume.tonnesPerYear == null ? "" : String(m.volume.tonnesPerYear),
    reportingPeriod: m?.volume.reportingPeriod ?? "",
    volumeProvenance: m?.volume.provenance ?? ("user_supplied" as Provenance),
    hazardStatus: m?.hazard.status ?? "not_declared",
    hazardBasis: m?.hazard.basis ?? "",
    hazardVerification: m?.hazard.verification ?? ("unverified" as VerificationState),
    handlingPathway: m?.currentHandling.pathway ?? "",
    handlingKind: m?.currentHandling.kind ?? "unknown",
    handlingCost: m?.currentHandling.costInrPerTonne == null ? "" : String(m.currentHandling.costInrPerTonne),
    handlingProvenance: m?.currentHandling.provenance ?? ("user_supplied" as Provenance),
    measurements: (m?.measurements ?? []).map(
      (x): MeasurementRow => ({
        key: uid(),
        property: x.property,
        value: String(x.value),
        unit: x.unit,
        provenance: x.provenance,
        verification: x.verification,
        method: x.method ?? "",
        documentId: x.documentId ?? "",
      }),
    ),
    documents: (m?.documents ?? []).map(
      (d): DocRow => ({
        key: uid(),
        id: d.id,
        type: d.type,
        title: d.title,
        status: d.status,
        issuedBy: d.issuedBy ?? "",
        date: d.date ?? "",
        provenance: d.provenance,
        note: d.note ?? "",
      }),
    ),
  };
}
type FormModel = ReturnType<typeof initialState>;

function toInput(f: FormModel): unknown {
  return {
    name: f.name,
    family: f.family,
    sourceProcess: f.sourceProcess,
    description: f.description,
    location: { site: f.site, region: f.region, country: f.country, lat: toNum(f.lat), lon: toNum(f.lon) },
    volume: { tonnesPerYear: toNum(f.tonnes), reportingPeriod: f.reportingPeriod, provenance: f.volumeProvenance },
    hazard: { status: f.hazardStatus, basis: f.hazardBasis || undefined, verification: f.hazardVerification },
    currentHandling: { pathway: f.handlingPathway, kind: f.handlingKind, costInrPerTonne: toNum(f.handlingCost), provenance: f.handlingProvenance },
    measurements: f.measurements.map((m) => ({
      property: m.property,
      value: m.value.trim() === "" ? Number.NaN : Number(m.value),
      unit: m.unit,
      provenance: m.provenance,
      verification: m.verification,
      method: m.method || undefined,
      documentId: m.documentId || undefined,
    })),
    documents: f.documents.map((d) => ({
      id: d.id,
      type: d.type,
      title: d.title,
      status: d.status,
      issuedBy: d.issuedBy || undefined,
      date: d.date || undefined,
      provenance: d.provenance,
      note: d.note || undefined,
    })),
  };
}

/** Client-side validation with the same schema and domain rules the server applies. */
function clientValidate(f: FormModel): Record<string, string> {
  const errors: Record<string, string> = {};
  f.measurements.forEach((m, i) => {
    if (m.value.trim() === "") errors[`measurements.${i}`] = "Enter a value or remove this row. Unknown values are left out, not entered as zero.";
    else if (!Number.isFinite(Number(m.value))) errors[`measurements.${i}`] = "Value must be a number.";
  });
  if (f.lat.trim() === "") errors["location.lat"] = "Latitude is required.";
  if (f.lon.trim() === "") errors["location.lon"] = "Longitude is required.";
  const parsed = materialInputSchema.safeParse(toInput(f));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= issue.message;
    return errors;
  }
  for (const issue of validateMaterial(parsed.data as MaterialInput).issues) {
    if (issue.severity === "error") errors[issue.path.replace(/\[(\d+)\]/g, ".$1")] ??= issue.message;
  }
  return errors;
}

const input = "w-full border border-rule-strong bg-panel px-2 py-1.5 text-sm";
const PROVENANCE_CHOICES: Provenance[] = ["user_supplied", "synthetic_demo", "calculated_estimate", "hypothesis"];

export function MaterialForm({ material, action }: { material: Material | null; action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [f, setF] = useState<FormModel>(() => initialState(material));
  const [touched, setTouched] = useState(false);
  const [serverState, formAction, pending] = useActionState(action, { ok: true });
  const clientErrors = useMemo(() => (touched ? clientValidate(f) : {}), [f, touched]);
  const errors = { ...(serverState.fieldErrors ?? {}), ...clientErrors };
  const set = <K extends keyof FormModel>(k: K, v: FormModel[K]) => setF((p) => ({ ...p, [k]: v }));
  const err = (path: string) =>
    errors[path] ? (
      <p className="mt-1 text-xs font-semibold text-oxide" id={`err-${path}`}>{errors[path]}</p>
    ) : null;
  const aria = (path: string) => (errors[path] ? { "aria-invalid": true, "aria-describedby": `err-${path}` } : {});

  const updateMeasurement = (i: number, patch: Partial<MeasurementRow>) =>
    setF((p) => ({ ...p, measurements: p.measurements.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  const updateDoc = (i: number, patch: Partial<DocRow>) =>
    setF((p) => ({ ...p, documents: p.documents.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  const usedProps = new Set(f.measurements.map((m) => m.property));

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={(e) => {
        setTouched(true);
        if (Object.keys(clientValidate(f)).length) e.preventDefault();
      }}
      className="space-y-6"
    >
      <input type="hidden" name="payload" value={JSON.stringify(toInput(f))} />
      <input type="hidden" name="materialId" value={material?.id ?? ""} />

      {serverState.message && !serverState.ok ? (
        <div role="alert" className="border border-oxide/40 bg-oxide-wash px-4 py-2 text-sm text-oxide">{serverState.message}</div>
      ) : null}
      {touched && Object.keys(clientErrors).length ? (
        <div role="alert" className="border border-oxide/40 bg-oxide-wash px-4 py-2 text-sm text-oxide">
          {Object.keys(clientErrors).length} field(s) need attention before saving.
        </div>
      ) : null}

      <fieldset className="border border-rule bg-panel p-4">
        <legend className="px-1 font-semibold">Identity</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            Material name
            <input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} {...aria("name")} />
            {err("name")}
          </label>
          <label className="text-sm">
            Material family
            <select className={input} value={f.family} onChange={(e) => set("family", e.target.value as MaterialFamily)}>
              {Object.entries(FAMILY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            Source process
            <input className={input} value={f.sourceProcess} onChange={(e) => set("sourceProcess", e.target.value)} placeholder="e.g. Basic oxygen furnace, slag air-cooled and weathered" {...aria("sourceProcess")} />
            {err("sourceProcess")}
          </label>
          <label className="text-sm md:col-span-2">
            Description
            <textarea className={input} rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </label>
        </div>
      </fieldset>

      <fieldset className="border border-rule bg-panel p-4">
        <legend className="px-1 font-semibold">Location and volume</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            Site
            <input className={input} value={f.site} onChange={(e) => set("site", e.target.value)} {...aria("location.site")} />
            {err("location.site")}
          </label>
          <label className="text-sm">
            Region
            <input className={input} value={f.region} onChange={(e) => set("region", e.target.value)} {...aria("location.region")} />
            {err("location.region")}
          </label>
          <label className="text-sm">
            Country
            <input className={input} value={f.country} onChange={(e) => set("country", e.target.value)} {...aria("location.country")} />
            {err("location.country")}
          </label>
          <label className="text-sm">
            Latitude (°)
            <input className={input} inputMode="decimal" value={f.lat} onChange={(e) => set("lat", e.target.value)} {...aria("location.lat")} />
            {err("location.lat")}
          </label>
          <label className="text-sm">
            Longitude (°)
            <input className={input} inputMode="decimal" value={f.lon} onChange={(e) => set("lon", e.target.value)} {...aria("location.lon")} />
            {err("location.lon")}
          </label>
          <span />
          <label className="text-sm">
            Available volume (t/yr)
            <input className={input} inputMode="decimal" value={f.tonnes} onChange={(e) => set("tonnes", e.target.value)} placeholder="Leave blank if not reported" {...aria("volume.tonnesPerYear")} />
            {err("volume.tonnesPerYear")}
          </label>
          <label className="text-sm">
            Reporting period
            <input className={input} value={f.reportingPeriod} onChange={(e) => set("reportingPeriod", e.target.value)} placeholder="e.g. FY 2025–26" {...aria("volume.reportingPeriod")} />
            {err("volume.reportingPeriod")}
          </label>
        </div>
      </fieldset>

      <fieldset className="border border-rule bg-panel p-4">
        <legend className="px-1 font-semibold">Hazard declaration and current handling</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            Hazard status
            <select className={input} value={f.hazardStatus} onChange={(e) => set("hazardStatus", e.target.value as FormModel["hazardStatus"])}>
              <option value="not_declared">Not declared</option>
              <option value="declared_non_hazardous">Declared non-hazardous</option>
              <option value="declared_hazardous">Declared hazardous</option>
            </select>
          </label>
          <label className="text-sm">
            Basis of declaration
            <input className={input} value={f.hazardBasis} onChange={(e) => set("hazardBasis", e.target.value)} />
          </label>
          <label className="text-sm">
            Verification
            <VerificationSelect value={f.hazardVerification} onChange={(v) => set("hazardVerification", v)} allowIndependent={material?.hazard.verification === "independently_verified"} />
            {err("hazard.verification")}
          </label>
          <label className="text-sm">
            Current handling pathway
            <input className={input} value={f.handlingPathway} onChange={(e) => set("handlingPathway", e.target.value)} {...aria("currentHandling.pathway")} />
            {err("currentHandling.pathway")}
          </label>
          <label className="text-sm">
            Pathway type
            <select className={input} value={f.handlingKind} onChange={(e) => set("handlingKind", e.target.value as FormModel["handlingKind"])}>
              <option value="disposal_or_stockpile">Disposal or stockpile</option>
              <option value="existing_use">Existing use</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <label className="text-sm">
            Current handling cost (₹/t)
            <input className={input} inputMode="decimal" value={f.handlingCost} onChange={(e) => set("handlingCost", e.target.value)} placeholder="Leave blank if unknown" {...aria("currentHandling.costInrPerTonne")} />
            {err("currentHandling.costInrPerTonne")}
          </label>
        </div>
      </fieldset>

      <fieldset className="border border-rule bg-panel p-4">
        <legend className="px-1 font-semibold">Documents</legend>
        <p className="mb-3 text-xs text-ink-3">Record reports and certificates you hold. Only an authorised reviewer can mark a document as independently verified.</p>
        <div className="space-y-3">
          {f.documents.map((d, i) => (
            <div key={d.key} className="grid gap-2 border border-rule p-3 md:grid-cols-[1.2fr_1.6fr_1fr_1fr_auto]">
              <label className="text-xs">
                Type
                <select className={input} value={d.type} onChange={(e) => updateDoc(i, { type: e.target.value as EvidenceDocType })}>
                  {Object.entries(DOC_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Title
                <input className={input} value={d.title} onChange={(e) => updateDoc(i, { title: e.target.value })} {...aria(`documents.${i}.title`)} />
              </label>
              <label className="text-xs">
                Status
                <select className={input} value={d.status} onChange={(e) => updateDoc(i, { status: e.target.value as DocRow["status"] })}>
                  <option value="available_unverified">{DOC_STATUS_LABELS.available_unverified}</option>
                  <option value="requested">{DOC_STATUS_LABELS.requested}</option>
                  {d.status === "available_verified" ? <option value="available_verified">{DOC_STATUS_LABELS.available_verified}</option> : null}
                </select>
              </label>
              <label className="text-xs">
                Issued by / date
                <input className={input} value={d.issuedBy} onChange={(e) => updateDoc(i, { issuedBy: e.target.value })} placeholder="Laboratory" />
              </label>
              <div className="flex items-end">
                <button type="button" className={buttonStyles.ghost} onClick={() => setF((p) => ({ ...p, documents: p.documents.filter((_, j) => j !== i), measurements: p.measurements.map((m) => (m.documentId === d.id ? { ...m, documentId: "" } : m)) }))}>
                  <Trash2 size={15} aria-hidden /> <span className="sr-only">Remove document {d.title}</span>
                </button>
              </div>
              {err(`documents.${i}.title`) ?? err(`documents.${i}`)}
            </div>
          ))}
        </div>
        <button
          type="button"
          className={cx(buttonStyles.secondary, "mt-3")}
          onClick={() =>
            setF((p) => ({
              ...p,
              documents: [...p.documents, { key: uid(), id: `doc-${uid()}`, type: "chemical_composition_report", title: "", status: "available_unverified", issuedBy: "", date: "", provenance: "user_supplied", note: "" }],
            }))
          }
        >
          <Plus size={15} aria-hidden /> Add document
        </button>
      </fieldset>

      <fieldset className="border border-rule bg-panel p-4">
        <legend className="px-1 font-semibold">Measurements</legend>
        <p className="mb-3 text-xs text-ink-3">
          Add only measured values, each with its unit. Properties you leave out are treated as unknown by the engine; they are never assumed to pass.
        </p>
        {err("measurements")}
        <div className="space-y-3">
          {f.measurements.map((m, i) => {
            const units = unitsForProperty(m.property);
            return (
              <div key={m.key} className="grid gap-2 border border-rule p-3 md:grid-cols-[1.6fr_0.8fr_0.7fr_1fr_1fr_1fr_auto]">
                <label className="text-xs">
                  Property
                  <select
                    className={input}
                    value={m.property}
                    onChange={(e) => {
                      const property = e.target.value as PropertyKey;
                      updateMeasurement(i, { property, unit: PROPERTIES[property].canonicalUnit });
                    }}
                  >
                    {PROPERTY_KEYS.filter((k) => k === m.property || !usedProps.has(k)).map((k) => (
                      <option key={k} value={k}>{PROPERTIES[k].label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Value
                  <input className={input} inputMode="decimal" value={m.value} onChange={(e) => updateMeasurement(i, { value: e.target.value })} {...aria(`measurements.${i}`)} />
                </label>
                <label className="text-xs">
                  Unit
                  <select className={input} value={m.unit} onChange={(e) => updateMeasurement(i, { unit: e.target.value as UnitId })}>
                    {units.map((u) => (
                      <option key={u} value={u}>{unitLabel(u)}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Provenance
                  <select className={input} value={m.provenance} onChange={(e) => updateMeasurement(i, { provenance: e.target.value as Provenance })}>
                    {[...new Set([m.provenance, ...PROVENANCE_CHOICES])].map((p) => (
                      <option key={p} value={p}>{PROVENANCE_LABELS[p]}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  Verification
                  <VerificationSelect
                    value={m.verification}
                    onChange={(v) => updateMeasurement(i, { verification: v })}
                    allowIndependent={material?.measurements.some((x) => x.property === m.property && x.verification === "independently_verified") ?? false}
                  />
                </label>
                <label className="text-xs">
                  Supporting document
                  <select className={input} value={m.documentId} onChange={(e) => updateMeasurement(i, { documentId: e.target.value })}>
                    <option value="">None</option>
                    {f.documents.map((d) => (
                      <option key={d.key} value={d.id}>{d.title || DOC_LABELS[d.type]}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <button type="button" className={buttonStyles.ghost} onClick={() => setF((p) => ({ ...p, measurements: p.measurements.filter((_, j) => j !== i) }))}>
                    <Trash2 size={15} aria-hidden /> <span className="sr-only">Remove {PROPERTIES[m.property].label}</span>
                  </button>
                </div>
                <label className="text-xs md:col-span-7">
                  Method (as reported)
                  <input className={input} value={m.method} onChange={(e) => updateMeasurement(i, { method: e.target.value })} placeholder="e.g. XRF, fused bead" />
                </label>
                {err(`measurements.${i}`)}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={cx(buttonStyles.secondary, "mt-3")}
          disabled={usedProps.size >= PROPERTY_KEYS.length}
          onClick={() => {
            const property = PROPERTY_KEYS.find((k) => !usedProps.has(k))!;
            setF((p) => ({
              ...p,
              measurements: [...p.measurements, { key: uid(), property, value: "", unit: PROPERTIES[property].canonicalUnit, provenance: "user_supplied", verification: "self_declared", method: "", documentId: "" }],
            }));
          }}
        >
          <Plus size={15} aria-hidden /> Add measurement
        </button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonStyles.primary} disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : material ? "Save changes" : "Create material"}
        </button>
        <span className="text-xs text-ink-3">The server validates every value again before saving.</span>
      </div>
    </form>
  );
}

function VerificationSelect({ value, onChange, allowIndependent }: { value: VerificationState; onChange: (v: VerificationState) => void; allowIndependent: boolean }) {
  const options: VerificationState[] = ["unverified", "self_declared", "lab_reported", ...(allowIndependent || value === "independently_verified" ? (["independently_verified"] as const) : [])];
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value as VerificationState)}>
      {options.map((v) => (
        <option key={v} value={v}>{VERIFICATION_LABELS[v]}</option>
      ))}
    </select>
  );
}
