import { useEffect, useState } from 'react';
import { DEFAULT_CENTER } from './mapDefaults';
import { supabase } from './supabase';

// ============================================================================
// Rain-as-watering credit
// ----------------------------------------------------------------------------
// Sufficiently heavy/sustained rain counts as a watering, which pushes back
// `careUrgency`'s anchor date (see markerIcons.ts). Detection talks only to
// Open-Meteo's free, keyless API; once a qualifying day is found it's
// persisted to the `rain_events` table so it survives indefinitely — see the
// "Persistence" note below for why that's necessary.
//
// Thresholds (validated against 2024–2026 historical rain for the club's
// neighborhood — see project notes):
//   - a single day >= 20mm (~0.8in) resets on its own
//   - a trailing 3-day sum >= 25mm (~1in) resets, as long as at least one of
//     those days clears the trace floor (filters out dew/mist noise)
// `rain_sum` (not `precipitation_sum`) is used deliberately — it excludes
// snow water-equivalent, so a snowstorm never counts as a watering.
//
// Data source: the archive/reanalysis endpoint (`archive-api.open-meteo.com`),
// not the forecast endpoint's `past_days` window. The forecast endpoint's
// recent-day numbers are provisional model output and can badly understate
// actual rainfall for localized summer convective storms (observed: a day
// with 37mm of measured rain reported as 2.9mm by the forecast endpoint) —
// real qualifying storms were silently missed. The archive endpoint is
// queried with explicit `start_date`/`end_date` so the window is always
// today-and-earlier; it never includes forecast days the way an unbounded
// `past_days` query on the forecast endpoint does.
//
// Persistence: only a small trailing window is queried (see
// `fetchLastSufficientRain`), so a qualifying day naturally ages out of the
// API response after a few days. A real logged care session doesn't "expire"
// like that — it stays the anchor until a newer session supersedes it — so
// once a qualifying rain day is found, it's upserted into `rain_events` and
// treated the same way from then on: it remains the credited rain event
// until a *newer* qualifying rain day or a real care session comes along,
// not just until it scrolls out of the API's lookback window.
//
// Call budget: both the Open-Meteo check and the `rain_events` read happen at
// most once per local day per browser (gated by the `localStorage` cache
// below) — repeat visits/tabs on the same day cost nothing. Writes to
// `rain_events` are rarer still: only on the day a qualifying event is first
// detected, and they're idempotent (`upsert` + `date` as the primary key), so
// a retry from another tab or another member's browser is a no-op.
// ============================================================================

const RAIN_TRACE_FLOOR_MM = 2.5;
const RAIN_SUFFICIENT_SINGLE_DAY_MM = 20;
const RAIN_SUFFICIENT_3DAY_MM = 25;

/** Trailing days (before today) fetched from the archive endpoint. */
const LOOKBACK_DAYS = 3;

const CACHE_KEY = 'bjh-rain-cache-v1';

export interface LastSufficientRain {
  /** YYYY-MM-DD, local to the club's timezone. */
  date: string;
  /** That day's own rain total, mm. */
  mm: number;
}

interface DailyRain {
  date: string;
  mm: number;
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, delta: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

/**
 * Hybrid reset rule: most recent day that is either a sufficient single-day
 * rain, or the last day of a sufficient trailing 3-day accumulation.
 */
function lastSufficientRain(daily: DailyRain[]): LastSufficientRain | null {
  for (let i = daily.length - 1; i >= 0; i--) {
    const window = daily.slice(Math.max(0, i - 2), i + 1);
    const windowSum = window.reduce((sum, d) => sum + d.mm, 0);
    const hasTraceDay = window.some((d) => d.mm >= RAIN_TRACE_FLOOR_MM);
    const singleDayHit = daily[i].mm >= RAIN_SUFFICIENT_SINGLE_DAY_MM;
    const threeDayHit = windowSum >= RAIN_SUFFICIENT_3DAY_MM && hasTraceDay;
    if (singleDayHit || threeDayHit) {
      return { date: daily[i].date, mm: daily[i].mm };
    }
  }
  return null;
}

interface RainCache {
  fetchedOn: string; // local date string, so we only hit the API once/day
  lastRain: LastSufficientRain | null;
}

function readCache(): RainCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RainCache) : null;
  } catch {
    return null;
  }
}

function writeCache(cache: RainCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full/unavailable — non-fatal, just means we re-fetch next load.
  }
}

/** Whichever rain event happened later; either side may be null. */
function moreRecentRain(
  a: LastSufficientRain | null,
  b: LastSufficientRain | null
): LastSufficientRain | null {
  if (!a) return b;
  if (!b) return a;
  return b.date > a.date ? b : a;
}

async function fetchLastSufficientRain(): Promise<LastSufficientRain | null> {
  const [lat, lon] = DEFAULT_CENTER as [number, number];
  const today = new Date();
  const startDate = localDateStr(addDays(today, -LOOKBACK_DAYS));
  const endDate = localDateStr(today);
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&daily=rain_sum&start_date=${startDate}&end_date=${endDate}&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
  const body = await res.json();
  const dates: string[] = body?.daily?.time ?? [];
  const sums: number[] = body?.daily?.rain_sum ?? [];
  const daily: DailyRain[] = dates.map((date, i) => ({ date, mm: sums[i] ?? 0 }));
  return lastSufficientRain(daily);
}

/** Most recent persisted qualifying rain day, if any (see migration 015). */
async function fetchPersistedRain(): Promise<LastSufficientRain | null> {
  const { data, error } = await supabase
    .from('rain_events')
    .select('date, mm')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { date: data.date, mm: data.mm } : null;
}

/** Idempotent — `date` is the primary key, so a duplicate detection is a no-op. */
async function persistRainEvent(event: LastSufficientRain): Promise<void> {
  const { error } = await supabase
    .from('rain_events')
    .upsert(event, { onConflict: 'date', ignoreDuplicates: true });
  if (error) throw error;
}

/**
 * Recent-rain lookup, cached once per local day so repeat visits/tabs don't
 * refetch — same-day loads after the first are a pure `localStorage` read,
 * no network at all. On a cache miss, the `rain_events` table and Open-Meteo
 * are checked once each (in parallel) and merged with whatever was already
 * known, keeping the most recent qualifying day any of the three has seen
 * (see `moreRecentRain`) rather than overwriting it with a possibly-empty
 * fresh window. Fails open (falls back to whatever's still known) on any
 * individual lookup's error — rain credit is a nice-to-have, never a
 * blocker.
 */
export function useRecentRain(): { lastRain: LastSufficientRain | null; loading: boolean } {
  const [lastRain, setLastRain] = useState<LastSufficientRain | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = localDateStr(new Date());
    const cached = readCache();
    if (cached && cached.fetchedOn === today) {
      setLastRain(cached.lastRain);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [dbResult, apiResult] = await Promise.allSettled([
        fetchPersistedRain(),
        fetchLastSufficientRain()
      ]);
      if (cancelled) return;

      if (dbResult.status === 'rejected') {
        console.warn('Rain DB lookup failed (non-fatal)', dbResult.reason);
      }
      if (apiResult.status === 'rejected') {
        console.warn('Rain API lookup failed (non-fatal)', apiResult.reason);
      }
      const dbRain = dbResult.status === 'fulfilled' ? dbResult.value : null;
      const freshRain = apiResult.status === 'fulfilled' ? apiResult.value : null;

      const merged = moreRecentRain(moreRecentRain(cached?.lastRain ?? null, dbRain), freshRain);
      setLastRain(merged);
      setLoading(false);
      writeCache({ fetchedOn: today, lastRain: merged });

      // Newly-detected qualifying day the table doesn't have yet — persist it
      // so it outlives Open-Meteo's lookback window. Fire-and-forget: on
      // failure (e.g. an anonymous, unauthenticated visitor — inserts require
      // sign-in), the same day's window keeps surfacing it on every load
      // until some signed-in member's browser succeeds in writing it.
      if (freshRain && (!dbRain || freshRain.date > dbRain.date)) {
        persistRainEvent(freshRain).catch((err) =>
          console.warn('Rain persist failed (non-fatal, will retry)', err)
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { lastRain, loading };
}
