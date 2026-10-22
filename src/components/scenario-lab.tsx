"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { resolveAssumptions } from "@/domain/engine/economics";
import type { MatchResult } from "@/domain/engine/result-types";
import { runMatching } from "@/domain/engine/run";
import { SENSITIVITY_DELTA, sensitivity as sensitivityBars } from "@/domain/engine/sensitivity";
import { COMPONENT_LABELS, DEFAULT_ASSUMPTIONS, DEFAULT_WEIGHTS, normaliseWeights, type ScoreComponentKey, type ScoreWeights } from "@/domain/scoring-config";
import type { Application, Material, Scenario, ScenarioAssumptions } from "@/domain/types";
import { fmtInr, fmtNumber } from "@/lib/format";
import { runMatchAction } from "@/server/actions";
import { SubmitButton } from "./submit-button";
import { StateBadge, buttonStyles, cx } from "./ui";

type Overrides = Record<string, { distanceKmOverride: string; materialPriceInrPerTonneOverride: string }>;
const toNum = (s: string) => (s.trim() === "" ? null : Number(s));
const inScope = (r: MatchResult) => r.checks.find((c) => c.id === "identity")?.status !== "fail";

export function ScenarioLab({
  material,
  applications,
  initialFocus,
  baseRunId,
}: {
  material: Material;
  applications: Application[];
  initialFocus?: string;
  baseRunId?: string;
}) {
  const [rate, setRate] = useState(String(DEFAULT_ASSUMPTIONS.transportCostInrPerTonneKm));
  const [circuity, setCircuity] = useState(String(DEFAULT_ASSUMPTIONS.roadCircuityFactor));
  const [recovery, setRecovery] = useState(String(DEFAULT_ASSUMPTIONS.recoveryFraction));
  const [overrides, setOverrides] = useState<Overrides>({});
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  const [label, setLabel] = useState("Scenario: adjusted assumptions");

  const baseline = useMemo(
    () => runMatching({ material, applications, scenario: { label: "Baseline", defaults: DEFAULT_ASSUMPTIONS, perApplication: {} } }).results.filter(inScope),
    [material, applications],
  );
  const scopeApps = useMemo(() => applications.filter((a) => baseline.some((r) => r.applicationId === a.id)), [applications, baseline]);
  const [focus, setFocus] = useState(initialFocus && scopeApps.some((a) => a.id === initialFocus) ? initialFocus : (scopeApps[0]?.id ?? ""));

  // Build and validate the scenario from the current inputs.
  const built = useMemo((): { scenario?: Scenario; weights?: ScoreWeights; error?: string } => {
    const defaults: ScenarioAssumptions = {
      ...DEFAULT_ASSUMPTIONS,
      transportCostInrPerTonneKm: Number(rate),
      roadCircuityFactor: Number(circuity),
      recoveryFraction: Number(recovery),
    };
    const perApplication: Scenario["perApplication"] = {};
    for (const [id, o] of Object.entries(overrides)) {
      const d = toNum(o.distanceKmOverride);
      const p = toNum(o.materialPriceInrPerTonneOverride);
      if (d !== null || p !== null) perApplication[id] = { distanceKmOverride: d, materialPriceInrPerTonneOverride: p };
    }
    try {
      resolveAssumptions(defaults, undefined);
      for (const o of Object.values(perApplication)) resolveAssumptions(defaults, o);
      return { scenario: { label: label.trim() || "Scenario", defaults, perApplication }, weights: normaliseWeights(weights) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [rate, circuity, recovery, overrides, weights, label]);

  const deferred = useDeferredValue(built);
  const scenarioResults = useMemo(() => {
    if (!deferred.scenario) return null;
    return runMatching({ material, applications: scopeApps, scenario: deferred.scenario, weights: deferred.weights }).results;
  }, [deferred, material, scopeApps]);

  const focusApp = scopeApps.find((a) => a.id === focus);
  const focusScenario = scenarioResults?.find((r) => r.applicationId === focus);
  const sensitivity = useMemo(() => {
    if (!focusApp || !focusScenario || !deferred.scenario || focusScenario.economics.perTonne.net === null) return null;
    const base = resolveAssumptions(deferred.scenario.defaults, deferred.scenario.perApplication[focusApp.id]);
    const net = focusScenario.economics.perTonne.net;
    // Same one-at-a-time engine re-run as the match page, read here as net ₹ per tonne.
    const rows = sensitivityBars(material, focusApp, base, focusScenario.score.weights)
      .filter((b) => b.key !== "recovery")
      .map((b) => ({ key: b.key, label: b.label, lo: b.low.netPerTonneInr, hi: b.high.netPerTonneInr, swing: Math.abs((b.high.netPerTonneInr ?? 0) - (b.low.netPerTonneInr ?? 0)) }))
      .sort((a, b) => b.swing - a.swing || a.key.localeCompare(b.key));
    const maxSwing = Math.max(1, ...rows.map((r) => Math.max(Math.abs((r.lo ?? 0) - net), Math.abs((r.hi ?? 0) - net))));
    return { rows, maxSwing, net };
  }, [focusApp, focusScenario, deferred, material]);

  const field = "w-full border border-rule-strong bg-panel px-2 py-1.5 text-sm";
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      {/* Controls */}
      <div className="space-y-5">
        <fieldset className="border border-rule bg-panel p-4">
          <legend className="px-1 font-semibold">Global assumptions</legend>
          <div className="space-y-4 text-sm">
            <label className="block">
              Transport cost (₹ per t·km)
              <div className="mt-1 flex items-center gap-2">
                <input type="range" min="1" max="10" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} className="flex-1 accent-[var(--copper)]" aria-label="Transport cost slider" />
                <input className={cx(field, "w-20")} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Transport cost value" />
              </div>
            </label>
            <label className="block">
              Road circuity factor
              <div className="mt-1 flex items-center gap-2">
                <input type="range" min="1" max="2" step="0.05" value={circuity} onChange={(e) => setCircuity(e.target.value)} className="flex-1 accent-[var(--copper)]" aria-label="Circuity slider" />
                <input className={cx(field, "w-20")} inputMode="decimal" value={circuity} onChange={(e) => setCircuity(e.target.value)} aria-label="Circuity value" />
              </div>
            </label>
            <label className="block">
              Recovered fraction after processing
              <div className="mt-1 flex items-center gap-2">
                <input type="range" min="0.5" max="1" step="0.01" value={recovery} onChange={(e) => setRecovery(e.target.value)} className="flex-1 accent-[var(--copper)]" aria-label="Recovery fraction slider" />
                <input className={cx(field, "w-20")} inputMode="decimal" value={recovery} onChange={(e) => setRecovery(e.target.value)} aria-label="Recovery fraction value" />
              </div>
            </label>
            <p className="text-xs text-ink-3">All values are assumptions you set. None of them is a quotation or a measured saving.</p>
          </div>
        </fieldset>

        <fieldset className="border border-rule bg-panel p-4">
          <legend className="px-1 font-semibold">Per-application overrides</legend>
          <p className="mb-3 text-xs text-ink-3">Leave blank to use the computed distance and the record&apos;s indicative price.</p>
          <div className="space-y-3">
            {scopeApps.map((a) => {
              const b = baseline.find((r) => r.applicationId === a.id)!;
              const o = overrides[a.id] ?? { distanceKmOverride: "", materialPriceInrPerTonneOverride: "" };
              const update = (patch: Partial<Overrides[string]>) => setOverrides((p) => ({ ...p, [a.id]: { ...o, ...patch } }));
              return (
                <div key={a.id} className="border-b border-rule pb-3 last:border-0">
                  <div className="text-sm font-semibold">{a.name}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      Distance km
                      <input className={field} inputMode="decimal" placeholder={fmtNumber(b.economics.distanceKm)} value={o.distanceKmOverride} onChange={(e) => update({ distanceKmOverride: e.target.value })} />
                    </label>
                    <label className="text-xs">
                      Price ₹/t
                      <input
                        className={field}
                        inputMode="decimal"
                        placeholder={b.economics.perTonne.price === null ? "Not set" : String(b.economics.perTonne.price)}
                        value={o.materialPriceInrPerTonneOverride}
                        onChange={(e) => update({ materialPriceInrPerTonneOverride: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="border border-rule bg-panel p-4">
          <legend className="px-1 font-semibold">Score weights</legend>
          <div className="space-y-2.5 text-sm">
            {(Object.keys(DEFAULT_WEIGHTS) as ScoreComponentKey[]).map((k) => (
              <label key={k} className="block">
                <span className="flex justify-between">
                  <span>{COMPONENT_LABELS[k]}</span>
                  <span className="text-ink-3">{totalWeight > 0 ? Math.round((weights[k] / totalWeight) * 100) : 0} %</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={weights[k]}
                  onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
                  className="w-full accent-[var(--copper)]"
                />
              </label>
            ))}
            <button type="button" className={buttonStyles.ghost} onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset weights</button>
            <p className="text-xs text-ink-3">Weights are normalised to sum to 100 %. Hard constraints never enter the weighted sum.</p>
          </div>
        </fieldset>
      </div>

      {/* Results */}
      <div className="min-w-0 space-y-6">
        {built.error ? (
          <p role="alert" className="border border-oxide/40 bg-oxide-wash px-4 py-2 text-sm text-oxide">Check the inputs: {built.error}</p>
        ) : null}

        <section className="border border-rule bg-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
            <h2 className="text-[0.95rem] font-semibold">Ranking under these assumptions</h2>
            <span className="text-sm text-ink-3">Recalculated by the engine as you type</span>
          </div>
          <div className="relative overflow-x-auto p-4">
            <table className="w-full min-w-[720px] text-sm" aria-live="polite">
              <thead>
                <tr className="border-b border-rule-strong text-left text-xs text-ink-2">
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Application</th>
                  <th className="px-2 py-2">State</th>
                  <th className="px-2 py-2 text-right">Net ₹/t (baseline → scenario)</th>
                  <th className="px-2 py-2 text-right">Score (baseline → scenario)</th>
                  <th className="px-2 py-2"><span className="sr-only">Focus</span></th>
                </tr>
              </thead>
              <tbody>
                {(scenarioResults ?? []).map((r) => {
                  const b = baseline.find((x) => x.applicationId === r.applicationId)!;
                  const app = scopeApps.find((a) => a.id === r.applicationId)!;
                  const delta = r.score.total !== null && b.score.total !== null ? r.score.total - b.score.total : null;
                  return (
                    <tr key={r.applicationId} className={cx("border-b border-rule", focus === r.applicationId && "bg-copper-wash")}>
                      <td className="px-2 py-2 font-semibold">{r.rank ?? "—"}<span className="text-xs font-normal text-ink-3">{b.rank !== r.rank ? ` (was ${b.rank ?? "—"})` : ""}</span></td>
                      <td className="px-2 py-2">{app.name}</td>
                      <td className="px-2 py-2"><StateBadge state={r.state} /></td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <span className="text-ink-3">{b.economics.perTonne.net === null ? "—" : fmtInr(b.economics.perTonne.net)}</span> →{" "}
                        <span className={cx("font-semibold", (r.economics.perTonne.net ?? 0) < 0 && "text-oxide")}>{r.economics.perTonne.net === null ? "Incomplete" : fmtInr(r.economics.perTonne.net)}</span>
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <span className="text-ink-3">{b.score.total?.toFixed(1) ?? "—"}</span> →{" "}
                        <span className="font-semibold">{r.score.total?.toFixed(1) ?? (r.state === "ineligible" ? "Not ranked" : "Insufficient data")}</span>
                        {delta !== null && Math.abs(delta) >= 0.05 ? <span className={cx("ml-1 text-xs", delta > 0 ? "text-verdigris" : "text-oxide")}>{delta > 0 ? "+" : ""}{delta.toFixed(1)}</span> : null}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button type="button" className="text-xs font-semibold text-copper hover:underline" onClick={() => setFocus(r.applicationId)} aria-pressed={focus === r.applicationId}>
                          Sensitivity
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-3">A change in assumptions can move a candidate across a hard limit (for example the maximum transport distance), which changes its state rather than its score.</p>
          </div>
        </section>

        <section className="border border-rule bg-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-2.5">
            <h2 className="text-[0.95rem] font-semibold">What drives the result: {focusApp?.name ?? "select a candidate"}</h2>
            <span className="text-sm text-ink-3">Net ₹/t when each input moves ±{SENSITIVITY_DELTA * 100} %, others held</span>
          </div>
          <div className="p-4">
            {!sensitivity ? (
              <p className="hatch border border-dashed border-ink-3 p-0.5 text-sm">
                <span className="block bg-panel p-3">Sensitivity is unavailable because the economics for this candidate are incomplete. Supply the missing price or cost first.</span>
              </p>
            ) : (
              <>
                <p className="mb-3 text-sm">
                  Scenario net benefit: <span className={cx("font-bold", sensitivity.net < 0 && "text-oxide")}>{fmtInr(sensitivity.net, "/t")}</span>
                </p>
                <ul className="space-y-2.5">
                  {sensitivity.rows.map((row) => {
                    const scale = (v: number | null) => (v === null ? 0 : ((v - sensitivity.net) / sensitivity.maxSwing) * 50);
                    const lo = scale(row.lo);
                    const hi = scale(row.hi);
                    const left = Math.min(lo, hi);
                    const right = Math.max(lo, hi);
                    return (
                      <li key={row.key} className="grid grid-cols-[9.5rem_1fr_9rem] items-center gap-3 text-sm">
                        <span>{row.label}</span>
                        <span className="relative h-5 bg-panel-sunk" aria-hidden>
                          <span className="absolute top-0 bottom-0 left-1/2 w-px bg-ink" />
                          {row.lo === null ? (
                            <span className="hatch absolute inset-0" />
                          ) : (
                            <span className="absolute top-1 bottom-1 bg-copper" style={{ left: `${50 + left}%`, width: `${Math.max(0.5, right - left)}%` }} />
                          )}
                        </span>
                        <span className="text-xs text-ink-2">
                          {row.lo === null ? "Not applicable" : `${fmtInr(row.lo)} to ${fmtInr(row.hi)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-ink-3">Ordered by swing. Each bar is the engine re-run with one input changed, so it reflects exactly the formula used for ranking.</p>
              </>
            )}
          </div>
        </section>

        <section className="border border-rule-strong bg-panel p-4">
          <h2 className="font-semibold">Save this scenario as a matching run</h2>
          <p className="mt-1 text-sm text-ink-2">Creates a new stored run with these assumptions and weights. Existing runs are not modified.</p>
          <form action={runMatchAction} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="materialId" value={material.id} />
            <input type="hidden" name="scenario" value={built.scenario ? JSON.stringify(built.scenario) : ""} />
            <input type="hidden" name="weights" value={JSON.stringify(weights)} />
            <label className="flex-1 text-sm">
              Run label
              <input className={field} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
            </label>
            {built.error ? (
              <button type="button" disabled className={buttonStyles.primary}>Save as run</button>
            ) : (
              <SubmitButton pendingLabel="Saving run…">Save as run</SubmitButton>
            )}
          </form>
          {baseRunId ? (
            <Link href={`/match/runs/${baseRunId}`} className="mt-3 inline-block text-sm text-copper hover:underline">Back to the run you came from</Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}
