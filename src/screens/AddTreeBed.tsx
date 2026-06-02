import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Crosshair } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  TILE_URL,
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
  MAP_MAX_ZOOM
} from '../lib/mapDefaults';
import { useAuth } from '../context/AuthContext';
import { searchAddress, reverseGeocode } from '../lib/geocode';
import type { TreeBedType } from '../lib/types';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { SpeciesSelect } from '../components/SpeciesSelect';
import { cn } from '../lib/utils';

// What the user is creating. Water sources aren't tree beds — different table.
type Entity = 'water' | 'bed';

// Router state set by MapView's FAB → "Confirm location" path.
interface PresetState {
  lat?: number;
  lon?: number;
}

export function AddTreeBed() {
  const { user } = useAuth();
  const nav = useNavigate();
  const routerState = (useLocation().state as PresetState | null) ?? null;
  const preset =
    routerState && typeof routerState.lat === 'number' && typeof routerState.lon === 'number'
      ? { lat: routerState.lat, lon: routerState.lon }
      : null;

  const [entity, setEntity] = useState<Entity>('bed');
  // Water-source-only fields.
  const [isWorking, setIsWorking] = useState(true);
  const [notes, setNotes] = useState('');

  const [name, setName] = useState('');
  const [types, setTypes] = useState<TreeBedType[]>([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([]);
  const [speciesId, setSpeciesId] = useState<number | null>(null);
  const [treeId, setTreeId] = useState('');
  const [lat, setLat] = useState<number | null>(preset?.lat ?? null);
  const [lon, setLon] = useState<number | null>(preset?.lon ?? null);
  const [address, setAddress] = useState('');
  // True only while the user is typing in the location box — gates the address
  // search so programmatic address fills (tap map / GPS / pick) don't re-search.
  const [typing, setTyping] = useState(false);
  const [addrResults, setAddrResults] = useState<Awaited<ReturnType<typeof searchAddress>>>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from('tree_bed_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setTypes((data ?? []) as TreeBedType[]);
      });
  }, []);

  // Reverse-geocode the preset point once on mount to suggest an address.
  useEffect(() => {
    if (!preset) return;
    reverseGeocode(preset.lat, preset.lon)
      .then((a) => {
        if (a) setAddress(a);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GPS button — fill coords + address from the device location on demand.
  const useMyLocation = () => {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('Your browser doesn’t support location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
        setTyping(false);
        setAddrResults([]);
        const guess = await reverseGeocode(pos.coords.latitude, pos.coords.longitude).catch(() => null);
        if (guess) setAddress(guess);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied. Search an address or tap the map instead.');
        } else {
          setError('Couldn’t get your location. Search an address or tap the map instead.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Debounced address search — only while the user is actively typing.
  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!typing || !address.trim()) {
      setAddrResults([]);
      return;
    }
    const t = setTimeout(async () => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setSearching(true);
      try {
        const r = await searchAddress(address, ctrl.signal);
        setAddrResults(r);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [address, typing]);

  const toggleType = (id: number) => {
    setSelectedTypeIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  // Species only applies to tree beds — shown/saved only when a tree type is on.
  const hasTreeType = types.some(
    (t) => selectedTypeIds.includes(t.id) && t.label.toLowerCase().includes('tree')
  );
  // NYC tree id only applies to "City tree" beds.
  const hasCityTree = types.some(
    (t) => selectedTypeIds.includes(t.id) && t.label.toLowerCase().includes('city')
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user) {
      setError('You must be signed in to add to the map.');
      return;
    }
    if (lat === null || lon === null) {
      setError('Pick a location first (GPS, address, or tap the map).');
      return;
    }
    if (entity === 'water') {
      setSubmitting(true);
      const { error: waterErr } = await supabase.from('water_sources').insert({
        name: name.trim() || null,
        latitude: lat,
        longitude: lon,
        address: address.trim() || null,
        is_working: isWorking,
        notes: notes.trim() || null
      });
      setSubmitting(false);
      if (waterErr) {
        setError(waterErr.message);
        return;
      }
      nav('/');
      return;
    }
    if (selectedTypeIds.length === 0) {
      setError('Choose at least one tree bed type.');
      return;
    }
    setSubmitting(true);
    const { data: bed, error: insertErr } = await supabase
      .from('tree_beds')
      .insert({
        name: name.trim() || null,
        latitude: lat,
        longitude: lon,
        address: address.trim() || null,
        species_id: hasTreeType ? speciesId : null,
        tree_id: hasCityTree ? treeId.trim() || null : null
      })
      .select('id')
      .single();
    if (insertErr || !bed) {
      setSubmitting(false);
      setError(insertErr?.message ?? 'Could not save bed.');
      return;
    }
    const assignments = selectedTypeIds.map((type_id) => ({ tree_bed_id: bed.id, type_id }));
    const { error: assignErr } = await supabase.from('tree_bed_type_assignments').insert(assignments);
    setSubmitting(false);
    if (assignErr) {
      setError(`Bed saved but types failed to attach: ${assignErr.message}`);
      return;
    }
    nav(`/bed/${bed.id}`);
  };

  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={onSubmit} className="space-y-5 p-4 pb-8">
        <PageHeader title={entity === 'water' ? 'Add a water source' : 'Add a tree bed'} back="/" />

        <div className="space-y-2">
          <Label>What are you adding?</Label>
          <div className="flex gap-2 rounded-lg bg-muted p-1">
            <EntityOption entity="water" current={entity} setEntity={setEntity} label="Water source" />
            <EntityOption entity="bed" current={entity} setEntity={setEntity} label="Tree bed" />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <div className="relative">
            <Input
              id="location"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setTyping(true);
              }}
              placeholder="Search an address, or tap the map"
              autoComplete="off"
              className="pr-11"
            />
            <button
              type="button"
              onClick={useMyLocation}
              aria-label="Use my location"
              className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Crosshair className="h-4 w-4" />
            </button>
          </div>

          {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
          {addrResults.length > 0 && (
            <ul className="space-y-1">
              {addrResults.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setLat(r.lat);
                      setLon(r.lon);
                      setAddress(r.displayName);
                      setTyping(false);
                      setAddrResults([]);
                    }}
                  >
                    {r.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}

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
              <RecenterMap lat={lat} lon={lon} />
              <ClickToPick
                onPick={async (la, lo) => {
                  setLat(la);
                  setLon(lo);
                  setTyping(false);
                  setAddrResults([]);
                  const a = await reverseGeocode(la, lo).catch(() => null);
                  if (a) setAddress(a);
                }}
              />
              {lat !== null && lon !== null && <Marker position={[lat, lon]} />}
            </MapContainer>
          </div>
          {lat !== null && lon !== null && (
            <p className="text-xs text-muted-foreground">
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Name (optional)</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Corner oak" />
        </div>

        {entity === 'bed' && (
          <div className="space-y-2">
            <Label>Type(s) — pick one or more</Label>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => {
                const on = selectedTypeIds.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => toggleType(t.id)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {entity === 'water' && (
          <>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex gap-2 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setIsWorking(true)}
                  aria-pressed={isWorking}
                  className={cn(
                    'flex-1 rounded-md py-2.5 text-sm font-medium transition-colors',
                    isWorking ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Working
                </button>
                <button
                  type="button"
                  onClick={() => setIsWorking(false)}
                  aria-pressed={!isWorking}
                  className={cn(
                    'flex-1 rounded-md py-2.5 text-sm font-medium transition-colors',
                    !isWorking ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  Dry / broken
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. behind the gate — needs a key"
                rows={3}
              />
            </div>
          </>
        )}

        {hasTreeType && (
          <div className="space-y-2">
            <Label>Tree species (optional)</Label>
            <SpeciesSelect value={speciesId} onChange={setSpeciesId} canEdit={!!user} />
          </div>
        )}

        {hasCityTree && (
          <div className="space-y-2">
            <Label htmlFor="tree_id">NYC tree ID (optional)</Label>
            <Input
              id="tree_id"
              value={treeId}
              onChange={(e) => setTreeId(e.target.value)}
              placeholder="e.g. 3754306"
              inputMode="numeric"
            />
            <p className="text-xs text-muted-foreground">
              From the NYC tree map — the number after “Tree ID #”.
            </p>
          </div>
        )}

        {error && <Banner kind="error">{error}</Banner>}

        <Button type="submit" disabled={submitting} size="xl" className="w-full">
          {submitting ? 'Saving…' : entity === 'water' ? 'Save water source' : 'Save tree bed'}
        </Button>
      </form>
    </div>
  );
}

function EntityOption({
  entity,
  current,
  setEntity,
  label
}: {
  entity: Entity;
  current: Entity;
  setEntity: (e: Entity) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => setEntity(entity)}
      aria-pressed={current === entity}
      className={cn(
        'flex-1 rounded-md py-2.5 text-sm font-medium transition-colors',
        current === entity
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

// Pans the always-visible map to follow coords set via search / GPS / tap.
function RecenterMap({ lat, lon }: { lat: number | null; lon: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat !== null && lon !== null) map.setView([lat, lon]);
  }, [lat, lon, map]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}
