import Link from "next/link";
import type { ReactNode } from "react";
import { Check, CircleHelp, X } from "lucide-react";
import type { CheckStatus, Confidence, MatchState, ScoreResult } from "@/domain/engine/result-types";
import {
  ORIGIN_LABELS,
  PROVENANCE_LABELS,
  RULE_BASIS_LABELS,
  SCORE_STATUS_LABELS,
  STATE_LABELS,
  VERIFICATION_LABELS,
} from "@/domain/labels";
import type { DataOrigin, Provenance, RuleBasis, VerificationState } from "@/domain/types";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  lede,
  actions,
  kicker,
}: {
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
  kicker?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-rule pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {kicker ? <div className="mb-1 text-sm text-ink-3">{kicker}</div> : null}
        <h1 className="wide text-2xl font-bold tracking-tight md:text-[1.9rem]">{title}</h1>
        {lede ? <p className="mt-2 max-w-[72ch] text-ink-2">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  children,
  className,
  aside,
  id,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  aside?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className={cx("border border-rule bg-panel", className)}>
      {title ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
          <h2 className="text-[0.95rem] font-semibold">{title}</h2>
          {aside ? <div className="text-sm text-ink-3">{aside}</div> : null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export const buttonStyles = {
  primary: cx(buttonBase, "bg-copper text-white hover:bg-copper-deep"),
  secondary: cx(buttonBase, "border border-rule-strong bg-panel text-ink hover:bg-panel-sunk"),
  ghost: cx(buttonBase, "text-ink-2 hover:bg-panel-sunk hover:text-ink"),
  quiet: "text-sm font-semibold text-copper underline-offset-2 hover:underline",
};

export function ButtonLink({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: keyof typeof buttonStyles }) {
  return (
    <Link href={href} className={buttonStyles[variant]}>
      {children}
    </Link>
  );
}

/* ---------------------------------------------------------------- states */

const STATE_STYLE: Record<MatchState, string> = {
  potentially_eligible: "bg-verdigris-wash text-verdigris border-verdigris/40",
  incomplete_evidence: "bg-ochre-wash text-ochre border-ochre/40",
  ineligible: "bg-oxide-wash text-oxide border-oxide/40",
};

export function StateBadge({ state, className }: { state: MatchState; className?: string }) {
  const Icon = state === "potentially_eligible" ? Check : state === "ineligible" ? X : CircleHelp;
  return (
    <span className={cx("inline-flex items-center gap-1 border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap", STATE_STYLE[state], className)}>
      <Icon aria-hidden size={13} strokeWidth={2.5} />
      {STATE_LABELS[state]}
    </span>
  );
}

export function CheckMark({ status }: { status: CheckStatus }) {
  if (status === "pass")
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center bg-verdigris text-white" title="Pass">
        <Check aria-hidden size={13} strokeWidth={3} />
        <span className="sr-only">Pass</span>
      </span>
    );
  if (status === "fail")
    return (
      <span className="inline-flex size-5 shrink-0 items-center justify-center bg-oxide text-white" title="Fail">
        <X aria-hidden size={13} strokeWidth={3} />
        <span className="sr-only">Fail</span>
      </span>
    );
  return (
    <span className="hatch inline-flex size-5 shrink-0 items-center justify-center border border-ink-3 text-ink" title="Unknown">
      <span aria-hidden className="bg-panel px-0.5 text-[10px] font-bold leading-none">?</span>
      <span className="sr-only">Unknown</span>
    </span>
  );
}

export function ScoreFigure({ score, size = "md" }: { score: ScoreResult; size?: "md" | "lg" }) {
  const big = size === "lg";
  if (score.total === null) {
    return (
      <div className={cx("leading-tight", big ? "text-right" : "")}>
        <div className={cx("font-semibold text-ink-2", big ? "text-lg" : "text-sm")}>{SCORE_STATUS_LABELS[score.status]}</div>
        <div className="text-xs text-ink-3">no numeric score</div>
      </div>
    );
  }
  return (
    <div className={cx("leading-tight", big ? "text-right" : "")}>
      <div className={cx("wide font-bold", big ? "text-4xl" : "text-xl")}>
        {score.total.toFixed(1)}
        <span className="text-sm font-medium text-ink-3"> /100</span>
      </div>
      <div className={cx("text-xs", score.status === "provisional" ? "font-semibold text-ochre" : "text-ink-3")}>
        {SCORE_STATUS_LABELS[score.status]}
      </div>
    </div>
  );
}

const CONF_STYLE: Record<Confidence, string> = {
  high: "text-verdigris",
  medium: "text-ochre",
  low: "text-oxide",
};

export function ConfidenceTag({ confidence }: { confidence: Confidence }) {
  return (
    <span className="text-xs text-ink-3">
      Confidence <span className={cx("font-semibold", CONF_STYLE[confidence])}>{confidence}</span>
    </span>
  );
}

/* ------------------------------------------------------------ provenance */

export function OriginBadge({ origin }: { origin: DataOrigin }) {
  const style =
    origin === "synthetic_demo"
      ? "hatch-copper border-copper/50 text-copper-deep"
      : origin === "verified_evidence"
        ? "border-verdigris/50 text-verdigris bg-verdigris-wash"
        : "border-rule-strong text-ink-2 bg-panel";
  return (
    <span className={cx("inline-flex items-center border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap", style)}>
      <span className={origin === "synthetic_demo" ? "bg-panel px-1" : ""}>{ORIGIN_LABELS[origin]}</span>
    </span>
  );
}

export function ProvenanceTag({ provenance, verification }: { provenance: Provenance; verification?: VerificationState }) {
  const simulated = provenance === "synthetic_demo";
  return (
    <span className="text-xs text-ink-3">
      {PROVENANCE_LABELS[provenance]}
      {verification ? (
        <>
          {", "}
          <span className={verification === "independently_verified" ? "text-verdigris" : ""}>
            {simulated ? "simulated " : ""}
            {VERIFICATION_LABELS[verification].toLowerCase()}
          </span>
        </>
      ) : null}
    </span>
  );
}

export function BasisTag({ basis }: { basis: RuleBasis }) {
  return (
    <span
      className={cx(
        "inline-flex border px-1 text-[11px] font-semibold whitespace-nowrap",
        basis === "source_referenced" ? "border-verdigris/50 text-verdigris" : "border-copper/50 text-copper-deep",
      )}
    >
      {RULE_BASIS_LABELS[basis]}
    </span>
  );
}

/** Technical term with an accessible tooltip (hover or keyboard focus). */
export function Term({ children, help }: { children: ReactNode; help: string }) {
  return (
    <span className="term" tabIndex={0} aria-label={`${typeof children === "string" ? children : ""}: ${help}`}>
      {children}
      <span role="tooltip">{help}</span>
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="hatch border border-dashed border-rule-strong p-1">
      <div className="bg-panel px-5 py-8 text-center">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mx-auto mt-1 max-w-[60ch] text-sm text-ink-2">{children}</div> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function Stat({ label, value, note, href }: { label: string; value: ReactNode; note?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-sm text-ink-2">{label}</div>
      <div className="wide mt-1 text-3xl font-bold">{value}</div>
      {note ? <div className="mt-1 text-xs text-ink-3">{note}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="block border-l-2 border-rule-strong px-4 py-1 hover:border-copper">
      {body}
    </Link>
  ) : (
    <div className="border-l-2 border-rule-strong px-4 py-1">{body}</div>
  );
}

export function TableWrap({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="relative -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export const th = "border-b border-rule-strong px-3 py-2 text-left text-xs font-semibold text-ink-2 whitespace-nowrap";
export const td = "border-b border-rule px-3 py-2.5 align-top";
