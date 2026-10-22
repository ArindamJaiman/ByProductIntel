import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReportReader } from "@/components/report-reader";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireContext } from "@/server/context";
import { geminiConfigured } from "@/server/gemini";

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
  const { repo } = await requireContext();
  const material = await repo.getMaterial(id);
  if (!material) notFound();

  return (
    <>
      <PageHeader
        kicker={<Link href={`/materials/${material.id}`} className="hover:text-copper">{material.name}</Link>}
        title="Read a lab report"
        lede="Upload a laboratory report and its printed results are transcribed into a draft. You check each value against the report before anything is saved; the engine never uses a value nobody confirmed."
      />
      {geminiConfigured() ? (
        <div className="space-y-4">
          <details className="border border-rule bg-panel-sunk px-4 py-2.5 text-sm text-ink-2">
            <summary className="cursor-pointer font-semibold text-ink">What the reader may and may not do</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>It copies printed results only. It never converts units, averages or guesses a missing value.</li>
              <li>Each value must appear in the quoted line of the report, or it cannot be ticked.</li>
              <li>Results printed as limits, such as &ldquo;&lt;0.05&rdquo;, are shown but not saved automatically.</li>
              <li>Units are matched by the app, not by the model, so composition and test percentages stay distinct.</li>
              <li>Saved values are marked user-supplied and laboratory-reported, never independently verified.</li>
            </ul>
          </details>
          <ReportReader materialId={material.id} sampleHref={SAMPLES[material.id] ?? null} />
        </div>
      ) : (
        <EmptyState title="The lab report reader is not configured on this server">
          It needs a Google Gemini API key in the server environment variable <code>GEMINI_API_KEY</code>. Values can still be entered by hand on the{" "}
          <Link href={`/materials/${material.id}/edit`} className="text-copper underline">edit page</Link>.
        </EmptyState>
      )}
    </>
  );
}
