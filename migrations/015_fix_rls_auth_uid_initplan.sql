-- Fix RLS auth.uid() init-plan re-evaluation, remove overly-broad policies,
-- consolidate duplicate permissive policies, drop unused indexes.
--
-- auth.uid() called bare in a policy USING/WITH CHECK expression is
-- re-evaluated once per row. Wrapping it in (select auth.uid()) makes
-- Postgres evaluate it once per query — same result, much cheaper at scale.
--
-- The "signed in" policies on tree_beds and tree_bed_type_assignments
-- allowed any authenticated user to mutate any row. They are superseded
-- by the stricter "owner or admin" policies and are removed here.

-- ============================================================
-- profiles
-- ============================================================
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "profiles: admin update" on public.profiles;
drop policy if exists "profiles: self or admin can read" on public.profiles;

create policy "profiles: self or admin can read" on public.profiles
  for select using ((id = (select auth.uid())) or is_admin());

create policy "profiles: self or admin update" on public.profiles
  for update
  using  ((id = (select auth.uid())) or is_admin())
  with check ((id = (select auth.uid())) or is_admin());

-- ============================================================
-- tree_beds
-- ============================================================
drop policy if exists "tree_beds delete signed in" on public.tree_beds;
drop policy if exists "tree_beds update signed in" on public.tree_beds;
drop policy if exists "tree_beds: authed insert as self" on public.tree_beds;
drop policy if exists "tree_beds: owner or admin update" on public.tree_beds;
drop policy if exists "tree_beds: owner or admin delete" on public.tree_beds;

create policy "tree_beds: authed insert as self" on public.tree_beds
  for insert with check (created_by = (select auth.uid()));

create policy "tree_beds: owner or admin update" on public.tree_beds
  for update
  using  ((created_by = (select auth.uid())) or is_admin())
  with check ((created_by = (select auth.uid())) or is_admin());

create policy "tree_beds: owner or admin delete" on public.tree_beds
  for delete using ((created_by = (select auth.uid())) or is_admin());

-- ============================================================
-- tree_bed_type_assignments
-- ============================================================
drop policy if exists "tba delete signed in" on public.tree_bed_type_assignments;
drop policy if exists "tba insert signed in" on public.tree_bed_type_assignments;
drop policy if exists "tree_bed_type_assignments: owner or admin insert" on public.tree_bed_type_assignments;
drop policy if exists "tree_bed_type_assignments: owner or admin delete" on public.tree_bed_type_assignments;

create policy "tree_bed_type_assignments: owner or admin insert" on public.tree_bed_type_assignments
  for insert with check (
    is_admin() or (exists (
      select 1 from public.tree_beds b
      where b.id = tree_bed_type_assignments.tree_bed_id
        and b.created_by = (select auth.uid())
    ))
  );

create policy "tree_bed_type_assignments: owner or admin delete" on public.tree_bed_type_assignments
  for delete using (
    is_admin() or (exists (
      select 1 from public.tree_beds b
      where b.id = tree_bed_type_assignments.tree_bed_id
        and b.created_by = (select auth.uid())
    ))
  );

-- ============================================================
-- care_sessions
-- ============================================================
drop policy if exists "care_sessions: authed insert as self" on public.care_sessions;
drop policy if exists "care_sessions: owner or admin update" on public.care_sessions;
drop policy if exists "care_sessions: owner or admin delete" on public.care_sessions;

create policy "care_sessions: authed insert as self" on public.care_sessions
  for insert with check (created_by = (select auth.uid()));

create policy "care_sessions: owner or admin update" on public.care_sessions
  for update
  using  ((created_by = (select auth.uid())) or is_admin())
  with check ((created_by = (select auth.uid())) or is_admin());

create policy "care_sessions: owner or admin delete" on public.care_sessions
  for delete using ((created_by = (select auth.uid())) or is_admin());

-- ============================================================
-- care_session_activities
-- ============================================================
drop policy if exists "care_session_activities: owner or admin insert" on public.care_session_activities;
drop policy if exists "care_session_activities: owner or admin delete" on public.care_session_activities;

create policy "care_session_activities: owner or admin insert" on public.care_session_activities
  for insert with check (
    is_admin() or (exists (
      select 1 from public.care_sessions s
      where s.id = care_session_activities.care_session_id
        and s.created_by = (select auth.uid())
    ))
  );

create policy "care_session_activities: owner or admin delete" on public.care_session_activities
  for delete using (
    is_admin() or (exists (
      select 1 from public.care_sessions s
      where s.id = care_session_activities.care_session_id
        and s.created_by = (select auth.uid())
    ))
  );

-- ============================================================
-- care_session_reactions
-- ============================================================
drop policy if exists "care_session_reactions insert own" on public.care_session_reactions;
drop policy if exists "care_session_reactions delete own" on public.care_session_reactions;

create policy "care_session_reactions insert own" on public.care_session_reactions
  for insert with check (user_id = (select auth.uid()));

create policy "care_session_reactions delete own" on public.care_session_reactions
  for delete using (user_id = (select auth.uid()));

-- ============================================================
-- care_session_participants
-- ============================================================
drop policy if exists "csp join self" on public.care_session_participants;
drop policy if exists "csp leave self" on public.care_session_participants;

create policy "csp join self" on public.care_session_participants
  for insert with check (user_id = (select auth.uid()));

create policy "csp leave self" on public.care_session_participants
  for delete using (user_id = (select auth.uid()));

-- ============================================================
-- care_session_photos
-- ============================================================
drop policy if exists "care_session_photos: anyone authenticated insert" on public.care_session_photos;
drop policy if exists "care_session_photos: contributor or session-owner or admin dele" on public.care_session_photos;

create policy "care_session_photos: anyone authenticated insert" on public.care_session_photos
  for insert with check (created_by = (select auth.uid()));

create policy "care_session_photos: contributor or session-owner or admin delete" on public.care_session_photos
  for delete using (
    (created_by = (select auth.uid()))
    or is_admin()
    or (exists (
      select 1 from public.care_sessions s
      where s.id = care_session_photos.care_session_id
        and s.created_by = (select auth.uid())
    ))
  );

-- ============================================================
-- tree_species
-- ============================================================
drop policy if exists "tree_species insert" on public.tree_species;
drop policy if exists "tree_species update" on public.tree_species;
drop policy if exists "tree_species delete" on public.tree_species;

create policy "tree_species insert" on public.tree_species
  for insert with check ((select auth.uid()) is not null);

create policy "tree_species update" on public.tree_species
  for update
  using  ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create policy "tree_species delete" on public.tree_species
  for delete using ((select auth.uid()) is not null);

-- ============================================================
-- Drop unused indexes
-- ============================================================
drop index if exists public.idx_audit_log_table_record;
drop index if exists public.idx_audit_log_changed_at;
drop index if exists public.idx_tree_beds_species;
drop index if exists public.idx_care_session_activities_activity;
