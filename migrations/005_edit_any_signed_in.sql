-- =============================================================================
-- Let any signed-in user edit/delete any tree bed
--   Relaxes the creator-or-admin restriction from migration 004 down to "any
--   authenticated user". Care-session edit/delete stays creator/admin (handled
--   in the app, not here). Safe to re-run.
-- =============================================================================

-- tree_beds: any signed-in user may UPDATE / DELETE
drop policy if exists "tree_beds update own or admin" on public.tree_beds;
drop policy if exists "tree_beds update signed in"    on public.tree_beds;
create policy "tree_beds update signed in"
  on public.tree_beds for update to authenticated
  using (true) with check (true);

drop policy if exists "tree_beds delete own or admin" on public.tree_beds;
drop policy if exists "tree_beds delete signed in"    on public.tree_beds;
create policy "tree_beds delete signed in"
  on public.tree_beds for delete to authenticated
  using (true);

-- tree_bed_type_assignments: any signed-in user may add/remove (for edits)
drop policy if exists "tba write via bed owner"  on public.tree_bed_type_assignments;
drop policy if exists "tba insert signed in"     on public.tree_bed_type_assignments;
create policy "tba insert signed in"
  on public.tree_bed_type_assignments for insert to authenticated
  with check (true);

drop policy if exists "tba delete via bed owner" on public.tree_bed_type_assignments;
drop policy if exists "tba delete signed in"     on public.tree_bed_type_assignments;
create policy "tba delete signed in"
  on public.tree_bed_type_assignments for delete to authenticated
  using (true);
