import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportReader } from "@/components/report-reader";
import { EmptyState, PageHeader } from "@/components/ui";
import { canEditMaterial, requireContext } from "@/server/context";
import { readerConfigured, readerProviders } from "@/server/reading";

export const metadata = { title: "Read a lab report" };

// Reading a multi-page report can take tens of seconds.
export const maxDuration = 60;

/** Synthetic sample reports, keyed by the demo material they describe. */
const SAMPLES: Record<string, string> = {
  "mat-mill-scale": "/samples/synthetic-oil-grease-report-msc-001.pdf",
};

export default function ReadReportPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Loading…</p>}>
      <ReadReportContent params={params} />
    </Suspense>
  );
}

async function ReadReportContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const material = await ctx.repo.getMaterial(id);
  if (!material) notFound();
  const editable = canEditMaterial(ctx, material);

  return (
    <>
      <PageHeader
        kicker={<Link href={`/materials/${material.id}`} className="hover:text-copper">{material.name}</Link>}
        title="Read a lab report"
        lede="Upload a laboratory report and its printed results are transcribed into a draft. You check each value against the report before anything is saved; the engine never uses a value nobody confirmed."
      />
      {!editable ? (
        <EmptyState title="This material is read-only for your organisation">
          It is shared by another organisation, so only they can change it.{" "}
          <Link href="/materials/new" className="text-copper underline">Add your own material</Link> to edit values or read lab reports into it.
        </EmptyState>
      ) : readerConfigured() ? (
        <div className="space-y-4">
          <details className="border border-rule bg-panel-sunk px-4 py-2.5 text-sm text-ink-2">
            <summary className="cursor-pointer font-semibold text-ink">What the reader may and may not do</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>It copies printed results only. It never converts units, averages or guesses a missing value.</li>
              <li>Each value must appear in the quoted line of the report, or it cannot be ticked. When the backup reader supplies the document&apos;s text, the name and value must appear there too.</li>
              <li>Results printed as limits, such as &ldquo;&lt;0.05&rdquo;, are shown but not saved automatically.</li>
              <li>Units are matched by the app, not by the model, so composition and test percentages stay distinct.</li>
              <li>Saved values are marked user-supplied and laboratory-reported, never independently verified.</li>
            </ul>
          </details>
          <ReportReader materialId={material.id} sampleHref={SAMPLES[material.id] ?? null} providers={readerProviders()} />
        </div>
      ) : (
        <EmptyState title="The lab report reader is not configured on this server">
          It needs a Google Gemini key (<code>GEMINI_API_KEY</code>) or a Mistral key (<code>MISTRAL_API_KEY</code>) in the server environment. Values can still be
          entered by hand on the{" "}
          <Link href={`/materials/${material.id}/edit`} className="text-copper underline">edit page</Link>.
        </EmptyState>
      )}
    </>
  );
}
