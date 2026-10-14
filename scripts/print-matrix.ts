import { APPLICATIONS, MATERIALS, DEFAULT_SCENARIO } from "@/data/seed";
import { runMatching } from "@/domain/engine/run";
import { validateApplication } from "@/domain/validation";

for (const a of APPLICATIONS) {
  const v = validateApplication(a);
  if (!v.valid) console.log("INVALID APP", a.id, v.issues);
}
for (const material of MATERIALS) {
  const out = runMatching({ material, applications: APPLICATIONS, scenario: DEFAULT_SCENARIO });
  console.log(`\n== ${material.code} ${material.name}  hash=${out.inputHash}`);
  for (const r of out.results) {
    if (r.checks.find((c) => c.id === "identity")?.status === "fail") continue;
    console.log(
      `  #${r.rank ?? "-"} ${r.applicationId.padEnd(26)} ${r.state.padEnd(20)} ${String(r.score.total ?? r.score.status).padEnd(18)} conf=${r.score.confidence} net=${r.economics.perTonne.net} km=${r.economics.distanceKm} | ${r.headline}`,
    );
  }
}
