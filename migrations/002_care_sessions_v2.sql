-- =============================================================================
-- Care sessions v2
--   - One care session can have MULTIPLE activities (was single FK)
--   - One care session can have MULTIPLE uploaded photos (new)
--   - Photos live in Supabase Storage bucket `care-photos` (public read)
-- Safe to re-run; uses if-not-exists / drop-if-exists everywhere.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. JUNCTION: care_session  <->  activity_type
-- -----------------------------------------------------------------------------
create table if not exists public.care_session_activities (
  care_session_id  uuid        not null references public.care_sessions(id)  on delete cascade,
  activity_type_id bigint      not null references public.activity_types(id) on delete restrict,
  created_at       timestamptz not null default now(),
  primary key (care_session_id, activity_type_id)
);

create index if not exists idx_care_session_activities_activity
  on public.care_session_activities(activity_type_id);

-- Backfill from the old single-FK column, then drop it (only if it still exists).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'care_sessions'
      and column_name = 'activity_type_id'
  ) then
    insert into public.care_session_activities (care_session_id, activity_type_id)
    select id, activity_type_id
    from public.care_sessions
    where activity_type_id is not null
    on conflict do nothing;

    alter table public.care_sessions drop column activity_type_id;
  end if;
end$$;


-- -----------------------------------------------------------------------------
-- 2. PHOTOS  (one row per uploaded image)
--    `storage_path` is the path inside the `care-photos` bucket.
-- -----------------------------------------------------------------------------
create table if not exists public.care_session_photos (
  id              bigint      generated always as identity primary key,
  care_session_id uuid        not null references public.care_sessions(id) on delete cascade,
  storage_path    text        not null,
  width           int,
  height          int,
  created_by      uuid        default auth.uid()
                              references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_care_session_photos_session
  on public.care_session_photos(care_session_id);


-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
alter table public.care_session_activities enable row level security;
alter table public.care_session_photos     enable row level security;

-- ---- activities junction ---------------------------------------------------
drop policy if exists "care_session_activities: anyone read" on public.care_session_activities;
create policy "care_session_activities: anyone read"
  on public.care_session_activities for select
  to anon, authenticated
  using (true);

drop policy if exists "care_session_activities: owner or admin insert" on public.care_session_activities;
create policy "care_session_activities: owner or admin insert"
  on public.care_session_activities for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.care_sessions s
      where s.id = care_session_id and s.created_by = auth.uid()
    )
  );

drop policy if exists "care_session_activities: owner or admin delete" on public.care_session_activities;
create policy "care_session_activities: owner or admin delete"
  on public.care_session_activities for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.care_sessions s
      where s.id = care_session_id and s.created_by = auth.uid()
    )
  );

-- ---- photos -----------------------------------------------------------------
drop policy if exists "care_session_photos: anyone read" on public.care_session_photos;
create policy "care_session_photos: anyone read"
  on public.care_session_photos for select
  to anon, authenticated
  using (true);

drop policy if exists "care_session_photos: owner or admin insert" on public.care_session_photos;
create policy "care_session_photos: owner or admin insert"
  on public.care_session_photos for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.care_sessions s
      where s.id = care_session_id and s.created_by = auth.uid()
    )
  );

drop policy if exists "care_session_photos: owner or admin delete" on public.care_session_photos;
create policy "care_session_photos: owner or admin delete"
  on public.care_session_photos for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.care_sessions s
      where s.id = care_session_id and s.created_by = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 4. GRANTS
-- -----------------------------------------------------------------------------
grant select                  on public.care_session_activities to anon;
grant select, insert, delete  on public.care_session_activities to authenticated;

grant select                  on public.care_session_photos to anon;
grant select, insert, delete  on public.care_session_photos to authenticated;


-- -----------------------------------------------------------------------------
-- 5. AUDIT triggers
-- -----------------------------------------------------------------------------

-- Junction has no scalar `id`; key audit rows by care_session_id.
create or replace function public.audit_care_session_activities()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    values (tg_table_name, old.care_session_id::text, 'delete', auth.uid(), to_jsonb(old), null);
    return old;
  elsif (tg_op = 'INSERT') then
    insert into public.audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    values (tg_table_name, new.care_session_id::text, 'insert', auth.uid(), null, to_jsonb(new));
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_audit_care_session_activities on public.care_session_activities;
create trigger trg_audit_care_session_activities
  after insert or delete on public.care_session_activities
  for each row execute function public.audit_care_session_activities();

-- Photos has an `id`; reuse the standard write_audit_log() defined in the
-- initial schema.
drop trigger if exists trg_audit_care_session_photos on public.care_session_photos;
create trigger trg_audit_care_session_photos
  after insert or update or delete on public.care_session_photos
  for each row execute function public.write_audit_log();


-- -----------------------------------------------------------------------------
-- 6. STORAGE bucket `care-photos`
--    Public read so the map app can render <img src=publicUrl>.
--    Uploads limited to authenticated users + image MIME types + 10 MB.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'care-photos',
  'care-photos',
  true,
  10 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
set public            = excluded.public,
    file_size_limit   = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "care-photos: public read" on storage.objects;
create policy "care-photos: public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'care-photos');

drop policy if exists "care-photos: authenticated upload" on storage.objects;
create policy "care-photos: authenticated upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'care-photos');

drop policy if exists "care-photos: owner or admin delete" on storage.objects;
create policy "care-photos: owner or admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'care-photos'
    and (owner = auth.uid() or public.is_admin())
  );


-- =============================================================================
-- DONE.  After running this:
--   - care_sessions no longer has activity_type_id
--   - create care_session_activities rows (M2M) when saving a session
--   - upload photos to storage:'care-photos', then insert care_session_photos
-- =============================================================================
