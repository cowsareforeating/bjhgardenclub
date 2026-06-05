import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Check, Pencil, Crosshair, LocateFixed } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  TILE_URL,
  TILE_ATTRIBUTION,
  LABELS_TILE_URL,
  TILE_MAX_ZOOM,
  LABELS_MAX_ZOOM,
  MAP_MAX_ZOOM,
} from '../lib/mapDefaults';
import {
  careUrgency,
  getBedMarker,
  getWaterMarker,
  getLocationMarker,
  NEEDS_CARE_URGENCY
} from '../lib/markerIcons';
import type { TreeBedWithTypes, WaterSource } from '../lib/types';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

interface BedRow extends TreeBedWithTypes {
  care_sessions: Array<{ performed_at: string }>;
}

export function MapView() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [beds, setBeds] = useState<BedRow[] | null>(null);
  const [water, setWater] = useState<WaterSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pendingPos, setPendingPos] = useState<[number, number] | null>(null);
  const [myPos, setMyPos] = useState<[number, number] | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  // Live device location via the browser Geolocation API — no server, no
  // websockets. `watchPosition` re-fires on its own whenever the device moves,
  // so the dot stays current without any polling or backend calls.
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setMyPos([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.warn('geolocation:', err.message),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Recenter the map on the device. If we don't have a fix yet, grab a one-off
  // reading so the first tap still does something useful.
  const recenterOnMe = () => {
    if (myPos) {
      mapRef.current?.flyTo(myPos, Math.max(mapRef.current.getZoom(), 17));
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyPos(p);
        mapRef.current?.flyTo(p, Math.max(mapRef.current.getZoom(), 17));
      },
      (err) => console.warn('geolocation:', err.message),
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [bedsRes, waterRes] = await Promise.all([
        supabase
          .from('tree_beds')
          .select(
            '*, tree_bed_type_assignments(type_id, tree_bed_types(label)), tree_species(name), care_sessions(performed_at)'
          ),
        supabase.from('water_sources').select('*')
      ]);
      if (cancelled) return;
      if (bedsRes.error) setError(bedsRes.error.message);
      else setBeds(bedsRes.data as BedRow[]);
      if (waterRes.error) setError(waterRes.error.message);
      else setWater(waterRes.data as WaterSource[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startPlacing = () => {
    if (!user) {
      nav('/login');
      return;
    }
    setPlacing(true);
  };

  const cancelPlacing = () => {
    setPlacing(false);
    setPendingPos(null);
  };

  const confirmLocation = () => {
    if (!pendingPos) return;
    nav('/add', { state: { lat: pendingPos[0], lon: pendingPos[1] } });
  };

  if (beds === null && !error) return <Spinner label="Loading tree beds…" />;

  return (
    <div className="absolute inset-0">
      {error && (
        <div className="absolute left-2 right-2 top-2 z-[400]">
          <Banner kind="error">Could not load beds: {error}</Banner>
        </div>
      )}

      <MapContainer
        ref={mapRef}
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution={TILE_ATTRIBUTION}
          url={TILE_URL}
          maxZoom={MAP_MAX_ZOOM}
          maxNativeZoom={TILE_MAX_ZOOM}
        />
        {/* Street + place-name labels painted on top of the watercolor base. */}
        <TileLayer url={LABELS_TILE_URL} maxZoom={MAP_MAX_ZOOM} maxNativeZoom={LABELS_MAX_ZOOM} />

        {/* Tracks the map center while in placing mode. */}
        {placing && <CenterTracker onChange={setPendingPos} />}

        {beds?.map((b) => {
          const types = b.tree_bed_type_assignments
            .map((a) => a.tree_bed_types?.label)
            .filter(Boolean) as string[];
          const urgency = careUrgency(b.created_at, b.care_sessions ?? [], types);
          const needsCare = urgency >= NEEDS_CARE_URGENCY;
          const icon = getBedMarker(types, urgency);
          return (
            <Marker
              key={b.id}
              position={[b.latitude, b.longitude]}
              icon={icon}
              opacity={placing ? 0.5 : 1}
            >
              {!placing && (
                <Popup>
                  <div className="min-w-[220px] space-y-2">
                    <div className="flex items-start gap-1.5">
                      <span className="min-w-0 text-sm font-semibold">{b.name ?? 'Tree bed'}</span>
                      {needsCare && (
                        <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
                          Needs care
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                      {types.length > 0 ? (
                        types.map((t) => <Badge key={t}>{t}</Badge>)
                      ) : (
                        <span>No type set</span>
                      )}
                      {b.address && <span>{b.address}</span>}
                      {b.tree_species?.name && (
                        <span>
                          Species: <span className="font-medium text-foreground">{b.tree_species.name}</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex gap-2">
                      {user && (
                        <button
                          type="button"
                          onClick={() => nav(`/bed/${b.id}/care/new`)}
                          className="inline-flex flex-1 items-center justify-center rounded-md border border-primary/40 bg-primary/10 px-2 py-1 font-sans text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                        >
                          Log care
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => nav(`/bed/${b.id}`)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-sans text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        View details
                      </button>
                    </div>
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}

        {water.map((w) => (
          <Marker
            key={w.id}
            position={[w.latitude, w.longitude]}
            icon={getWaterMarker(w.is_working)}
            opacity={placing ? 0.5 : 1}
          >
            {!placing && (
              <Popup>
                <div className="min-w-[220px] space-y-2">
                  <div className="flex items-start gap-1.5">
                    <span className="min-w-0 text-sm font-semibold">{w.name ?? 'Water source'}</span>
                    {w.is_working ? (
                      <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Working
                      </span>
                    ) : (
                      <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Dry as of {new Date(w.status_checked_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {w.address && <div className="text-xs text-muted-foreground">{w.address}</div>}
                  {w.notes && <div className="text-xs text-muted-foreground">{w.notes}</div>}
                  <button
                    type="button"
                    onClick={() => nav(`/water/${w.id}`)}
                    className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1 font-sans text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    View details
                  </button>
                </div>
              </Popup>
            )}
          </Marker>
        ))}

        {/* Live device location. Non-interactive so it never blocks bed taps. */}
        {myPos && (
          <Marker
            position={myPos}
            icon={getLocationMarker()}
            interactive={false}
            keyboard={false}
            zIndexOffset={1000}
          />
        )}
      </MapContainer>

      {/* Crosshair pinned to viewport center while placing. */}
      {placing && (
        <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center">
          <div className="flex flex-col items-center">
            <Crosshair className="h-10 w-10 text-primary drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
            <div className="mt-1 h-2 w-2 rounded-full bg-primary shadow" />
          </div>
        </div>
      )}

      {/* Recenter-on-me — round, sits above the add FAB. Hidden while placing. */}
      {!placing && (
        <button
          type="button"
          onClick={recenterOnMe}
          aria-label="Center on my location"
          className="absolute bottom-[5.5rem] right-4 z-[400] grid h-12 w-12 place-items-center rounded-full bg-card text-foreground shadow-lg shadow-black/30 ring-1 ring-border transition-transform active:scale-95"
        >
          <LocateFixed className="h-5 w-5" />
        </button>
      )}

      {/* FAB — hidden during placing, hidden for logged-out users. */}
      {user && !placing && (
        <button
          type="button"
          onClick={startPlacing}
          aria-label="Add to map"
          className="absolute bottom-5 right-4 z-[400] grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/30 transition-transform active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* Floating placing controls — one row: Confirm | Manual | Cancel(icon). */}
      {placing && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[450] flex flex-col items-stretch gap-2">
          <div className="pointer-events-auto self-center rounded-full bg-foreground/85 px-3 py-1 text-xs font-medium text-background shadow-md">
            {pendingPos
              ? `${pendingPos[0].toFixed(5)}, ${pendingPos[1].toFixed(5)}`
              : 'Drag the map to place the pin'}
          </div>
          <div className="pointer-events-auto flex gap-2">
            <Button
              size="lg"
              className="flex-1 shadow-lg shadow-black/30"
              onClick={confirmLocation}
              disabled={!pendingPos}
            >
              <Check className="h-4 w-4" />
              Confirm
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="shadow-md shadow-black/20"
              onClick={() => nav('/add')}
            >
              <Pencil className="h-4 w-4" />
              Manual
            </Button>
            <Button
              variant="secondary"
              size="lg"
              aria-label="Cancel"
              className="w-10 shrink-0 px-0 shadow-md shadow-black/20"
              onClick={cancelPlacing}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CenterTracker({ onChange }: { onChange: (pos: [number, number]) => void }) {
  const map = useMap();
  // Seed initial position the first time we mount.
  useEffect(() => {
    const c = map.getCenter();
    onChange([c.lat, c.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useMapEvents({
    move() {
      const c = map.getCenter();
      onChange([c.lat, c.lng]);
    }
  });
  return null;
}
