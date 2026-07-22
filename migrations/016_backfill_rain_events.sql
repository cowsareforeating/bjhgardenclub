-- =============================================================================
-- Backfill rain_events
--   Detection (src/lib/rain.ts) originally read Open-Meteo's *forecast*
--   endpoint's `past_days` window for recent rain, whose recent-day numbers
--   are provisional model output — not the reanalysis/measured totals. For
--   localized summer storms it badly understated actual rainfall (e.g. a
--   37.2mm day reported as 2.9mm), so real qualifying rain days were never
--   detected or persisted. That's now fixed to query the archive/reanalysis
--   endpoint instead.
--
--   This backfills the days that were missed between the rain-credit
--   feature's launch (2026-07-05) and the day before this migration was
--   authored (2026-07-21), computed with the same thresholds as rain.ts
--   (single day >= 20mm, or trailing 3-day sum >= 25mm with a >= 2.5mm trace
--   day) against Open-Meteo's archive endpoint. Today (2026-07-22 at
--   authoring time) is deliberately excluded — its rain total isn't final
--   yet, and the now-fixed live app will pick it up on its own once it
--   qualifies.
--
-- Safe to re-run: `date` is the primary key, insert is a no-op on conflict.
-- =============================================================================

insert into public.rain_events (date, mm) values
  ('2026-07-06', 49.4),
  ('2026-07-07', 2.2),
  ('2026-07-08', 0.0),
  ('2026-07-18', 37.2),
  ('2026-07-19', 2.4),
  ('2026-07-20', 0.0),
  ('2026-07-21', 24.8)
on conflict (date) do nothing;
