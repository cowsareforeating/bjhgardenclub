import { FormEvent, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { supabase } from '../lib/supabase';
import { DEFAULT_CENTER, DEFAULT_ZOOM, TILE_URL, TILE_ATTRIBUTION } from '../lib/mapDefaults';
import { useAuth } from '../context/AuthContext';
import { reverseGeocode } from '../lib/geocode';
import type { TreeBedType } from '../lib/types';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Spinner } from '../components/Spinner';
import { SpeciesSelect } from '../components/SpeciesSelect';
import { cn } from '../lib/utils';

export function EditTreeBed() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lon, setLon] = useState<number | null>(null);
  const [types, setTypes] = useState<TreeBedType[]>([]);
  const [selectedTypeIds, setSelectedTypeIds] = useState<number[]>([]);
  const initialTypeIds = useRef<number[]>([]);
  const [speciesId, setSpeciesId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const [bedRes, typesRes] = await Promise.all([
        supabase
          .from('tree_beds')
          .select('*, tree_bed_type_assignments(type_id)')
          .eq('id', id)
          .maybeSingle(),
        supabase.from('tree_bed_types').select('*').eq('is_active', true).order('sort_order')
      ]);
      if (cancelled) return;
      if (bedRes.error || !bedRes.data) {
        setError(bedRes.error?.message ?? 'Bed not found.');
        setLoading(false);
        return;
      }
      const bed = bedRes.data as {
        name: string | null;
        address: string | null;
        latitude: number;
        longitude: number;
        species_id: number | null;
        created_by: string | null;
        tree_bed_type_assignments: Array<{ type_id: number }>;
      };
      setName(bed.name ?? '');
      setAddress(bed.address ?? '');
      setLat(bed.latitude);
      setLon(bed.longitude);
      setSpeciesId(bed.species_id ?? null);
      const ids = (bed.tree_bed_type_assignments ?? []).map((a) => a.type_id);
      setSelectedTypeIds(ids);
      initialTypeIds.current = ids;
      setTypes((typesRes.data ?? []) as TreeBedType[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user, authLoading]);

  const toggleType = (tid: number) =>
    setSelectedTypeIds((cur) => (cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid]));

  const hasTreeType = types.some(
    (t) => selectedTypeIds.includes(t.id) && t.label.toLowerCase().includes('tree')
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (lat === null || lon === null) {
      setError('Pick a location on the map.');
      return;
    }
    if (selectedTypeIds.length === 0) {
      setError('Choose at least one tree bed type.');
      return;
    }
    setSaving(true);
    const { error: upErr } = await supabase
      .from('tree_beds')
      .update({
        name: name.trim() || null,
        address: address.trim() || null,
        latitude: lat,
        longitude: lon,
        species_id: hasTreeType ? speciesId : null
      })
      .eq('id', id);
    if (upErr) {
      setSaving(false);
      setError(upErr.message);
      return;
    }
    // Reconcile type assignments against what was loaded.
    const before = initialTypeIds.current;
    const toAdd = selectedTypeIds.filter((x) => !before.includes(x));
    const toRemove = before.filter((x) => !selectedTypeIds.includes(x));
    if (toRemove.length) {
      const { error } = await supabase
        .from('tree_bed_type_assignments')
        .delete()
        .eq('tree_bed_id', id)
        .in('type_id', toRemove);
      if (error) {
        setSaving(false);
        setError(`Saved, but removing a type failed: ${error.message}`);
        return;
      }
    }
    if (toAdd.length) {
      const { error } = await supabase
        .from('tree_bed_type_assignments')
        .insert(toAdd.map((type_id) => ({ tree_bed_id: id, type_id })));
      if (error) {
        setSaving(false);
        setError(`Saved, but adding a type failed: ${error.message}`);
        return;
      }
    }
    setSaving(false);
    // Return to the bed detail without pushing a new history entry, so its back
    // button still goes where the user came from (e.g. the map) — not back here.
    if (location.key !== 'default') nav(-1);
    else nav(`/bed/${id}`, { replace: true });
  };

  const onDelete = async () => {
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from('tree_beds').delete().eq('id', id);
    if (error) {
      setDeleting(false);
      setError(`Could not delete: ${error.message}`);
      return;
    }
    nav('/');
  };

  if (authLoading || loading) return <Spinner label="Loading bed…" />;

  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={onSubmit} className="space-y-5 p-4 pb-8">
        <PageHeader title="Edit tree bed" back={`/bed/${id}`} />

        <div className="space-y-2">
          <Label htmlFor="name">Name (optional)</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Corner oak" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
        </div>

        <div className="space-y-2">
          <Label>Location — tap the map to move the pin</Label>
          <div className="h-64 overflow-hidden rounded-lg border border-border/80">
            <MapContainer
              center={lat !== null && lon !== null ? [lat, lon] : DEFAULT_CENTER}
              zoom={lat !== null ? 17 : DEFAULT_ZOOM}
              className="h-full w-full"
            >
              <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
              <ClickToMove
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
          {lat !== null && lon !== null && (
            <p className="text-xs text-muted-foreground">
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </p>
          )}
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

        {hasTreeType && (
          <div className="space-y-2">
            <Label>Tree species (optional)</Label>
            <SpeciesSelect value={speciesId} onChange={setSpeciesId} canEdit={!!user} />
          </div>
        )}

        {error && <Banner kind="error">{error}</Banner>}

        <Button type="submit" disabled={saving} size="xl" className="w-full">
          {saving ? 'Saving…' : 'Save changes'}
        </Button>

        <div className="rounded-lg border border-destructive/40 p-3">
          {confirmingDelete ? (
            <div className="space-y-2">
              <p className="text-sm">Delete this bed and all its care sessions? This can’t be undone.</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  onClick={onDelete}
                  disabled={deleting}
                >
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
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete bed
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
