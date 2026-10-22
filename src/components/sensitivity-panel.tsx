import type { MatchState } from "@/domain/engine/result-types";
import { SENSITIVITY_DELTA, type BreakEven, type SensitivityBar } from "@/domain/engine/sensitivity";
import { STATE_LABELS } from "@/domain/labels";
import { fmtInr, fmtInrCompact, fmtNumber } from "@/lib/format";
import { Panel, cx } from "./ui";

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

const fmtInput = (b: SensitivityBar, v: number) => (b.key === "recovery" ? fmtNumber(v, 2) : `${fmtNumber(v, b.key === "freight" ? 2 : 0)} ${b.unit}`);

/** The two ends of a bar, lower annual net first, each tagged with the actual change applied to its input. */
function ends(b: SensitivityBar) {
  const tag = (input: number) => {
    const change = Math.round((input / b.base - 1) * 100);
    return `${change > 0 ? "+" : "−"}${Math.abs(change)} %`;
  };
  return [
    { tag: tag(b.low.input), p: b.low, tone: "text-copper" },
    { tag: tag(b.high.input), p: b.high, tone: "text-ink" },
  ].sort((x, y) => (x.p.annualNetInr ?? 0) - (y.p.annualNetInr ?? 0));
}

function DistanceRuler({ be }: { be: BreakEven }) {
  const current = be.currentDistanceKm ?? 0;
  const even = be.breakEvenDistanceKm;
  const max = Math.max(be.ruleLimitKm, current, even ?? 0) * 1.12;
  return (
    <div className="mt-4" aria-hidden>
      <div className="relative h-8 border-y border-rule bg-oxide-wash">
        {even !== null && even > 0 ? <span className="absolute inset-y-0 left-0 bg-verdigris-wash" style={{ width: pct(even, max) }} /> : null}
        <span className="absolute inset-y-[-6px] w-0.5 bg-ink" style={{ left: pct(be.ruleLimitKm, max) }} />
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-copper" style={{ left: pct(current, max) }} />
      </div>
      <div className="relative mt-1 h-9 text-[11px] leading-tight text-ink-2">
        {even !== null ? (
          <span className="absolute -translate-x-1/2 text-center whitespace-nowrap text-verdigris" style={{ left: pct(even, max) }}>
            break-even
            <br />
            {fmtNumber(even)} km
          </span>
        ) : null}
        <span className="absolute -translate-x-1/2 text-center whitespace-nowrap" style={{ left: pct(be.ruleLimitKm, max) }}>
          rule limit
          <br />
          {fmtNumber(be.ruleLimitKm)} km
        </span>
      </div>
    </div>
  );
}

export function SensitivityPanel({
  be,
  bars,
  baseAnnualInr,
  baseState,
}: {
  be: BreakEven;
  bars: SensitivityBar[];
  baseAnnualInr: number | null;
  baseState: MatchState;
}) {
  const reach = Math.max(1, ...bars.flatMap((b) => [b.low.annualNetInr, b.high.annualNetInr].map((v) => Math.abs((v ?? 0) - (baseAnnualInr ?? 0)))));
  const pos = (v: number | null) => 50 + (((v ?? 0) - (baseAnnualInr ?? 0)) / reach) * 50;

  return (
    <Panel title="Break-even and sensitivity" aside="Derived from the same illustrative inputs">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.25fr]">
        <div>
          <h3 className="text-sm font-semibold">Where the economics break even</h3>
          {be.status === "not_computable" ? (
            <p className="hatch mt-2 border border-dashed border-ink-3 p-0.5 text-sm">
              <span className="block bg-panel p-2">{be.reason}</span>
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-2">
                {be.breakEvenDistanceKm === null
                  ? be.reason
                  : `The net indicative benefit stays positive up to ${fmtNumber(be.breakEvenDistanceKm)} km by road. The pathway is ${fmtNumber(be.currentDistanceKm)} km away now; the application's transport rule allows ${fmtNumber(be.ruleLimitKm)} km, so ${be.binding === "economics" ? "the economics bind first" : "the transport rule binds first"}.`}
              </p>
              <DistanceRuler be={be} />
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-rule pt-3 text-sm">
                <dt className="text-ink-2">Margin before transport</dt>
                <dd className="text-right font-semibold">{fmtInr(be.marginBeforeTransportInr, "/t")}</dd>
                <dt className="text-ink-2">Highest freight rate that breaks even</dt>
                <dd className="text-right font-semibold">{be.breakEvenFreightInrPerTonneKm === null ? "—" : `₹${fmtNumber(be.breakEvenFreightInrPerTonneKm, 2)}/t·km`}</dd>
                <dt className="text-ink-2">Lowest price that breaks even</dt>
                <dd className="text-right font-semibold">{fmtInr(be.minimumPriceInr, "/t")}</dd>
                <dt className="text-ink-2">Highest processing cost that breaks even</dt>
                <dd className="text-right font-semibold">{be.maximumProcessingInr !== null && be.maximumProcessingInr < 0 ? "None at this distance" : fmtInr(be.maximumProcessingInr, "/t")}</dd>
              </dl>
            </>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold">What moves the result most</h3>
          {bars.length === 0 || baseAnnualInr === null ? (
            <p className="mt-1 text-sm text-ink-3">Not computed: the annual net benefit needs every economic input.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-2">
                Each input moved {SENSITIVITY_DELTA * 100} % down and up, one at a time, with the full engine re-run. Centre line: {fmtInrCompact(baseAnnualInr)}/yr.
              </p>
              <ul className="mt-3 space-y-3">
                {bars.map((b) => {
                  const lo = pos(b.low.annualNetInr);
                  const hi = pos(b.high.annualNetInr);
                  return (
                    <li key={b.key}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                        <span className="font-semibold">
                          {b.label} <span className="font-normal text-ink-3">{b.key === "recovery" ? fmtNumber(b.base, 2) : `${fmtNumber(b.base, 2)} ${b.unit}`}</span>
                        </span>
                        {b.flipsState ? (
                          <span className="border border-oxide/50 px-1 text-[11px] font-semibold text-oxide">
                            {(
                              [
                                [`−${SENSITIVITY_DELTA * 100} %`, b.low],
                                [`+${SENSITIVITY_DELTA * 100} %`, b.high],
                              ] as const
                            )
                              .filter(([, x]) => x.state !== baseState)
                              .map(([l, x]) => `${STATE_LABELS[x.state]} at ${l}`)
                              .join("; ")}
                          </span>
                        ) : null}
                      </div>
                      <div className="relative mt-1 h-4 bg-panel-sunk" aria-hidden>
                        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink" />
                        <span className="absolute inset-y-0 bg-copper" style={{ left: `${Math.min(lo, 50)}%`, width: `${Math.abs(lo - 50)}%` }} />
                        <span className="absolute inset-y-0 bg-ink/70" style={{ left: `${Math.min(hi, 50)}%`, width: `${Math.abs(hi - 50)}%` }} />
                      </div>
                      <div className="mt-0.5 flex justify-between gap-3 text-xs text-ink-3">
                        {ends(b).map((x, j) => (
                          <span key={x.tag} className={j ? "text-right" : ""}>
                            <span className={x.tone}>{x.tag}</span> {fmtInput(b, x.p.input)}: {fmtInrCompact(x.p.annualNetInr)}
                            {x.p.score !== null ? `, score ${x.p.score.toFixed(1)}` : ""}
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
      <p className={cx("mt-4 border-t border-rule pt-3 text-xs text-ink-3")}>
        Prices, freight and processing costs are illustrative assumptions. Break-even points show how much room the case has, not what a buyer will pay.
      </p>
    </Panel>
  );
}
