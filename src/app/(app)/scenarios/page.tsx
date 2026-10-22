import { Suspense } from "react";
import { ScenarioLab } from "@/components/scenario-lab";
import { EmptyState, PageHeader, buttonStyles } from "@/components/ui";
import { FAMILY_SHORT } from "@/domain/labels";
import { validateMaterial } from "@/domain/validation";
import { requireContext } from "@/server/context";
import { ROUTING_ATTRIBUTION, routedLegs, routingConfigured } from "@/server/routing";

export const metadata = { title: "Scenarios" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default function ScenariosPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <PageHeader
        title="Scenario comparison"
        lede="Change distance, freight rate, price, recovery and weights to see how indicative economics and ranking respond. The same engine runs in your browser; nothing is saved until you choose to."
      />
      <Suspense fallback={<p className="text-ink-3">Loading scenario tools…</p>}>
        <ScenarioContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ScenarioContent({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { repo } = await requireContext();
  const [materials, applications] = await Promise.all([repo.listMaterials(), repo.listApplications()]);
  if (materials.length === 0) return <EmptyState title="No materials yet" />;
  const material = materials.find((m) => m.id === one(sp.material)) ?? materials[0];
  const validation = validateMaterial(material);
  const routes = routingConfigured()
    ? Object.fromEntries(Object.entries(await routedLegs(material, applications)).map(([id, leg]) => [id, leg.km]))
    : null;

  return (
    <>
      <form method="get" className="mb-5 flex flex-col gap-2 border border-rule bg-panel p-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm">
          Material
          <select name="material" defaultValue={material.id} className="mt-1 block w-full border border-rule-strong bg-panel px-2 py-2 text-sm">
            {materials.map((m) => (
              <option key={m.id} value={m.id}>{m.code}, {m.name} ({FAMILY_SHORT[m.family]})</option>
            ))}
          </select>
        </label>
        <button type="submit" className={buttonStyles.secondary}>Load material</button>
      </form>
      {!validation.valid ? (
        <EmptyState title="This material profile has invalid data">
          {validation.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ")} Fix the profile before exploring scenarios.
        </EmptyState>
      ) : (
      <ScenarioLab
        key={material.id}
        material={material}
        applications={applications}
        initialFocus={one(sp.focus) || undefined}
        baseRunId={one(sp.run) || undefined}
        routes={routes}
        routingAttribution={ROUTING_ATTRIBUTION}
      />
      )}
    </>
  );
}
