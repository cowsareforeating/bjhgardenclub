import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { Pencil } from 'lucide-react';
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapDefaults';
import { getWaterMarker } from '../lib/markerIcons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { WaterSource } from '../lib/types';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui/badge';

export function WaterSourceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [source, setSource] = useState<WaterSource | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      if (error) setError(error.message);
      else setSource(data as WaterSource | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="p-4">
        <Banner kind="error">{error}</Banner>
      </div>
    );
  }
  if (!source) return <Spinner label="Loading water source…" />;

  // Any signed-in user may edit (same rule as tree beds).
  const canEdit = !!user;
  const asOf = new Date(source.status_checked_at).toLocaleDateString();

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 pb-8">
        <div>
          <PageHeader
            title={source.name ?? 'Water source'}
            back="/"
            right={
              canEdit ? (
                <Link
                  to={`/water/${source.id}/edit`}
                  aria-label="Edit water source"
                  className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </Link>
              ) : undefined
            }
          />
          <div className="mt-1">
            {source.is_working ? (
              <Badge>Working — confirmed {asOf}</Badge>
            ) : (
              <Badge variant="muted">Dry / broken as of {asOf}</Badge>
            )}
          </div>
          {source.address && <p className="mt-2 text-sm text-muted-foreground">{source.address}</p>}
          {source.notes && <p className="mt-2 text-sm">{source.notes}</p>}
        </div>

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
            <Marker position={[source.latitude, source.longitude]} icon={getWaterMarker(source.is_working)} />
          </MapContainer>
        </div>

        {!user && (
          <Banner kind="info">
            <Link to="/login" className="font-medium underline">
              Sign in
            </Link>{' '}
            to update this water source.
          </Banner>
        )}
      </div>
    </div>
  );
}
