/**
 * Reset the demo store to the deterministic seed dataset.
 *   npm run seed
 * Removes any saved runs, shortlist entries and edits in .data/demo-store.json.
 */
import { APPLICATIONS, EVIDENCE_SOURCES, MATERIALS, SEED_VERSION } from "@/data/seed";
import { validateApplication, validateMaterial } from "@/domain/validation";
import { freshDemoState, STORE_PATH, writeDemoState } from "@/server/repository/demo-state";

async function main() {
  // Refuse to write a seed that would fail the engine's own validation.
  const problems = [
    ...MATERIALS.flatMap((m) => validateMaterial(m).issues.filter((i) => i.severity === "error").map((i) => `${m.code}: ${i.message}`)),
    ...APPLICATIONS.flatMap((a) => validateApplication(a).issues.filter((i) => i.severity === "error").map((i) => `${a.id}: ${i.message}`)),
  ];
  if (problems.length) {
    console.error("Seed data is invalid:\n" + problems.join("\n"));
    process.exit(1);
  }
  await writeDemoState(freshDemoState());
  console.log(
    `Demo store reset (${SEED_VERSION}): ${MATERIALS.length} synthetic materials, ${APPLICATIONS.length} applications, ${EVIDENCE_SOURCES.length} sources → ${STORE_PATH}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
