import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapDefaults';
import { getWaterMarker } from '../lib/markerIcons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { WaterSource } from '../lib/types';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';

export function WaterSourceDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<WaterSource | null>(null);

  // Editable fields (signed-in users only).
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [isWorking, setIsWorking] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
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
      setSource(w);
      setName(w.name ?? '');
      setAddress(w.address ?? '');
      setIsWorking(w.is_working);
      setNotes(w.notes ?? '');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Re-stamp "as of" only when the working/dry state actually changed.
    const statusChanged = !!source && isWorking !== source.is_working;
    const patch: Record<string, unknown> = {
      name: name.trim() || null,
      address: address.trim() || null,
      is_working: isWorking,
      notes: notes.trim() || null
    };
    if (statusChanged) patch.status_checked_at = new Date().toISOString();
    const { error } = await supabase.from('water_sources').update(patch).eq('id', id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    nav('/');
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

  if (loading) return <Spinner label="Loading water source…" />;
  if (error && !source) {
    return (
      <div className="p-4">
        <Banner kind="error">{error}</Banner>
      </div>
    );
  }
  if (!source) return null;

  const asOf = new Date(source.status_checked_at).toLocaleDateString();

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 pb-8">
        <PageHeader title={source.name ?? 'Water source'} back="/" />

        <div className="h-48 overflow-hidden rounded-lg border border-border/80">
          <MapContainer
            center={[source.latitude, source.longitude]}
            zoom={17}
            scrollWheelZoom={false}
            dragging={false}
            className="h-full w-full"
            zoomControl={false}
          >
            <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
            <Marker position={[source.latitude, source.longitude]} icon={getWaterMarker(isWorking)} />
          </MapContainer>
        </div>

        {user ? (
          <form onSubmit={onSave} className="space-y-5">
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
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St"
              />
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
                {isWorking === source.is_working
                  ? `Last confirmed ${asOf}.`
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
                  Delete water source
                </Button>
              )}
            </div>
          </form>
        ) : (
          <div className="space-y-2">
            <div>
              {source.is_working ? (
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-700">
                  Working — confirmed {asOf}
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Dry / broken as of {asOf}
                </span>
              )}
            </div>
            {source.address && <p className="text-sm text-muted-foreground">{source.address}</p>}
            {source.notes && <p className="text-sm">{source.notes}</p>}
            <Banner kind="info">Sign in to update this water source.</Banner>
          </div>
        )}
      </div>
    </div>
  );
}
