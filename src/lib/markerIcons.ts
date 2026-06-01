import L from 'leaflet';

// ============================================================================
// Care-urgency model
// ----------------------------------------------------------------------------
// The base interval is 30 days. A seasonal multiplier stretches that in winter
// and compresses it in peak summer — beds need more frequent care in July than
// in January. No external weather API; pure month-of-year math.
//
//   `careUrgency` returns a 0..1 score:
//       0   = freshly cared for
//       0.5 = bed is at the start of the "needs care" window
//       1   = badly overdue (1.5× the seasonal interval)
//
// Pin rendering crossfades the normal pin into the alert pin as urgency rises,
// so the map shows a continuous gradient instead of a hard binary flip.
// ============================================================================

export const BASE_INTERVAL_DAYS = 30;

/** Threshold the Care page uses to decide what's "needing care" right now. */
export const NEEDS_CARE_URGENCY = 0.5;

/**
 * Seasonal multiplier on the base care interval (northern hemisphere).
 *   Dec/Jan/Feb → 3.0×  (dormant — most beds don't need work)
 *   Mar / Nov   → 1.75× (shoulder seasons)
 *   Jul / Aug   → 0.5×  (peak heat — water often, weeds explode)
 *   else        → 1.0×  (spring + fall growing seasons)
 */
export function seasonalMultiplier(date: Date): number {
  switch (date.getMonth()) {
    case 11:
    case 0:
    case 1:
      return 3.0;
    case 2:
    case 10:
      return 1.75;
    case 6:
    case 7:
      return 0.5;
    default:
      return 1.0;
  }
}

/**
 * 0..1 urgency. Anchored to the most recent care session, falling back to the
 * bed's `created_at` so a brand-new bed doesn't immediately show as red.
 */
export function careUrgency(
  createdAt: string,
  sessions: Array<{ performed_at: string }>,
  now: Date = new Date()
): number {
  const effectiveDays = BASE_INTERVAL_DAYS * seasonalMultiplier(now);
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
