"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface SectorDatum {
  industry: string;
  potentially_eligible: number;
  incomplete_evidence: number;
}

/** Stacked bar of in-scope candidate pathways by target industry, from live screening results. */
export function SectorChart({ data }: { data: SectorDatum[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--rule)" />
          <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--ink-2)", fontSize: 12 }} stroke="var(--rule-strong)" />
          <YAxis type="category" dataKey="industry" width={150} tick={{ fill: "var(--ink)", fontSize: 12 }} stroke="var(--rule-strong)" />
          <Tooltip
            cursor={{ fill: "var(--panel-sunk)" }}
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--rule-strong)", borderRadius: 0, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="potentially_eligible" name="Potentially eligible" stackId="a" fill="var(--verdigris)" isAnimationActive={false} />
          <Bar dataKey="incomplete_evidence" name="Incomplete evidence" stackId="a" fill="var(--ochre)" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
