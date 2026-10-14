import type { Check, MatchResult } from "@/domain/engine/result-types";
import { cx } from "./ui";

const STAGE_ORDER = ["identity", "hazard", "specification", "evidence", "logistics", "volume"] as const;

function orderedChecks(result: MatchResult): Check[] {
  return STAGE_ORDER.flatMap((stage) => result.checks.filter((c) => c.stage === stage));
}

export function anchorFor(checkId: string) {
  return `check-${checkId.replace(/[^a-z0-9-]/gi, "-")}`;
}

const STATUS_WORD = { pass: "passes", fail: "fails", unknown: "is unknown" } as const;

/**
 * The Missing-Bridge span. Each deck segment is one check between the material
 * (left abutment) and the application (right abutment): solid = pass,
 * hatched gap = unknown, broken = fail. Segments link to the check rows.
 * Purely a rendering of the engine's actual check results.
 */
export function BridgeSpan({
  result,
  materialLabel,
  applicationLabel,
  compact = false,
  linkSegments = true,
  size = "md",
}: {
  result: MatchResult;
  materialLabel: string;
  applicationLabel: string;
  compact?: boolean;
  linkSegments?: boolean;
  size?: "md" | "lg";
}) {
  const checks = orderedChecks(result);
  const issues = checks.filter((c) => c.status !== "pass");
  const marker = new Map(issues.map((c, i) => [c.id, i + 1]));
  const gaps = checks.filter((c) => c.status === "unknown").length;
  const breaks = checks.filter((c) => c.status === "fail").length;
  const summary = `${checks.length} checks between ${materialLabel} and ${applicationLabel}: ${checks.length - gaps - breaks} pass, ${gaps} unknown, ${breaks} fail.`;

  if (compact) {
    return (
      <div className="flex h-2.5 w-full min-w-[120px] gap-px" role="img" aria-label={summary}>
        {checks.map((c) => (
          <span
            key={c.id}
            className={cx(
              "flex-1",
              c.status === "pass" && "bg-verdigris",
              c.status === "fail" && "bg-oxide",
              c.status === "unknown" && "hatch border border-ink-3/60",
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <figure className="w-full" aria-label="Missing-Bridge span">
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="flex items-stretch gap-0">
        <div className="flex w-24 shrink-0 flex-col justify-end border-r-4 border-ink bg-panel-sunk px-2 py-2 text-xs font-semibold leading-tight sm:w-36">
          <span className="text-ink-3 font-normal">Material</span>
          <span className="line-clamp-3">{materialLabel}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-end">
          <ol className={cx("flex items-stretch gap-[3px] px-[3px]", size === "lg" ? "h-11" : "h-8")} aria-label="Checks along the span">
            {checks.map((c) => {
              const label = `${c.label} ${STATUS_WORD[c.status]}${c.safetyCritical ? " (safety-critical)" : ""}`;
              const n = marker.get(c.id);
              const seg = cx(
                "group relative flex h-full flex-1 items-center justify-center text-[11px] font-bold transition-[filter] hover:brightness-110 focus-visible:z-10",
                c.status === "pass" && "bg-verdigris",
                c.status === "fail" && "bg-oxide text-white [clip-path:polygon(0_0,100%_0,100%_100%,64%_100%,50%_45%,36%_100%,0_100%)]",
                c.status === "unknown" && "hatch border-2 border-dashed border-ink-3 bg-panel text-ink",
              );
              const content = n ? <span className={c.status === "unknown" ? "bg-panel px-0.5" : "pb-2"}>{n}</span> : null;
              return (
                <li key={c.id} className="relative flex flex-1">
                  {linkSegments ? (
                    <a href={`#${anchorFor(c.id)}`} className={seg} aria-label={label} title={label}>
                      {content}
                    </a>
                  ) : (
                    <span className={seg} title={label} aria-label={label} role="img">
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {/* Piers: one per segment boundary, drawn like an elevation. */}
          <div aria-hidden className={cx("flex gap-[3px] px-[3px]", size === "lg" ? "h-8" : "h-5")}>
            {checks.map((c) => (
              <span key={c.id} className="flex flex-1 justify-center">
                <span className={cx("w-px", c.status === "unknown" ? "bg-transparent" : "bg-rule-strong")} />
              </span>
            ))}
          </div>
          <div aria-hidden className="h-px bg-rule-strong" />
        </div>
        <div className="flex w-24 shrink-0 flex-col justify-end border-l-4 border-ink bg-panel-sunk px-2 py-2 text-right text-xs font-semibold leading-tight sm:w-36">
          <span className="text-ink-3 font-normal">Application</span>
          <span className="line-clamp-3">{applicationLabel}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 bg-verdigris" /> Pass ({checks.length - gaps - breaks})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="hatch inline-block h-2.5 w-5 border border-dashed border-ink-3" /> Unknown, a gap in the bridge ({gaps})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 bg-oxide" /> Fail ({breaks})
        </span>
      </div>
      {issues.length ? (
        <ol className="mt-3 space-y-1 border-t border-rule pt-2 text-sm">
          {issues.map((c) => (
            <li key={c.id} className="flex gap-2">
              <span
                className={cx(
                  "inline-flex size-5 shrink-0 items-center justify-center text-[11px] font-bold",
                  c.status === "fail" ? "bg-oxide text-white" : "hatch border border-dashed border-ink-3",
                )}
              >
                <span className={c.status === "unknown" ? "bg-panel px-0.5" : ""}>{marker.get(c.id)}</span>
              </span>
              <span>
                <span className="font-semibold">{c.label}</span>{" "}
                <span className="text-ink-2">
                  {c.status === "fail" ? "fails" : "unknown"}
                  {c.enforcement === "hard" ? ", hard rule" : c.enforcement === "soft" ? ", soft rule" : ""}
                  {c.safetyCritical ? ", safety-critical" : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </figure>
  );
}
