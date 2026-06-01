import type { LatLngExpression } from 'leaflet';

// Single source of truth for where the map opens.
// St Marks Ave & Classon Ave, Crown Heights, Brooklyn.
export const DEFAULT_CENTER: LatLngExpression = [40.6765, -73.9594];
export const DEFAULT_ZOOM = 16;

// Stamen Watercolor (served by Stadia Maps). Free for non-commercial / low
// traffic; on production domains Stadia recommends registering an API key at
// https://stadiamaps.com — works without one for localhost + light traffic.
export const TILE_URL =
  'https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
  '&copy; <a href="https://stamen.com">Stamen Design</a> ' +
  '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';

// Watercolor tiles top out around zoom 18 on Stadia.
export const TILE_MAX_ZOOM = 18;
