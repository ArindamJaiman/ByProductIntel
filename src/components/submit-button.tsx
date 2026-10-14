"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { buttonStyles } from "./ui";

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: keyof typeof buttonStyles;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={buttonStyles[variant]}>
      {pending ? pendingLabel : children}
    </button>
  );
}
