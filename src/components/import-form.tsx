"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/server/actions";
import { buttonStyles } from "./ui";

export function ImportForm({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, { ok: true });
  return (
    <form action={formAction} className="space-y-4">
      <label className="block text-sm">
        CSV file
        <input type="file" name="file" accept=".csv,text/csv" required className="mt-1 block w-full border border-rule-strong bg-panel px-2 py-1.5 text-sm" />
      </label>
      <button type="submit" className={buttonStyles.primary} disabled={pending} aria-busy={pending}>
        {pending ? "Validating…" : "Validate and import"}
      </button>
      {state.message ? (
        <div role={state.ok ? "status" : "alert"} className={state.ok ? "border border-verdigris/40 bg-verdigris-wash p-3 text-sm text-verdigris" : "border border-oxide/40 bg-oxide-wash p-3 text-sm text-oxide"}>
          <p className="font-semibold">{state.message}</p>
          {state.fieldErrors ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {Object.values(state.fieldErrors).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
          {state.ok ? (
            <Link href="/materials?sort=updated" className="mt-2 inline-block font-semibold underline">
              View the registry
            </Link>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
