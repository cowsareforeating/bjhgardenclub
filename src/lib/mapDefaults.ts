import type { LatLngExpression } from 'leaflet';

// Single source of truth for where the map opens.
// St Marks Ave & Classon Ave, Crown Heights, Brooklyn.
export const DEFAULT_CENTER: LatLngExpression = [40.6765, -73.9594];
export const DEFAULT_ZOOM = 16;

// Stamen Watercolor (served by Stadia Maps). Free with attribution.
// Register the deployment URL at https://stadiamaps.com and set
// VITE_STADIA_API_KEY in your env so production tiles aren't rate-limited.
// Without a key, only localhost requests work reliably.
const STADIA_KEY = import.meta.env.VITE_STADIA_API_KEY;
export const TILE_URL =
  'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg' +
  (STADIA_KEY ? `?api_key=${STADIA_KEY}` : '');
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
  '&copy; <a href="https://stamen.com">Stamen Design</a> ' +
  '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

// Transparent street + place-name labels overlaid on top of the watercolor
// base so roads stay readable. Stamen Toner Labels is served by the same
// Stadia account, so VITE_STADIA_API_KEY (if set) applies here too.
export const LABELS_TILE_URL =
  'https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}.png' +
  (STADIA_KEY ? `?api_key=${STADIA_KEY}` : '');

// Watercolor tiles top out around zoom 18 on Stadia.
export const TILE_MAX_ZOOM = 18;
