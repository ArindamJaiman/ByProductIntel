import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, PageHeader, buttonStyles } from "@/components/ui";
import type { EvidenceType } from "@/domain/types";
import { requireContext } from "@/server/context";

export const metadata = { title: "Evidence library" };

const TYPE_LABELS: Record<EvidenceType, string> = {
  standard_reference: "Standard (reference only)",
  regulation: "Regulation",
  government_guidance: "Government guidance",
  peer_reviewed: "Peer-reviewed",
  company_publication: "Company publication",
  project_report: "Project report",
  trade_press: "Trade press",
  secondary_summary: "Secondary summary",
};
const REVIEW_LABELS = {
  full_text_reviewed: "Full page or text reviewed",
  abstract_or_summary_reviewed: "Summary or abstract reviewed",
  secondary_only: "Read via a secondary source",
} as const;

/** Light stemming so "leaching" also matches "leachate"; short words are matched as typed. */
function stem(word: string): string {
  return word.length > 6 ? word.slice(0, Math.max(5, word.length - 3)) : word;
}

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function EvidencePage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader
        title="Evidence library"
        lede="Sources located and read during research, each tied to the specific claim it supports. Synthetic material profiles cite no sources, because none of their values are real. Standards are referenced, not reproduced."
      />
      <Suspense fallback={<p className="text-ink-3">Loading sources…</p>}>
        <EvidenceList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function EvidenceList({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = one(sp.q).trim().toLowerCase();
  const type = one(sp.type);
  const { repo } = await requireContext();
  const sources = await repo.listEvidence();
  const terms = q.split(/\s+/).filter(Boolean).map(stem);
  const shown = sources.filter((s) => {
    if (type && s.evidenceType !== type) return false;
    const hay = `${s.title} ${s.organisation} ${s.claim} ${s.relevantTo.join(" ")} ${s.caveat ?? ""}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const field = "border border-rule-strong bg-panel px-2 py-1.5 text-sm";
  return (
    <>
      <form method="get" role="search" className="mb-4 grid gap-3 border border-rule bg-panel p-3 sm:grid-cols-[2fr_1fr_auto]">
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Search title, organisation, material or claim
          <input name="q" defaultValue={one(sp.q)} className={field} placeholder="e.g. leaching, fly ash" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">
          Evidence type
          <select name="type" defaultValue={type} className={field}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className={buttonStyles.primary} type="submit">Search</button>
          <Link href="/evidence" className={buttonStyles.ghost}>Reset</Link>
        </div>
      </form>
      <p className="mb-3 text-sm text-ink-3" aria-live="polite">{shown.length} of {sources.length} sources</p>
      {shown.length === 0 ? (
        <EmptyState title="No sources match" />
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => (
            <li key={s.id} id={s.id} className="scroll-mt-24 border border-rule bg-panel p-4 target:border-copper target:bg-copper-wash">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-copper">
                  {s.title}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                <span className="border border-rule-strong px-1.5 py-0.5 text-xs">{TYPE_LABELS[s.evidenceType]}</span>
              </div>
              <div className="mt-0.5 text-sm text-ink-2">{s.organisation}</div>
              <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[9rem_1fr]">
                <dt className="text-ink-3">Supports</dt>
                <dd>{s.claim}</dd>
                <dt className="text-ink-3">Relevant to</dt>
                <dd>{s.relevantTo.join(", ")}</dd>
                <dt className="text-ink-3">Published</dt>
                <dd>{s.publicationDate ?? "Not stated on the source"}</dd>
                <dt className="text-ink-3">Accessed</dt>
                <dd>{s.accessDate}</dd>
                <dt className="text-ink-3">Review status</dt>
                <dd>{REVIEW_LABELS[s.reviewStatus]}</dd>
                {s.caveat ? (
                  <>
                    <dt className="text-ink-3">Caveat</dt>
                    <dd className="text-ochre">{s.caveat}</dd>
                  </>
                ) : null}
                <dt className="text-ink-3">Reference</dt>
                <dd className="break-all font-mono text-xs text-ink-3">{s.url}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
