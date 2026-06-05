import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { DivIcon, Icon } from 'leaflet';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  TILE_URL,
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
  MAP_MAX_ZOOM
} from '../../lib/mapDefaults';

// ============================================================================
// LocationMap
// ----------------------------------------------------------------------------
// The small editable map shared by every "place a pin" form (add bed, edit bed,
// edit water source). Watercolor base tiles, tap-to-move, a draggable-by-tap pin
// and a coordinate readout. Previously this exact block — plus near-identical
// `ClickToMove`/`RecenterMap` helpers — was duplicated across three screens.
// ============================================================================

interface LocationMapProps {
  lat: number | null;
  lon: number | null;
  /** Called with the tapped coordinates. */
  onPick: (lat: number, lon: number) => void;
  /** Custom pin icon (e.g. the water-source droplet). Defaults to Leaflet's pin. */
  markerIcon?: DivIcon | Icon;
  /**
   * Pan the map to follow lat/lon changes. The create flow turns this on so
   * address-search / GPS results recenter the map; edit flows leave it off so
   * the map stays where the user dragged it.
   */
  recenter?: boolean;
}

export function LocationMap({ lat, lon, onPick, markerIcon, recenter = false }: LocationMapProps) {
  return (
    <>
      <div className="h-64 overflow-hidden rounded-lg border border-border/80">
        <MapContainer
          center={lat !== null && lon !== null ? [lat, lon] : DEFAULT_CENTER}
          zoom={lat !== null ? 17 : DEFAULT_ZOOM}
          maxZoom={MAP_MAX_ZOOM}
          className="h-full w-full"
        >
          <TileLayer
            attribution={TILE_ATTRIBUTION}
            url={TILE_URL}
            maxZoom={MAP_MAX_ZOOM}
            maxNativeZoom={TILE_MAX_ZOOM}
          />
          {recenter && <RecenterMap lat={lat} lon={lon} />}
          <MapClickHandler onPick={onPick} />
          {lat !== null && lon !== null && (
            // Spread the icon only when provided — passing `icon={undefined}`
            // overrides Leaflet's default marker with nothing and crashes
            // _initIcon. Omitting the key lets the built-in pin apply.
            <Marker position={[lat, lon]} {...(markerIcon ? { icon: markerIcon } : {})} />
          )}
        </MapContainer>
      </div>
      {lat !== null && lon !== null && (
        <p className="text-xs text-muted-foreground">
          {lat.toFixed(5)}, {lon.toFixed(5)}
        </p>
      )}
    </>
  );
}

/** Pans the map to follow coords set via search / GPS / tap. */
function RecenterMap({ lat, lon }: { lat: number | null; lon: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lon !== null) map.setView([lat, lon]);
  }, [lat, lon, map]);
  return null;
}

/** Reports map taps as picked coordinates. */
function MapClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}
