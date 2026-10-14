import Link from "next/link";

/** Wordmark: a small span glyph (two abutments and a deck with one gap) plus the name. */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="ByProduct Intelligence home">
      <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden>
        <rect x="0" y="4" width="4" height="14" fill="var(--ink)" />
        <rect x="26" y="4" width="4" height="14" fill="var(--ink)" />
        <rect x="5" y="4" width="6" height="4" fill="var(--verdigris)" />
        <rect x="12.5" y="4" width="5" height="4" fill="none" stroke="var(--copper)" strokeDasharray="1.5 1" />
        <rect x="19" y="4" width="6" height="4" fill="var(--verdigris)" />
      </svg>
      <span className="wide text-[0.98rem] font-bold leading-none tracking-tight">
        ByProduct<span className="font-medium text-ink-2"> Intelligence</span>
      </span>
    </Link>
  );
}
