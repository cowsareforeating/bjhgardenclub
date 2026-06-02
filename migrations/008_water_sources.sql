-- =============================================================================
-- Water sources
--   Spigots / hydrants the Garden Club uses to water beds. These are NOT tree
--   beds (no species, no care schedule), so they live in their own table with
--   their own fields:
--     - is_working       : working (true) vs dry/broken (false)
--     - status_checked_at : when that status was last confirmed → "dry as of …"
--     - notes            : free text (access notes, etc.)
--
--   RLS mirrors tree_beds after migration 005: anyone reads, any signed-in user
--   may add / edit / delete. Audit + updated_at handled by the same helpers the
--   rest of the schema uses.
--
-- Safe to re-run; if-not-exists / drop-if-exists everywhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLE
-- -----------------------------------------------------------------------------
create table if not exists public.water_sources (
  id                uuid             primary key default gen_random_uuid(),
  name              text,
  latitude          double precision not null,
  longitude         double precision not null,
  address           text,
  is_working        boolean          not null default true,
  status_checked_at timestamptz      not null default now(),
  notes             text,
  created_by        uuid             default auth.uid()
                                     references auth.users(id) on delete set null,
  created_at        timestamptz      not null default now(),
  updated_at        timestamptz      not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. PRIVILEGES + RLS  (mirror tree_beds: anyone reads, any signed-in writes)
-- -----------------------------------------------------------------------------
alter table public.water_sources enable row level security;

grant select                         on public.water_sources to anon, authenticated;
grant insert, update, delete         on public.water_sources to authenticated;

drop policy if exists "water_sources read" on public.water_sources;
create policy "water_sources read"
  on public.water_sources for select
  using (true);

drop policy if exists "water_sources insert signed in" on public.water_sources;
create policy "water_sources insert signed in"
  on public.water_sources for insert to authenticated
  with check (true);

drop policy if exists "water_sources update signed in" on public.water_sources;
create policy "water_sources update signed in"
  on public.water_sources for update to authenticated
  using (true) with check (true);

drop policy if exists "water_sources delete signed in" on public.water_sources;
create policy "water_sources delete signed in"
  on public.water_sources for delete to authenticated
  using (true);

-- -----------------------------------------------------------------------------
-- 3. updated_at  (self-contained trigger, so this migration has no hidden deps)
-- -----------------------------------------------------------------------------
create or replace function public.water_sources_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_water_sources_updated_at on public.water_sources;
create trigger trg_water_sources_updated_at
  before update on public.water_sources
  for each row execute function public.water_sources_set_updated_at();

-- -----------------------------------------------------------------------------
-- 4. AUDIT  (reuse the standard write_audit_log() used by the other tables)
-- -----------------------------------------------------------------------------
drop trigger if exists trg_audit_water_sources on public.water_sources;
create trigger trg_audit_water_sources
  after insert or update or delete on public.water_sources
  for each row execute function public.write_audit_log();
