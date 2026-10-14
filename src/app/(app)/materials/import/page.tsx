import Link from "next/link";
import { Suspense } from "react";
import { ImportForm } from "@/components/import-form";
import { PageHeader, Panel } from "@/components/ui";
import { CSV_FIXED_COLUMNS } from "@/domain/csv";
import { importMaterialsAction } from "@/server/actions";
import { requireContext } from "@/server/context";

export const metadata = { title: "Import materials" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        kicker={<Link href="/materials" className="hover:text-copper">Materials registry</Link>}
        title="Import material profiles from CSV"
        lede="Upload one row per material. The import is all-or-nothing: if any row fails validation, nothing is saved and every problem is listed."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel title="Upload">
          <Suspense fallback={<p className="text-ink-3">Loading…</p>}>
            <Gate />
          </Suspense>
        </Panel>
        <Panel title="Template rules">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>
              Required columns: <code className="font-mono text-xs">{CSV_FIXED_COLUMNS.join(", ")}</code>.
            </li>
            <li>
              Add measurement columns named <code className="font-mono text-xs">property:unit</code>, for example <code className="font-mono text-xs">loi:%</code> or{" "}
              <code className="font-mono text-xs">chromium_total:mg/kg</code>. Units must match the property&apos;s dimension.
            </li>
            <li>Leave a cell empty when a value was not measured. Empty cells are stored as unknown, never as zero.</li>
            <li>Imported values are recorded as user-supplied and unverified. A spreadsheet cannot assert laboratory or independent verification.</li>
            <li>
              <code className="font-mono text-xs">hazard_status</code>: declared_non_hazardous, declared_hazardous or not_declared.{" "}
              <code className="font-mono text-xs">handling_kind</code>: disposal_or_stockpile, existing_use or unknown.
            </li>
          </ul>
          <a href="/materials/import/template" download="material-import-template.csv" className="mt-4 inline-block text-sm font-semibold text-copper hover:underline">
            Download the CSV template
          </a>
        </Panel>
      </div>
    </>
  );
}

async function Gate() {
  await requireContext();
  return <ImportForm action={importMaterialsAction} />;
}
