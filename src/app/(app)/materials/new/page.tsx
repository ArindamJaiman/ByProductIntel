import Link from "next/link";
import { Suspense } from "react";
import { MaterialForm } from "@/components/material-form";
import { PageHeader } from "@/components/ui";
import { saveMaterialAction } from "@/server/actions";
import { requireContext } from "@/server/context";

export const metadata = { title: "Add material" };

export default function NewMaterialPage() {
  return (
    <>
      <PageHeader
        kicker={<Link href="/materials" className="hover:text-copper">Materials registry</Link>}
        title="Add a material profile"
        lede="Describe one specific by-product stream. New records are stored as user-supplied data."
      />
      <Suspense fallback={<p className="text-ink-3">Loading form…</p>}>
        <Gate />
      </Suspense>
    </>
  );
}

async function Gate() {
  await requireContext();
  return <MaterialForm material={null} action={saveMaterialAction} />;
}
