-- =============================================================================
-- Profile alias + avatar
--   - profiles.alias       : optional display name shown instead of email.
--   - profiles.avatar_path : path inside the `avatars` storage bucket (or null).
--   - Users may edit their OWN alias/avatar, but NOT their role — a BEFORE UPDATE
--     trigger reverts any role change made by a non-admin (RLS can't gate a
--     single column).
--   - public_profiles view exposes ONLY id/alias/avatar_path so the app can show
--     who logged a care session without leaking everyone's email.
--   - `avatars` storage bucket: public read; each user may only write under their
--     own `{uid}/…` folder.
--
-- Safe to re-run; if-not-exists / drop-if-exists / create-or-replace everywhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. COLUMNS
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='alias') then
    alter table public.profiles add column alias text;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='avatar_path') then
    alter table public.profiles add column avatar_path text;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. RLS: a user may update their own profile row
-- -----------------------------------------------------------------------------
grant update on public.profiles to authenticated;

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Prevent self role-escalation: a non-admin can't change their own role. (RLS
-- WITH CHECK can't see OLD, so enforce it here.)
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_role on public.profiles;
create trigger trg_profiles_guard_role
  before update on public.profiles
  for each row execute function public.profiles_guard_role();

-- -----------------------------------------------------------------------------
-- 3. PUBLIC VIEW — only safe display fields, readable by anyone
-- -----------------------------------------------------------------------------
create or replace view public.public_profiles as
  select id, alias, avatar_path from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. STORAGE bucket `avatars`
--    Public read so <img src=publicUrl> works; writes limited to the owner's
--    own `{uid}/…` folder. 2 MB cap (we downscale client-side well below this).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true,
  2 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

-- Owner-only write: the first path segment must equal the user's uid.
drop policy if exists "avatars: owner write" on storage.objects;
create policy "avatars: owner write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: owner update" on storage.objects;
create policy "avatars: owner update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars: owner delete" on storage.objects;
create policy "avatars: owner delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
