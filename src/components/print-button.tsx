"use client";

import { Printer } from "lucide-react";
import { buttonStyles } from "./ui";

export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonStyles.secondary} print:hidden`}>
      <Printer aria-hidden size={15} />
      {label}
    </button>
  );
}
