"use client";

import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="border border-oxide/40 bg-oxide-wash p-6">
      <h1 className="wide text-xl font-bold text-oxide">This page could not be loaded</h1>
      <p className="mt-2 max-w-[70ch] text-sm text-ink">{error.message || "An unexpected error occurred."}</p>
      {error.digest ? <p className="mt-1 font-mono text-xs text-ink-3">Reference {error.digest}</p> : null}
      <div className="mt-4 flex gap-3">
        <button type="button" onClick={reset} className={buttonStyles.primary}>Try again</button>
        <Link href="/dashboard" className={buttonStyles.secondary}>Go to the dashboard</Link>
      </div>
    </div>
  );
}
