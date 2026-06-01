// Free OpenStreetMap Nominatim geocoder.
// Per their usage policy, identify the app and don't hammer it. We debounce in
// the UI and cap to one request at a time.

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function searchAddress(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];
  const url = `${NOMINATIM}/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal
  });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  return json.map((r) => ({
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    displayName: r.display_name
  }));
}

export async function reverseGeocode(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  const url = `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lon}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { display_name?: string };
  return json.display_name ?? null;
}
