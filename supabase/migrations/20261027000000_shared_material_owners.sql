-- Signed-in users can already read materials that other organisations share.
-- Let them also read the name of the organisation that owns each shared
-- material, so portfolio, pooling and passport views can say whose it is.
-- Organisations with no shared materials stay invisible to other users.
create index if not exists byproduct_materials_shared_owner_idx
  on public.byproduct_materials (organisation_id) where visibility = 'shared';

create policy "read owners of shared materials" on public.organisations for select to authenticated
  using (exists (
    select 1 from public.byproduct_materials m
    where m.organisation_id = organisations.id and m.visibility = 'shared'
  ));
