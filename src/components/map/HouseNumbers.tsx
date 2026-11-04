import { useCallback, useEffect, useState } from 'react';
import { divIcon, latLng, type DivIcon } from 'leaflet';
import { Marker, useMap, useMapEvents } from 'react-leaflet';

// ============================================================================
// HouseNumbers
// ----------------------------------------------------------------------------
// Faint street numbers from NYC Address Points (NYC Open Data uf93-f8nk),
// clipped to the same box as the building footprints. Each point is
// [lat, lon, houseNumber]; the points sit on the street frontage, so labels
// land on the sidewalk side of each building rather than inside it.
//
// Regenerate with:
//   curl -G https://data.cityofnewyork.us/resource/uf93-f8nk.json \
//     --data-urlencode '$select=house_number,the_geom' \
//     --data-urlencode '$where=within_box(the_geom,40.6799,-73.9646,40.6713,-73.9536)' \
//     --data-urlencode '$limit=10000'
//   then map each row to [lat, lon, house_number].
//
// Decluttering: hidden below MIN_ZOOM. Above it, visible points are projected
// to screen pixels and bucketed into a fixed-size grid; only the first number
// in each cell is drawn. Cells are fixed in pixels, so zooming in spreads the
// points apart and more of them survive — density follows zoom for free.
// ============================================================================

type AddressPoint = [number, number, string];

const MIN_ZOOM = 18;
// Grid cell size in screen pixels per zoom — bigger cells = sparser labels.
const CELL_PX: Record<number, number> = { 18: 90, 19: 55, 20: 30 };

const iconCache = new Map<string, DivIcon>();
function numberIcon(n: string): DivIcon {
  let icon = iconCache.get(n);
  if (!icon) {
    icon = divIcon({ className: 'tb-house-number', html: n, iconSize: undefined });
    iconCache.set(n, icon);
  }
  return icon;
}

export function HouseNumbers({ hidden = false }: { hidden?: boolean }) {
  const map = useMap();
  const [points, setPoints] = useState<AddressPoint[] | null>(null);
  const [visible, setVisible] = useState<AddressPoint[]>([]);

  // Lazy-load as its own chunk, same as the building footprints.
  useEffect(() => {
    let cancelled = false;
    import('../../data/crown-heights-addresses.json').then((m) => {
      if (!cancelled) setPoints(m.default as unknown as AddressPoint[]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const recompute = useCallback(() => {
    const zoom = Math.round(map.getZoom());
    if (!points || zoom < MIN_ZOOM) {
      setVisible([]);
      return;
    }
    const cell = CELL_PX[zoom] ?? CELL_PX[20];
    const bounds = map.getBounds().pad(0.1);
    const taken = new Set<string>();
    const out: AddressPoint[] = [];
    for (const p of points) {
      const ll = latLng(p[0], p[1]);
      if (!bounds.contains(ll)) continue;
      const px = map.latLngToContainerPoint(ll);
      const key = `${Math.floor(px.x / cell)},${Math.floor(px.y / cell)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      out.push(p);
    }
    setVisible(out);
  }, [map, points]);

  useEffect(recompute, [recompute]);
  useMapEvents({ zoomend: recompute, moveend: recompute });

  if (hidden) return null;
  return (
    <>
      {visible.map((p) => (
        <Marker
          key={`${p[0]},${p[1]},${p[2]}`}
          position={[p[0], p[1]]}
          icon={numberIcon(p[2])}
          interactive={false}
          keyboard={false}
          zIndexOffset={-1000}
        />
      ))}
    </>
  );
}
