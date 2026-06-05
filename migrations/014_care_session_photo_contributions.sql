-- =============================================================================
-- Contribute-a-photo
--   Lets ANY signed-in member add a photo to a care session — not just the
--   session's creator/admin (the old rule from 002). Photo contribution is
--   decoupled from session ownership:
--
--   - Anyone authenticated may insert a photo (recorded under their own uid).
--   - Adding a photo auto-joins the contributor to the session's face pile
--     (a trigger inserts into care_session_participants). Un-joining is just a
--     delete on that table and never touches photos, so a contributor's photos
--     outlive their participation.
--   - A contributor may delete THEIR OWN photos; the session creator/admin may
--     still delete any photo (unchanged for them).
--   - Editing the session itself (activities/notes/date) stays creator/admin —
--     this migration does not touch care_sessions RLS.
--
-- Safe to re-run; replaces named policies in place.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. PHOTO INSERT — any authenticated user, recorded under their own uid.
--    `created_by` defaults to auth.uid() (see 002), so the check just stops a
--    client from attributing a photo to someone else.
-- -----------------------------------------------------------------------------
drop policy if exists "care_session_photos: owner or admin insert" on public.care_session_photos;
drop policy if exists "care_session_photos: anyone authenticated insert" on public.care_session_photos;
create policy "care_session_photos: anyone authenticated insert"
  on public.care_session_photos for insert
  to authenticated
  with check (created_by = auth.uid());


-- -----------------------------------------------------------------------------
-- 2. PHOTO DELETE — your own photo, OR the session creator, OR an admin.
-- -----------------------------------------------------------------------------
drop policy if exists "care_session_photos: owner or admin delete" on public.care_session_photos;
drop policy if exists "care_session_photos: contributor or session-owner or admin delete" on public.care_session_photos;
create policy "care_session_photos: contributor or session-owner or admin delete"
  on public.care_session_photos for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.care_sessions s
      where s.id = care_session_id and s.created_by = auth.uid()
    )
  );


-- -----------------------------------------------------------------------------
-- 3. AUTO-JOIN — adding a photo adds the contributor to the face pile.
--    SECURITY DEFINER so the join lands regardless of which path inserted the
--    photo; idempotent via ON CONFLICT. created_by can be null (auth.users
--    delete sets it null) — skip those.
-- -----------------------------------------------------------------------------
create or replace function public.join_session_on_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.care_session_participants (session_id, user_id)
    values (new.care_session_id, new.created_by)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_join_session_on_photo on public.care_session_photos;
create trigger trg_join_session_on_photo
  after insert on public.care_session_photos
  for each row execute function public.join_session_on_photo();


-- =============================================================================
-- DONE. care_sessions RLS is intentionally unchanged: contributing a photo does
-- not grant edit rights on the session.
-- =============================================================================
