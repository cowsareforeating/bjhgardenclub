import { useEffect, useState } from 'react';
import { DEFAULT_CENTER } from './mapDefaults';

// ============================================================================
// Rain-as-watering credit
// ----------------------------------------------------------------------------
// Sufficiently heavy/sustained rain counts as a watering, which pushes back
// `careUrgency`'s anchor date (see markerIcons.ts). This module is entirely
// client-side and talks only to Open-Meteo's free, keyless API — it never
// touches Supabase, so it adds zero load there.
//
// Thresholds (validated against 2024–2026 historical rain for the club's
// neighborhood — see project notes):
//   - a single day >= 20mm (~0.8in) resets on its own
//   - a trailing 3-day sum >= 25mm (~1in) resets, as long as at least one of
//     those days clears the trace floor (filters out dew/mist noise)
// `rain_sum` (not `precipitation_sum`) is used deliberately — it excludes
// snow water-equivalent, so a snowstorm never counts as a watering.
// ============================================================================

const RAIN_TRACE_FLOOR_MM = 2.5;
const RAIN_SUFFICIENT_SINGLE_DAY_MM = 20;
const RAIN_SUFFICIENT_3DAY_MM = 25;

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

async function fetchLastSufficientRain(): Promise<LastSufficientRain | null> {
  const [lat, lon] = DEFAULT_CENTER as [number, number];
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=rain_sum&past_days=3&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const body = await res.json();
  const dates: string[] = body?.daily?.time ?? [];
  const sums: number[] = body?.daily?.rain_sum ?? [];
  const daily: DailyRain[] = dates.map((date, i) => ({ date, mm: sums[i] ?? 0 }));
  return lastSufficientRain(daily);
}

/**
 * Recent-rain lookup, cached once per local day so repeat visits/tabs don't
 * refetch. Fails open (returns null) on any network error — rain credit is a
 * nice-to-have, never a blocker.
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
      try {
        const result = await fetchLastSufficientRain();
        if (cancelled) return;
        setLastRain(result);
        writeCache({ fetchedOn: today, lastRain: result });
      } catch (err) {
        console.warn('Rain lookup failed (non-fatal)', err);
        if (!cancelled) setLastRain(cached?.lastRain ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { lastRain, loading };
}
