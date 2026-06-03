import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { ChevronLeft, Maximize2, MapPin, Pencil } from 'lucide-react';
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapDefaults';
import { getWaterMarker } from '../lib/markerIcons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { WaterSource } from '../lib/types';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { Badge } from '../components/ui/badge';
import { MapInteractivity } from '../components/MapInteractivity';

export function WaterSourceDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const [source, setSource] = useState<WaterSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapInteractive, setMapInteractive] = useState(false);

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
      {/* Hero map with overlaid controls (mirrors the tree-bed detail). */}
      <div className="relative z-0 h-64">
        <MapContainer
          center={[source.latitude, source.longitude]}
          zoom={17}
          scrollWheelZoom={false}
          dragging={false}
          doubleClickZoom={false}
          touchZoom={false}
          zoomControl={false}
          className="h-full w-full"
        >
          <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
          <Marker position={[source.latitude, source.longitude]} icon={getWaterMarker(source.is_working)} />
          <MapInteractivity enabled={mapInteractive} />
        </MapContainer>

        <button
          type="button"
          onClick={() => nav('/')}
          aria-label="Back to map"
          className="absolute left-3 top-3 z-[1000] grid h-9 w-9 place-items-center rounded-full bg-background/70 text-foreground shadow-md backdrop-blur transition-colors hover:bg-background/90"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setMapInteractive((v) => !v)}
          aria-pressed={mapInteractive}
          aria-label={mapInteractive ? 'Lock map' : 'Pan & zoom the map'}
          className={`absolute right-3 top-3 z-[1000] grid h-9 w-9 place-items-center rounded-full bg-background/70 text-foreground shadow-md backdrop-blur transition-colors hover:bg-background/90 ${
            mapInteractive ? 'ring-2 ring-primary' : ''
          }`}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Content sheet pulled onto the bottom edge of the map. */}
      <div className="relative z-10 -mt-6 space-y-5 rounded-t-3xl bg-background px-4 pb-8 pt-5">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
              {source.name ?? 'Water source'}
            </h1>
            {canEdit && (
              <Link
                to={`/water/${source.id}/edit`}
                aria-label="Edit water source"
                className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {source.is_working ? (
              <Badge>Working — confirmed {asOf}</Badge>
            ) : (
              <Badge variant="muted">Dry / broken as of {asOf}</Badge>
            )}
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>
              {source.address || `${source.latitude.toFixed(5)}, ${source.longitude.toFixed(5)}`}
            </span>
          </p>
          {source.notes && <p className="mt-2 text-sm text-muted-foreground">{source.notes}</p>}
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
