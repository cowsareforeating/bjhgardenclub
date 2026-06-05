import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// ============================================================================
// useClubVitality
// ----------------------------------------------------------------------------
// A 0..1 measure of how alive the club feels right now, derived from recent
// care activity. Each care session contributes a recency-weighted amount that
// decays with a half-life — a session today counts ~2× one from HALF_LIFE days
// ago — and the summed "activity mass" is squashed into 0..1 by a saturating
// curve so the score climbs quickly out of dormancy but tapers near the top.
//
// Tuning lives in the three constants below; nudge SATURATION to set how much
// activity reads as "lush", and HALF_LIFE_DAYS for how fast a quiet stretch
// drains it. Fetched once on mount — matches the app's no-websockets stance.
// ============================================================================

const WINDOW_DAYS = 30; // ignore anything older; it no longer reflects "now"
const HALF_LIFE_DAYS = 8; // recent care matters much more than last month's
const SATURATION = 4; // weighted mass at which vitality ≈ 0.5
const FLOOR = 0.08; // keep a sprout or two alive even in a silent club

const DAY_MS = 86_400_000;

export function useClubVitality(): number {
  // Gentle starting value so the header isn't bare for the first frame.
  const [vitality, setVitality] = useState(0.5);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();
      const { data, error } = await supabase
        .from('care_sessions')
        .select('performed_at')
        .gte('performed_at', since);

      if (cancelled || error || !data) return;

      const now = Date.now();
      const lambda = Math.LN2 / (HALF_LIFE_DAYS * DAY_MS); // decay rate from half-life
      let mass = 0;
      for (const s of data) {
        const age = now - new Date(s.performed_at).getTime();
        if (age < 0) continue; // ignore future-dated entries
        mass += Math.exp(-lambda * age);
      }

      // Saturating map: mass → 0..1, =0.5 at mass === SATURATION.
      const v = mass / (mass + SATURATION);
      if (!cancelled) setVitality(Math.max(FLOOR, v));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return vitality;
}
