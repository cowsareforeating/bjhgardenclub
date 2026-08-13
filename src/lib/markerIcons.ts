import L from 'leaflet';
import { isTreeType, isPollinatorType } from './treeBedTypes';

// ============================================================================
// Care-urgency model
// ----------------------------------------------------------------------------
// The base interval is 28 days. Two multipliers adjust it — month-of-year +
// bed-type math:
//   * seasonal: shorter in summer, longer in winter
//   * type:     pollinator beds need water more often than plain trees
//
// Only watering sessions reset the clock (see `isWateringLabel` below) — other
// activities like weeding or mulching don't clear "needs water". A
// sufficiently heavy/sustained rain (see rain.ts) also counts as a watering —
// it can push the anchor date forward the same way a real watering session
// does, but never earlier than the last real watering or bed creation.
//
//   `careUrgency` returns a 0..1 score:
//       0   = freshly watered
//       0.5 = bed is at the start of the "needs water" window
//       1   = badly overdue (1.5× the effective interval)
//
// Pin rendering crossfades the normal pin into the alert pin as urgency rises,
// so the map shows a continuous gradient instead of a hard binary flip.
// ============================================================================

export const BASE_INTERVAL_DAYS = 28;

/** Threshold the Care page uses to decide what's "needing water" right now. */
export const NEEDS_WATER_URGENCY = 0.5;

/**
 * Whether an activity label counts as watering — the only activity type that
 * clears "needs water". Matches the same `/water/i` rule `activityIcons.tsx`
 * uses to pick the droplet icon, so "Watering", "Watered", etc. all count.
 */
export function isWateringLabel(label: string | null | undefined): boolean {
  return !!label && /water/i.test(label);
}

/**
 * Seasonal multiplier on the base care interval (northern hemisphere).
 *   Dec/Jan/Feb → 2.0× (winter — dormant, most beds don't need work)
 *   Jun/Jul/Aug → 0.5× (summer — water often, weeds explode)
 *   else        → 1.0× (spring + fall growing seasons)
 */
export function seasonalMultiplier(date: Date): number {
  switch (date.getMonth()) {
    case 11:
    case 0:
    case 1:
      return 2.0;
    case 5:
    case 6:
    case 7:
      return 0.5;
    default:
      return 1.0;
  }
}

/**
 * Type multiplier on the base care interval. Pollinator beds need attention
 * more often than plain street trees, so their interval is shorter. A bed that
 * is both tree + pollinator counts as a pollinator (the shorter interval wins).
 */
export const POLLINATOR_INTERVAL_FACTOR = 0.5;

function typeIntervalFactor(typeLabels: string[]): number {
  const hasPollinator = typeLabels.some((l) => l.toLowerCase().includes('pollinator'));
  return hasPollinator ? POLLINATOR_INTERVAL_FACTOR : 1.0;
}

/**
 * 0..1 urgency. Anchored to the most recent watering session, falling back to
 * the bed's `created_at` so a brand-new bed doesn't immediately show as red.
 * Callers are expected to pass only watering sessions (see `isWateringLabel`)
 * — other care activities don't move this anchor. `typeLabels` shortens the
 * interval for pollinator beds. `lastRainDate` (from `useRecentRain`) can push
 * the anchor forward too, but `Math.max` below means it never pre-dates a real
 * watering session or the bed's creation.
 */
export function careUrgency(
  createdAt: string,
  sessions: Array<{ performed_at: string }>,
  typeLabels: string[] = [],
  now: Date = new Date(),
  lastRainDate?: string | null
): number {
  const effectiveDays =
    BASE_INTERVAL_DAYS * seasonalMultiplier(now) * typeIntervalFactor(typeLabels);
  const careAnchorMs = sessions.length
    ? Math.max(...sessions.map((s) => new Date(s.performed_at).getTime()))
    : new Date(createdAt).getTime();
  const rainAnchorMs = lastRainDate ? new Date(lastRainDate).getTime() : 0;
  const anchorMs = Math.max(careAnchorMs, rainAnchorMs);
  const daysSince = (now.getTime() - anchorMs) / (1000 * 60 * 60 * 24);
  const ratio = daysSince / effectiveDays;
  // Hits max urgency at 1.5× the effective interval.
  return Math.max(0, Math.min(1, ratio / 1.5));
}

// ============================================================================
// Pin rendering
// ============================================================================

type PinKind = 'tree' | 'flower' | 'tree-flower';

function pinKind(typeLabels: string[]): PinKind {
  const hasTree = typeLabels.some(isTreeType);
  const hasPollinator = typeLabels.some(isPollinatorType);
  if (hasTree && hasPollinator) return 'tree-flower';
  if (hasPollinator) return 'flower';
  return 'tree';
}

const SIZE: [number, number] = [40, 50];
const ANCHOR: [number, number] = [20, 50]; // pin tip sits on the coord
const POPUP_OFFSET: [number, number] = [0, -46];

/**
 * Crossfading marker. The normal pin fades out and the alert pin fades in as
 * urgency moves 0 → 1. We keep a sliver of normal opacity even at peak urgency
 * so the silhouette stays consistent.
 *
 * The alert pin uses a sqrt curve rather than fading in linearly: at a linear
 * rate it sits at only 50% opacity right at `NEEDS_WATER_URGENCY`, so a bed
 * that just became "needs water" read as a washed-out blend instead of a
 * clearly flagged pin. Sqrt front-loads the ramp so the alert pin is already
 * prominent by the time a bed crosses that threshold.
 */
export function getBedMarker(typeLabels: string[], urgency: number): L.DivIcon {
  const kind = pinKind(typeLabels);
  const normalUrl = `/pins/wc-pin-${kind}.svg`;
  const alertUrl = `/pins/wc-pin-${kind}-needswater.svg`;
  const normalOpacity = Math.max(0.15, 1 - urgency).toFixed(3);
  const alertOpacity = Math.sqrt(urgency).toFixed(3);

  return L.divIcon({
    className: 'tb-pin',
    html:
      '<div class="tb-pin-inner">' +
      `<img src="${normalUrl}" alt="" style="opacity:${normalOpacity}" />` +
      `<img src="${alertUrl}" alt="" style="opacity:${alertOpacity}" />` +
      '</div>',
    iconSize: SIZE,
    iconAnchor: ANCHOR,
    popupAnchor: POPUP_OFFSET
  });
}

// ============================================================================
// Water-source pin
// ----------------------------------------------------------------------------
// Water sources are a separate entity (not beds), so they get a distinct marker
// that sits outside the care-urgency color model. A light-blue circle with a
// white Lucide `droplet` glyph; dry/broken sources are muted to slate grey.
// ============================================================================

// Lucide `droplet` path (24x24 viewBox).
const DROPLET_PATH =
  'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C8 11.1 7 13 7 15a7 7 0 0 0 7 7z';

const WATER_SIZE: [number, number] = [30, 30];
const WATER_ANCHOR: [number, number] = [15, 15]; // centered on the coord
const WATER_POPUP_OFFSET: [number, number] = [0, -16];

export function getWaterMarker(isWorking: boolean): L.DivIcon {
  const bg = isWorking ? '#38bdf8' : '#94a3b8'; // sky-400 working, slate-400 dry
  const droplet =
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${DROPLET_PATH}" /></svg>`;
  return L.divIcon({
    className: 'tb-water-pin',
    html:
      `<div style="width:30px;height:30px;border-radius:9999px;background:${bg};` +
      `border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);` +
      `display:flex;align-items:center;justify-content:center;">${droplet}</div>`,
    iconSize: WATER_SIZE,
    iconAnchor: WATER_ANCHOR,
    popupAnchor: WATER_POPUP_OFFSET
  });
}

// ============================================================================
// "You are here" marker
// ----------------------------------------------------------------------------
// The current device location, fed live by the browser Geolocation API (no
// server, no realtime infra). A pulsing blue GPS dot, distinct from the
// watercolor bed/water pins so it never reads as a tree bed. Pulse animation
// lives in index.css under `.tb-location-dot`.
// ============================================================================

const LOCATION_SIZE: [number, number] = [22, 22];
const LOCATION_ANCHOR: [number, number] = [11, 11]; // centered on the coord

export function getLocationMarker(): L.DivIcon {
  return L.divIcon({
    className: 'tb-location-pin',
    html: '<div class="tb-location-dot"></div>',
    iconSize: LOCATION_SIZE,
    iconAnchor: LOCATION_ANCHOR
  });
}
