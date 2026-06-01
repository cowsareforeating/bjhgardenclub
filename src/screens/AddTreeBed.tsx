import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { supabase } from '../lib/supabase';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  TILE_URL,
  TILE_ATTRIBUTION
} from '../lib/mapDefaults';
import { useAuth } from '../context/AuthContext';
import { searchAddress, reverseGeocode } from '../lib/geocode';
import type { TreeBedType } from '../lib/types';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { cn } from '../lib/utils';

type Mode = 'gps' | 'address' | 'map';

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

  const [mode, setMode] = useState<Mode>(preset ? 'map' : 'gps');
  const [name, setName] = useState('');
  const [types, setTypes] = useState<TreeBedType[]>([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([]);
  const [lat, setLat] = useState<number | null>(preset?.lat ?? null);
  const [lon, setLon] = useState<number | null>(preset?.lon ?? null);
  const [address, setAddress] = useState('');
  const [addrQuery, setAddrQuery] = useState('');
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

  // GPS mode auto-fills coords on entry — but skip if we already have a preset.
  useEffect(() => {
    if (mode !== 'gps' || preset) return;
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('Your browser doesn’t support location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
        const guess = await reverseGeocode(pos.coords.latitude, pos.coords.longitude).catch(() => null);
        if (guess) setAddress(guess);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied. Use Address or Map mode instead.');
        } else {
          setError('Couldn’t get your location. Try Address or Map mode.');
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [mode, preset]);

  // Debounced address search.
  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (mode !== 'address' || !addrQuery.trim()) {
      setAddrResults([]);
      return;
    }
    const t = setTimeout(async () => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setSearching(true);
      try {
        const r = await searchAddress(addrQuery, ctrl.signal);
        setAddrResults(r);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [addrQuery, mode]);

  const toggleType = (id: number) => {
    setSelectedTypeIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user) {
      setError('You must be signed in to add a bed.');
      return;
    }
    if (lat === null || lon === null) {
      setError('Pick a location first (GPS, address, or tap the map).');
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
        address: address.trim() || null
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
        <PageHeader title="Add a tree bed" back="/" />

        {preset ? (
          <p className="text-xs text-muted-foreground">
            Location placed on map: {lat?.toFixed(5)}, {lon?.toFixed(5)}. Tap a mode below to change it.
          </p>
        ) : null}

        <ModePicker mode={mode} setMode={setMode} />

        {mode === 'gps' && (
          <p className="text-sm text-muted-foreground">
            {lat !== null && lon !== null
              ? `Got your location: ${lat.toFixed(5)}, ${lon.toFixed(5)}`
              : 'Getting your location…'}
          </p>
        )}

        {mode === 'address' && (
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Search an address or place"
              value={addrQuery}
              onChange={(e) => setAddrQuery(e.target.value)}
              autoComplete="off"
            />
            {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
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
                      setAddrResults([]);
                      setAddrQuery(r.displayName);
                    }}
                  >
                    {r.displayName}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === 'map' && (
          <div className="h-64 overflow-hidden rounded-lg border border-border/80">
            <MapContainer
              center={lat !== null && lon !== null ? [lat, lon] : DEFAULT_CENTER}
              zoom={lat !== null ? 17 : DEFAULT_ZOOM}
              className="h-full w-full"
            >
              <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
              <ClickToPick
                onPick={async (la, lo) => {
                  setLat(la);
                  setLon(lo);
                  const a = await reverseGeocode(la, lo).catch(() => null);
                  if (a) setAddress(a);
                }}
              />
              {lat !== null && lon !== null && <Marker position={[lat, lon]} />}
            </MapContainer>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Name (optional)</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Corner oak" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address (auto-filled when available)</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St"
          />
        </div>

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

        {error && <Banner kind="error">{error}</Banner>}

        <Button type="submit" disabled={submitting} size="xl" className="w-full">
          {submitting ? 'Saving…' : 'Save tree bed'}
        </Button>
      </form>
    </div>
  );
}

function ModePicker({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const opt = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={cn(
        'flex-1 rounded-md py-2.5 text-sm font-medium transition-colors',
        mode === m
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2 rounded-lg bg-muted p-1">
      {opt('gps', 'My GPS')}
      {opt('address', 'Address')}
      {opt('map', 'Tap map')}
    </div>
  );
}

function ClickToPick({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}
