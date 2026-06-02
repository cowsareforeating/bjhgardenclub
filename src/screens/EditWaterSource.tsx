import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  TILE_URL,
  TILE_ATTRIBUTION,
  TILE_MAX_ZOOM,
  MAP_MAX_ZOOM
} from '../lib/mapDefaults';
import { getWaterMarker } from '../lib/markerIcons';
import { reverseGeocode } from '../lib/geocode';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { WaterSource } from '../lib/types';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Spinner } from '../components/Spinner';
import { cn } from '../lib/utils';

export function EditWaterSource() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [isWorking, setIsWorking] = useState(true);
  const [initialWorking, setInitialWorking] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('water_sources')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setError(error?.message ?? 'Water source not found.');
        setLoading(false);
        return;
      }
      const w = data as WaterSource;
      setName(w.name ?? '');
      setAddress(w.address ?? '');
      setLat(w.latitude);
      setLon(w.longitude);
      setIsWorking(w.is_working);
      setInitialWorking(w.is_working);
      setNotes(w.notes ?? '');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authLoading]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (lat === null || lon === null) {
      setError('Pick a location on the map.');
      return;
    }
    setSaving(true);
    // Re-stamp "as of" only when the working/dry state actually changed.
    const patch: Record<string, unknown> = {
      name: name.trim() || null,
      address: address.trim() || null,
      latitude: lat,
      longitude: lon,
      is_working: isWorking,
      notes: notes.trim() || null
    };
    if (isWorking !== initialWorking) patch.status_checked_at = new Date().toISOString();
    const { error: upErr } = await supabase.from('water_sources').update(patch).eq('id', id);
    setSaving(false);
    if (upErr) {
      setError(upErr.message);
      return;
    }
    // Return to the detail without pushing history, so its back button still
    // goes where the user came from (e.g. the map) — not back here.
    if (location.key !== 'default') nav(-1);
    else nav(`/water/${id}`, { replace: true });
  };

  const onDelete = async () => {
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from('water_sources').delete().eq('id', id);
    if (error) {
      setDeleting(false);
      setError(`Could not delete: ${error.message}`);
      return;
    }
    nav('/');
  };

  if (authLoading || loading) return <Spinner label="Loading water source…" />;

  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={onSubmit} className="space-y-5 p-4 pb-8">
        <PageHeader title="Edit water source" back={`/water/${id}`} />

        <div className="space-y-2">
          <Label htmlFor="name">Name (optional)</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 475 St. Marks spigot"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address (optional)</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
        </div>

        <div className="space-y-2">
          <Label>Location — tap the map to move the pin</Label>
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
              <ClickToMove
                onPick={async (la, lo) => {
                  setLat(la);
                  setLon(lo);
                  const a = await reverseGeocode(la, lo).catch(() => null);
                  if (a) setAddress(a);
                }}
              />
              {lat !== null && lon !== null && (
                <Marker position={[lat, lon]} icon={getWaterMarker(isWorking)} />
              )}
            </MapContainer>
          </div>
          {lat !== null && lon !== null && (
            <p className="text-xs text-muted-foreground">
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </p>
          )}
        </div>

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
          <p className="text-xs text-muted-foreground">
            {isWorking === initialWorking
              ? 'Unchanged — the “as of” date stays the same.'
              : 'Saving will update the “as of” date to today.'}
          </p>
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

        {error && <Banner kind="error">{error}</Banner>}

        <Button type="submit" disabled={saving} size="xl" className="w-full">
          {saving ? 'Saving…' : 'Save changes'}
        </Button>

        <div className="rounded-lg border border-destructive/40 p-3">
          {confirmingDelete ? (
            <div className="space-y-2">
              <p className="text-sm">Delete this water source? This can’t be undone.</p>
              <div className="flex gap-2">
                <Button type="button" variant="destructive" className="flex-1" onClick={onDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="destructive" className="w-full" onClick={() => setConfirmingDelete(true)}>
              Delete water source
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function ClickToMove({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}
