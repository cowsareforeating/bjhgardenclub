import L from 'leaflet';

// ============================================================================
// Care-urgency model
// ----------------------------------------------------------------------------
// The base interval is 28 days. Two multipliers adjust it — no weather API,
// just month-of-year + bed-type math:
//   * seasonal: shorter in summer, longer in winter
//   * type:     pollinator beds need care more often than plain trees
//
//   `careUrgency` returns a 0..1 score:
//       0   = freshly cared for
//       0.5 = bed is at the start of the "needs care" window
//       1   = badly overdue (1.5× the effective interval)
//
// Pin rendering crossfades the normal pin into the alert pin as urgency rises,
// so the map shows a continuous gradient instead of a hard binary flip.
// ============================================================================

export const BASE_INTERVAL_DAYS = 28;

/** Threshold the Care page uses to decide what's "needing care" right now. */
export const NEEDS_CARE_URGENCY = 0.5;

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
 * 0..1 urgency. Anchored to the most recent care session, falling back to the
 * bed's `created_at` so a brand-new bed doesn't immediately show as red.
 * `typeLabels` shortens the interval for pollinator beds.
 */
export function careUrgency(
  createdAt: string,
  sessions: Array<{ performed_at: string }>,
  typeLabels: string[] = [],
  now: Date = new Date()
): number {
  const effectiveDays =
    BASE_INTERVAL_DAYS * seasonalMultiplier(now) * typeIntervalFactor(typeLabels);
  const anchorMs = sessions.length
    ? Math.max(...sessions.map((s) => new Date(s.performed_at).getTime()))
    : new Date(createdAt).getTime();
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
  const lowered = typeLabels.map((l) => l.toLowerCase());
  const hasTree = lowered.some((l) => l.includes('tree'));
  const hasPollinator = lowered.some((l) => l.includes('pollinator'));
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
 */
export function getBedMarker(typeLabels: string[], urgency: number): L.DivIcon {
  const kind = pinKind(typeLabels);
  const normalUrl = `/pins/wc-pin-${kind}.svg`;
  const alertUrl = `/pins/wc-pin-${kind}-needscare.svg`;
  const normalOpacity = Math.max(0.15, 1 - urgency).toFixed(3);
  const alertOpacity = urgency.toFixed(3);

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
