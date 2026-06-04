-- =============================================================================
-- Shared care sessions — participants + concurrency-safe find-or-create
--
--   Decouples "care delivered" (a session = one bed × one occasion) from
--   "participation" (the people on it). Many people → one session → a face pile.
--
--   - care_session_participants: who joined a session (self-join only; toggle).
--   - log_care(): the logging entry point. Within a per-bed advisory lock it
--     looks for a session on the same bed within ±4h and either reuses it or
--     creates a new one, then adds the caller as a participant. The lock makes
--     concurrent event-day logging converge (no duplicate sessions) while still
--     honoring an explicit "log separately" (p_force_new = true).
--
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PARTICIPANTS
-- -----------------------------------------------------------------------------
create table if not exists public.care_session_participants (
  session_id uuid        not null references public.care_sessions(id) on delete cascade,
  user_id    uuid        not null default auth.uid()
                         references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists idx_care_session_participants_session
  on public.care_session_participants(session_id);

alter table public.care_session_participants enable row level security;

grant select         on public.care_session_participants to anon, authenticated;
grant insert, delete on public.care_session_participants to authenticated;

drop policy if exists "csp read" on public.care_session_participants;
create policy "csp read"
  on public.care_session_participants for select
  to anon, authenticated using (true);

-- You may only add/remove YOURSELF (self-join + un-join).
drop policy if exists "csp join self" on public.care_session_participants;
create policy "csp join self"
  on public.care_session_participants for insert
  to authenticated with check (user_id = auth.uid());

drop policy if exists "csp leave self" on public.care_session_participants;
create policy "csp leave self"
  on public.care_session_participants for delete
  to authenticated using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 2. FIND-OR-CREATE LOGGING RPC
--    Returns { session_id, created }. Runs as the caller (SECURITY INVOKER),
--    so all existing care_sessions RLS still applies.
-- -----------------------------------------------------------------------------
create or replace function public.log_care(
  p_bed          uuid,
  p_performed_at timestamptz default now(),
  p_force_new    boolean     default false
)
returns json
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session uuid;
  v_created boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in to log care';
  end if;

  -- Serialize concurrent logging for THIS bed only, so the look-then-insert
  -- below is atomic (released automatically at end of the transaction).
  perform pg_advisory_xact_lock(hashtextextended(p_bed::text, 0));

  -- Unless the user explicitly chose "log separately", reuse a session on the
  -- same bed within ±4 hours.
  if not p_force_new then
    select id into v_session
    from public.care_sessions
    where tree_bed_id = p_bed
      and performed_at between p_performed_at - interval '4 hours'
                           and p_performed_at + interval '4 hours'
    order by performed_at desc
    limit 1;
  end if;

  if v_session is null then
    insert into public.care_sessions (tree_bed_id, performed_at)
    values (p_bed, p_performed_at)
    returning id into v_session;
    v_created := true;
  end if;

  -- Add the caller to the face pile (idempotent).
  insert into public.care_session_participants (session_id, user_id)
  values (v_session, auth.uid())
  on conflict do nothing;

  return json_build_object('session_id', v_session, 'created', v_created);
end;
$$;

grant execute on function public.log_care(uuid, timestamptz, boolean) to authenticated;
