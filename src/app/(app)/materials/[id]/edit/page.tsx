import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MaterialForm } from "@/components/material-form";
import { PageHeader } from "@/components/ui";
import { saveMaterialAction } from "@/server/actions";
import { requireContext } from "@/server/context";

export const metadata = { title: "Edit material" };

export default function EditMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-3">Loading material…</p>}>
      <EditContent params={params} />
    </Suspense>
  );
}

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo } = await requireContext();
  const material = await repo.getMaterial(id);
  if (!material) notFound();
  return (
    <>
      <PageHeader
        kicker={<Link href={`/materials/${material.id}`} className="hover:text-copper">{material.name}</Link>}
        title="Edit material profile"
        lede="Changes are validated and recorded in the activity log. Saved matching runs keep the snapshot they were computed from."
      />
      <MaterialForm material={material} action={saveMaterialAction} />
    </>
  );
}
