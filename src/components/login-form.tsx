"use client";

import { useActionState } from "react";
import { signInAction, type LoginState } from "@/server/auth-actions";
import { buttonStyles } from "./ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signInAction, {});
  const field = "mt-1 block w-full border border-rule-strong bg-panel px-2 py-2 text-sm";
  return (
    <form action={action} className="mt-5 space-y-4">
      <label className="block text-sm">
        Email
        <input name="email" type="email" autoComplete="email" required className={field} />
      </label>
      <label className="block text-sm">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={field} />
      </label>
      {state.error ? <p role="alert" className="text-sm font-semibold text-oxide">{state.error}</p> : null}
      <button type="submit" disabled={pending} className={`${buttonStyles.primary} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
