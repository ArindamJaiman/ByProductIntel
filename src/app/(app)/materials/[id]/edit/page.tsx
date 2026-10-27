import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MaterialForm } from "@/components/material-form";
import { EmptyState, PageHeader } from "@/components/ui";
import { saveMaterialAction } from "@/server/actions";
import { canEditMaterial, requireContext } from "@/server/context";

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
  const ctx = await requireContext();
  const material = await ctx.repo.getMaterial(id);
  if (!material) notFound();
  const editable = canEditMaterial(ctx, material);
  return (
    <>
      <PageHeader
        kicker={<Link href={`/materials/${material.id}`} className="hover:text-copper">{material.name}</Link>}
        title="Edit material profile"
        lede="Changes are validated and recorded in the activity log. Saved matching runs keep the snapshot they were computed from."
      />
      {editable ? (
        <MaterialForm material={material} action={saveMaterialAction} />
      ) : (
        <EmptyState title="This material is read-only for your organisation">
          It is shared by another organisation, so only they can change it.{" "}
          <Link href="/materials/new" className="text-copper underline">Add your own material</Link> to edit values or read lab reports into it.
        </EmptyState>
      )}
    </>
  );
}
