-- One permissive SELECT policy per table and role, so reads evaluate a single
-- policy. Behaviour is unchanged.

-- Organisations: own organisation, plus owners of shared materials.
drop policy "read own organisation" on public.organisations;
drop policy "read owners of shared materials" on public.organisations;
create policy "read own organisation or owners of shared materials" on public.organisations for select to authenticated
  using (
    id = (select private.user_org_id())
    or exists (
      select 1 from public.byproduct_materials m
      where m.organisation_id = organisations.id and m.visibility = 'shared'
    )
  );

-- Material documents: the write policy covered SELECT too ("for all"); split it.
drop policy "write own material documents" on public.material_documents;
create policy "insert own material documents" on public.material_documents for insert to authenticated
  with check (status <> 'available_verified' and provenance <> 'verified_source'
    and exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())));
create policy "update own material documents" on public.material_documents for update to authenticated
  using (exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())))
  with check (status <> 'available_verified' and provenance <> 'verified_source'
    and exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())));
create policy "delete own material documents" on public.material_documents for delete to authenticated
  using (exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())));

-- Material measurements: same split.
drop policy "write own material measurements" on public.material_measurements;
create policy "insert own material measurements" on public.material_measurements for insert to authenticated
  with check (verification <> 'independently_verified' and provenance <> 'verified_source'
    and exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())));
create policy "update own material measurements" on public.material_measurements for update to authenticated
  using (exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())))
  with check (verification <> 'independently_verified' and provenance <> 'verified_source'
    and exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())));
create policy "delete own material measurements" on public.material_measurements for delete to authenticated
  using (exists (select 1 from public.byproduct_materials m where m.id = material_id and m.organisation_id = (select private.user_org_id())));
