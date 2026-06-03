import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

/**
 * Toggles a Leaflet map between static and interactive (pan + zoom) at runtime.
 * Used by the detail-page hero maps, which start static so the page scrolls.
 */
export function MapInteractivity({ enabled }: { enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    const handlers = [map.dragging, map.scrollWheelZoom, map.touchZoom, map.doubleClickZoom];
    handlers.forEach((h) => (enabled ? h.enable() : h.disable()));
  }, [enabled, map]);
  return null;
}
