-- =============================================================================
-- Enable editing & deleting tree beds
--   The app previously only inserted/read beds, so there may be no UPDATE/DELETE
--   RLS policies. This adds them (creator OR admin), plus a delete policy on the
--   type-assignment junction so edits can reconcile types, and makes the child
--   FKs cascade so deleting a bed cleans up its care sessions + type rows.
-- Safe to re-run; uses drop-if-exists / lookup-by-name everywhere.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. RLS: a bed's creator (or any admin) may UPDATE / DELETE it
-- -----------------------------------------------------------------------------
grant update, delete on public.tree_beds to authenticated;

drop policy if exists "tree_beds update own or admin" on public.tree_beds;
create policy "tree_beds update own or admin"
  on public.tree_beds for update to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    created_by = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

drop policy if exists "tree_beds delete own or admin" on public.tree_beds;
create policy "tree_beds delete own or admin"
  on public.tree_beds for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );


-- -----------------------------------------------------------------------------
-- 2. RLS: reconcile type assignments when editing (insert + delete via bed)
-- -----------------------------------------------------------------------------
grant insert, delete on public.tree_bed_type_assignments to authenticated;

drop policy if exists "tba write via bed owner" on public.tree_bed_type_assignments;
create policy "tba write via bed owner"
  on public.tree_bed_type_assignments for insert to authenticated
  with check (
    exists (
      select 1 from public.tree_beds b
      where b.id = tree_bed_id
        and (b.created_by = auth.uid()
             or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
    )
  );

drop policy if exists "tba delete via bed owner" on public.tree_bed_type_assignments;
create policy "tba delete via bed owner"
  on public.tree_bed_type_assignments for delete to authenticated
  using (
    exists (
      select 1 from public.tree_beds b
      where b.id = tree_bed_id
        and (b.created_by = auth.uid()
             or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
    )
  );


-- -----------------------------------------------------------------------------
-- 3. Cascade child rows on bed deletion (cascade bypasses child RLS, so a bed
--    delete cleanly removes its care sessions + type rows). Looks up the
--    existing FK by referenced table so it works whatever the constraint name.
-- -----------------------------------------------------------------------------
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.care_sessions'::regclass
     and contype = 'f'
     and confrelid = 'public.tree_beds'::regclass
   limit 1;
  if c is not null then
    execute format('alter table public.care_sessions drop constraint %I', c);
  end if;
  alter table public.care_sessions
    add constraint care_sessions_tree_bed_id_fkey
    foreign key (tree_bed_id) references public.tree_beds(id) on delete cascade;
end $$;

do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.tree_bed_type_assignments'::regclass
     and contype = 'f'
     and confrelid = 'public.tree_beds'::regclass
   limit 1;
  if c is not null then
    execute format('alter table public.tree_bed_type_assignments drop constraint %I', c);
  end if;
  alter table public.tree_bed_type_assignments
    add constraint tree_bed_type_assignments_tree_bed_id_fkey
    foreign key (tree_bed_id) references public.tree_beds(id) on delete cascade;
end $$;
