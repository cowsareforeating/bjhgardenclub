-- =============================================================================
-- Care-session emoji reactions
--   Slack-style: each user may toggle each emoji once per session, so the PK is
--   (care_session_id, user_id, emoji). Any emoji is allowed at the DB level; the
--   app offers a small palette. Anyone can read; a signed-in user may add/remove
--   only their own reactions.
-- Safe to re-run; if-not-exists / drop-if-exists everywhere.
-- =============================================================================

create table if not exists public.care_session_reactions (
  care_session_id uuid        not null references public.care_sessions(id) on delete cascade,
  user_id         uuid        not null default auth.uid()
                              references auth.users(id) on delete cascade,
  emoji           text        not null check (char_length(emoji) <= 16),
  created_at      timestamptz not null default now(),
  primary key (care_session_id, user_id, emoji)
);

create index if not exists idx_care_session_reactions_session
  on public.care_session_reactions(care_session_id);

alter table public.care_session_reactions enable row level security;

grant select         on public.care_session_reactions to anon, authenticated;
grant insert, delete on public.care_session_reactions to authenticated;

drop policy if exists "care_session_reactions read" on public.care_session_reactions;
create policy "care_session_reactions read"
  on public.care_session_reactions for select
  to anon, authenticated
  using (true);

drop policy if exists "care_session_reactions insert own" on public.care_session_reactions;
create policy "care_session_reactions insert own"
  on public.care_session_reactions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "care_session_reactions delete own" on public.care_session_reactions;
create policy "care_session_reactions delete own"
  on public.care_session_reactions for delete
  to authenticated
  using (user_id = auth.uid());
