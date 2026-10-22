import { FAMILY_SHORT, STATE_LABELS } from "@/domain/labels";
import type { MaterialFamily } from "@/domain/types";
import { fmtNumber } from "@/lib/format";
import type { FlowLink } from "@/server/insights";

const W = 860;
const TOP = 12;
const NODE_W = 12;
const GAP = 14;
const LEFT_X = 150;
const RIGHT_X = 560;
const BODY_H = 400;

const kt = (t: number) => `${fmtNumber(t / 1000, t < 10000 ? 1 : 0)} kt/yr`;
const STATE_RANK = { potentially_eligible: 0, incomplete_evidence: 1, ineligible: 2, unplaced: 3 } as const;

interface Node {
  id: string;
  label: string;
  total: number;
  y: number;
  h: number;
  state?: FlowLink["state"];
}

const LINE = 15;
const WRAP = 30;

/** Break a label into at most two lines of about `WRAP` characters. */
function wrap(label: string): string[] {
  if (label.length <= WRAP) return [label];
  const words = label.split(" ");
  let first = "";
  while (words.length && `${first} ${words[0]}`.trim().length <= WRAP) first = `${first} ${words.shift()}`.trim();
  const rest = words.join(" ");
  return [first, rest.length > WRAP ? `${rest.slice(0, WRAP - 1)}…` : rest];
}

/** Height of a label block: its text lines plus the tonnes line. */
const blockHeight = (lines: number) => (lines + 1) * LINE;

/** Label centres: at the node's centre where there is room, pushed down (then back up) to keep labels apart. */
function placeLabels(nodes: Node[], heights: number[], bottom: number): number[] {
  const ys: number[] = [];
  nodes.forEach((n, i) => {
    const min = i ? ys[i - 1] + heights[i - 1] / 2 + heights[i] / 2 + 6 : -Infinity;
    ys.push(Math.max(n.y + n.h / 2, min));
  });
  for (let i = ys.length - 1, limit = bottom - heights[ys.length - 1] / 2; i >= 0; i--) {
    ys[i] = Math.min(ys[i], limit);
    if (i > 0) limit = ys[i] - heights[i] / 2 - heights[i - 1] / 2 - 6;
  }
  return ys;
}

function stack(nodes: Omit<Node, "y" | "h">[], k: number): Node[] {
  let y = TOP;
  return nodes.map((n) => {
    const h = Math.max(2, n.total * k);
    const node = { ...n, y, h };
    y += h + GAP;
    return node;
  });
}

/**
 * Where each family's registered tonnes go under baseline assumptions: to its
 * best screened pathway, or nowhere yet. One link per material and pathway,
 * so tonnes are never counted twice.
 */
export function FlowDiagram({ flows, appNames }: { flows: FlowLink[]; appNames: Map<string, string> }) {
  const total = flows.reduce((s, f) => s + f.tonnes, 0);
  if (total === 0) return null;

  const sum = (pred: (f: FlowLink) => boolean) => flows.filter(pred).reduce((s, f) => s + f.tonnes, 0);
  const families = [...new Set(flows.map((f) => f.family))]
    .map((id) => ({ id, label: FAMILY_SHORT[id as MaterialFamily], total: sum((f) => f.family === id) }))
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
  // One node per destination and state, so an eligible source and a pending one are never merged.
  const nodeOf = (f: FlowLink) => `${f.target}|${f.state}`;
  const targets = [...new Set(flows.map(nodeOf))]
    .map((id) => {
      const [target, state] = id.split("|") as [string, FlowLink["state"]];
      return { id, label: target === "unplaced" ? "Not placed by a screened pathway" : (appNames.get(target) ?? target), total: sum((f) => nodeOf(f) === id), state };
    })
    .sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || b.total - a.total || a.id.localeCompare(b.id));

  const k = (BODY_H - GAP * (Math.max(families.length, targets.length) - 1)) / total;
  const left = stack(families, k);
  const right = stack(targets, k);
  const leftLines = left.map((n) => wrap(n.label));
  const rightLines = right.map((n) => wrap(n.label));
  const leftH = leftLines.map((l) => blockHeight(l.length));
  const rightH = rightLines.map((l) => blockHeight(l.length));
  const nodeBottom = Math.max(...[...left, ...right].map((n) => n.y + n.h));
  const labelsFit = (ns: Node[], hs: number[]) =>
    ns.reduce((y, n, i) => Math.max(i ? y + hs[i - 1] / 2 + hs[i] / 2 + 6 : n.y + n.h / 2, n.y + n.h / 2), 0) + hs[hs.length - 1] / 2;
  const height = Math.max(nodeBottom, labelsFit(left, leftH), labelsFit(right, rightH)) + TOP;
  const leftLabels = placeLabels(left, leftH, height - TOP);
  const rightLabels = placeLabels(right, rightH, height - TOP);
  const li = new Map(left.map((n, i) => [n.id, i]));
  const ri = new Map(right.map((n, i) => [n.id, i]));

  const out = new Map(left.map((n) => [n.id, n.y]));
  const inn = new Map(right.map((n) => [n.id, n.y]));
  const rIndex = (f: FlowLink) => ri.get(nodeOf(f))!;
  const ordered = [...flows].sort((a, b) => li.get(a.family)! - li.get(b.family)! || rIndex(a) - rIndex(b));
  const sy = new Map<FlowLink, number>();
  for (const f of ordered) {
    sy.set(f, out.get(f.family)!);
    out.set(f.family, out.get(f.family)! + f.tonnes * k);
  }
  const ty = new Map<FlowLink, number>();
  for (const f of [...flows].sort((a, b) => rIndex(a) - rIndex(b) || li.get(a.family)! - li.get(b.family)!)) {
    ty.set(f, inn.get(nodeOf(f))!);
    inn.set(nodeOf(f), inn.get(nodeOf(f))! + f.tonnes * k);
  }

  const x1 = LEFT_X + NODE_W;
  const x2 = RIGHT_X;
  const xm = (x1 + x2) / 2;
  const band = (f: FlowLink) => {
    const h = Math.max(1, f.tonnes * k);
    const a = sy.get(f)!;
    const b = ty.get(f)!;
    return `M${x1},${a} C${xm},${a} ${xm},${b} ${x2},${b} L${x2},${b + h} C${xm},${b + h} ${xm},${a + h} ${x1},${a + h} Z`;
  };
  const fillFor = (s: FlowLink["state"]) =>
    s === "potentially_eligible" ? { className: "fill-verdigris/45" } : { fill: s === "incomplete_evidence" ? "url(#flow-hatch-ochre)" : "url(#flow-hatch-ink)" };
  const nodeFill = (s?: FlowLink["state"]) =>
    s === "potentially_eligible" ? "fill-verdigris" : s === "incomplete_evidence" ? "fill-ochre" : s === "unplaced" ? "fill-rule-strong" : "fill-ink";

  return (
    <figure>
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0" role="region" aria-label="By-product flow diagram" tabIndex={0}>
        <svg viewBox={`0 0 ${W} ${height}`} className="mx-auto block w-full max-w-[1040px] min-w-[620px]" role="img" aria-labelledby="flow-title">
          <title id="flow-title">Registered by-product tonnes by material family, flowing to each family&apos;s best screened pathway</title>
          <defs>
            <pattern id="flow-hatch-ochre" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <rect width="7" height="7" className="fill-ochre-wash" />
              <line x1="0" y1="0" x2="0" y2="7" className="stroke-ochre" strokeWidth="2.2" />
            </pattern>
            <pattern id="flow-hatch-ink" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <rect width="7" height="7" className="fill-panel-sunk" />
              <line x1="0" y1="0" x2="0" y2="7" className="stroke-rule-strong" strokeWidth="1.6" />
            </pattern>
          </defs>

          {ordered.map((f) => (
            <path key={`${f.family}-${f.target}-${sy.get(f)}`} d={band(f)} {...fillFor(f.state)} stroke="var(--panel)" strokeWidth="0.75">
              <title>{`${FAMILY_SHORT[f.family]} to ${f.target === "unplaced" ? "no screened pathway" : appNames.get(f.target)}: ${kt(f.tonnes)}${f.state === "unplaced" ? "" : `, ${STATE_LABELS[f.state].toLowerCase()}`}`}</title>
            </path>
          ))}

          {left.map((n, i) => (
            <g key={n.id}>
              <rect x={LEFT_X} y={n.y} width={NODE_W} height={n.h} className="fill-ink" />
              <Leader from={[LEFT_X - 2, n.y + n.h / 2]} to={[LEFT_X - 8, leftLabels[i]]} />
              <text x={LEFT_X - 10} y={leftLabels[i] - leftH[i] / 2 + LINE / 2} textAnchor="end" dominantBaseline="middle" className="fill-ink text-[14px] font-semibold">
                {leftLines[i].map((line, j) => (
                  <tspan key={j} x={LEFT_X - 10} dy={j ? LINE : 0}>{line}</tspan>
                ))}
                <tspan x={LEFT_X - 10} dy={LINE} className="fill-ink-3 text-[12px] font-normal">{kt(n.total)}</tspan>
              </text>
            </g>
          ))}

          {right.map((n, i) => (
            <g key={n.id}>
              <rect x={RIGHT_X} y={n.y} width={NODE_W} height={n.h} className={nodeFill(n.state)} />
              <Leader from={[RIGHT_X + NODE_W + 2, n.y + n.h / 2]} to={[RIGHT_X + NODE_W + 8, rightLabels[i]]} />
              <text x={RIGHT_X + NODE_W + 10} y={rightLabels[i] - rightH[i] / 2 + LINE / 2} dominantBaseline="middle" className="fill-ink text-[14px] font-semibold">
                <title>{n.label}</title>
                {rightLines[i].map((line, j) => (
                  <tspan key={j} x={RIGHT_X + NODE_W + 10} dy={j ? LINE : 0}>{line}</tspan>
                ))}
                <tspan x={RIGHT_X + NODE_W + 10} dy={LINE} className="fill-ink-3 text-[12px] font-normal">
                  {kt(n.total)}
                  {n.state && n.state !== "unplaced" ? `, ${STATE_LABELS[n.state].toLowerCase()}` : ""}
                </tspan>
              </text>
            </g>
          ))}
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-2">
        <span className="flex items-center gap-1.5"><span className="inline-block size-3 bg-verdigris/60" aria-hidden /> Potentially eligible</span>
        <span className="flex items-center gap-1.5"><span className="hatch inline-block size-3 border border-ochre bg-ochre-wash" aria-hidden /> Awaiting evidence</span>
        <span className="flex items-center gap-1.5"><span className="hatch inline-block size-3 border border-rule-strong bg-panel-sunk" aria-hidden /> Not placed</span>
        <span className="text-ink-3">Each material counts once, against its best pathway. Losses and capacity caps show as &ldquo;not placed&rdquo;.</span>
      </figcaption>
      <div className="sr-only">
      <table>
        <caption>Flow data</caption>
        <thead>
          <tr><th>Material family</th><th>Destination</th><th>Tonnes per year</th><th>State</th></tr>
        </thead>
        <tbody>
          {ordered.map((f) => (
            <tr key={`t-${f.family}-${f.target}-${sy.get(f)}`}>
              <td>{FAMILY_SHORT[f.family]}</td>
              <td>{f.target === "unplaced" ? "Not placed" : appNames.get(f.target)}</td>
              <td>{fmtNumber(f.tonnes)}</td>
              <td>{f.state === "unplaced" ? "Not placed" : STATE_LABELS[f.state]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}

function Leader({ from, to }: { from: [number, number]; to: [number, number] }) {
  if (Math.abs(from[1] - to[1]) < 3) return null;
  return <polyline points={`${from[0]},${from[1]} ${to[0]},${to[1]}`} fill="none" className="stroke-ink-3" strokeWidth="1" />;
}
