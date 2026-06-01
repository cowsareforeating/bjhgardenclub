-- =============================================================================
-- Tree species
--   - New lookup table `tree_species` (free-form, community-editable).
--   - tree_beds gets a nullable `species_id` (one species per bed).
--   - Beds reference species by id, so RENAMING a species updates every bed
--     automatically (no denormalised copies).
--   - ON DELETE RESTRICT: a species can only be deleted when no bed uses it
--     ("deletable if there are no members").
--   - RLS: anyone can read; any signed-in user can add / rename / delete.
-- Safe to re-run; uses if-not-exists / drop-if-exists everywhere.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. LOOKUP: tree_species
-- -----------------------------------------------------------------------------
create table if not exists public.tree_species (
  id         bigint generated always as identity primary key,
  name       text        not null,
  created_at timestamptz not null default now(),
  created_by uuid        default auth.uid() references auth.users(id) on delete set null
);

-- Case-insensitive uniqueness so "Red Maple" and "red maple" can't both exist.
create unique index if not exists tree_species_name_lower_key
  on public.tree_species (lower(name));


-- -----------------------------------------------------------------------------
-- 2. tree_beds.species_id  (one species per bed, optional)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tree_beds'
      and column_name = 'species_id'
  ) then
    alter table public.tree_beds
      add column species_id bigint
        references public.tree_species(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_tree_beds_species
  on public.tree_beds(species_id);


-- -----------------------------------------------------------------------------
-- 3. Privileges + RLS
-- -----------------------------------------------------------------------------
alter table public.tree_species enable row level security;

grant select on public.tree_species to anon, authenticated;
grant insert, update, delete on public.tree_species to authenticated;

-- Anyone (incl. logged-out) can read the species list.
drop policy if exists "tree_species read" on public.tree_species;
create policy "tree_species read"
  on public.tree_species for select
  using (true);

-- Any signed-in user can add a species.
drop policy if exists "tree_species insert" on public.tree_species;
create policy "tree_species insert"
  on public.tree_species for insert to authenticated
  with check (auth.uid() is not null);

-- Any signed-in user can rename a species (updates all beds via the FK).
drop policy if exists "tree_species update" on public.tree_species;
create policy "tree_species update"
  on public.tree_species for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Any signed-in user can delete a species. The ON DELETE RESTRICT FK above
-- blocks deletion while any bed still references it, so this can never orphan.
drop policy if exists "tree_species delete" on public.tree_species;
create policy "tree_species delete"
  on public.tree_species for delete to authenticated
  using (auth.uid() is not null);
