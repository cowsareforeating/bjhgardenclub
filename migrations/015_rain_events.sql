-- =============================================================================
-- Rain events
--   Persists days where rain was heavy/sustained enough to count as a
--   watering (see src/lib/rain.ts's thresholds). Open-Meteo's forecast API
--   only exposes a rolling few-day history, so once a qualifying day ages
--   out of that window the client loses all memory of it. This table is the
--   durable record so a qualifying day's watering credit survives
--   indefinitely — the same way a real logged care session would.
--
--   RLS: anyone reads (mirrors tree_beds); any signed-in member can record a
--   newly-detected qualifying day. `date` is the natural key and rows are
--   immutable once written (a past day's rain total doesn't change), so
--   inserts are idempotent (on conflict do nothing) and there's no
--   update/delete path.
--
-- Safe to re-run; if-not-exists / drop-if-exists everywhere.
-- =============================================================================

create table if not exists public.rain_events (
  date       date        primary key,
  mm         numeric     not null,
  created_at timestamptz not null default now()
);

alter table public.rain_events enable row level security;

grant select on public.rain_events to anon, authenticated;
grant insert on public.rain_events to authenticated;

drop policy if exists "rain_events read" on public.rain_events;
create policy "rain_events read"
  on public.rain_events for select
  using (true);

drop policy if exists "rain_events insert signed in" on public.rain_events;
create policy "rain_events insert signed in"
  on public.rain_events for insert to authenticated
  with check (true);
