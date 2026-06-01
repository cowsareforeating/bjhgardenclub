import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { Pencil } from 'lucide-react';
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapDefaults';
import { careUrgency, getBedMarker } from '../lib/markerIcons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { TreeBedWithTypes, CareSessionFull } from '../lib/types';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { PageHeader } from '../components/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

const PHOTO_BUCKET = 'care-photos';

export function TreeBedDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [bed, setBed] = useState<TreeBedWithTypes | null>(null);
  const [sessions, setSessions] = useState<CareSessionFull[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [bedRes, sessionRes] = await Promise.all([
        supabase
          .from('tree_beds')
          .select('*, tree_bed_type_assignments(type_id, tree_bed_types(label)), tree_species(name)')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('care_sessions')
          .select(
            '*, care_session_activities(activity_type_id, activity_types(label)), care_session_photos(id, storage_path)'
          )
          .eq('tree_bed_id', id)
          .order('performed_at', { ascending: false })
      ]);
      if (cancelled) return;
      if (bedRes.error) setError(bedRes.error.message);
      else setBed(bedRes.data as TreeBedWithTypes | null);
      if (sessionRes.error) setError(sessionRes.error.message);
      else setSessions(sessionRes.data as CareSessionFull[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Build a stable storage-path → public-URL map so we render once per session row.
  const photoUrl = useMemo(() => {
    const cache = new Map<string, string>();
    return (path: string) => {
      const hit = cache.get(path);
      if (hit) return hit;
      const url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
      cache.set(path, url);
      return url;
    };
  }, []);

  if (error) {
    return (
      <div className="p-4">
        <Banner kind="error">{error}</Banner>
      </div>
    );
  }
  if (!bed || !sessions) return <Spinner label="Loading bed…" />;

  const types = bed.tree_bed_type_assignments
    .map((a) => a.tree_bed_types?.label)
    .filter(Boolean) as string[];
  const lastSession = sessions[0];
  const canEdit = !!user && (isAdmin || bed.created_by === user.id);
  const urgency = careUrgency(bed.created_at, sessions, types);
  const bedIcon = getBedMarker(types, urgency);

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 pb-8">
        <div>
          <PageHeader title={bed.name ?? 'Tree bed'} back="/" />
          {types.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {types.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          )}
          {bed.address && <p className="mt-2 text-sm text-muted-foreground">{bed.address}</p>}
          {bed.tree_species?.name && (
            <p className="mt-2 text-sm">
              <span className="text-muted-foreground">Species: </span>
              <span className="font-medium">{bed.tree_species.name}</span>
            </p>
          )}
        </div>

        <div className="h-48 overflow-hidden rounded-lg border border-border/80">
          <MapContainer
            center={[bed.latitude, bed.longitude]}
            zoom={17}
            scrollWheelZoom={false}
            dragging={false}
            className="h-full w-full"
            zoomControl={false}
          >
            <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
            <Marker position={[bed.latitude, bed.longitude]} icon={bedIcon} />
          </MapContainer>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="Care sessions" value={String(sessions.length)} />
          <Stat
            label="Last care"
            value={lastSession ? new Date(lastSession.performed_at).toLocaleDateString() : '—'}
          />
        </div>

        {user ? (
          <Button asChild size="xl" className="w-full">
            <Link to={`/bed/${bed.id}/care/new`}>Record care session</Link>
          </Button>
        ) : (
          <Banner kind="info">
            <Link to="/login" className="font-medium underline">
              Sign in
            </Link>{' '}
            to record a care session.
          </Banner>
        )}

        {canEdit && (
          <p className="text-xs text-muted-foreground">
            You can edit or delete this bed{isAdmin ? ' (admin)' : ''}.
          </p>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Care history</h2>
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">No care sessions logged yet.</p>
          )}
          <ul className="space-y-2">
            {sessions.map((s) => {
              const activityLabels = s.care_session_activities
                .map((a) => a.activity_types?.label)
                .filter(Boolean) as string[];
              const photos = s.care_session_photos ?? [];
              const canEditSession = !!user && (isAdmin || s.created_by === user.id);
              return (
                <li key={s.id}>
                  <Card>
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {activityLabels.length > 0 ? (
                            activityLabels.map((a) => (
                              <Badge key={a} variant="muted">
                                {a}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No activity</span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="text-xs text-muted-foreground">
                            {new Date(s.performed_at).toLocaleString()}
                          </span>
                          {canEditSession && (
                            <Link
                              to={`/bed/${bed.id}/care/${s.id}/edit`}
                              aria-label="Edit care session"
                              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                      {s.notes && <p className="text-sm text-muted-foreground">{s.notes}</p>}
                      {photos.length > 0 && (
                        <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
                          {photos.map((p) => {
                            const url = photoUrl(p.storage_path);
                            return (
                              <a
                                key={p.id}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0"
                              >
                                <img
                                  src={url}
                                  alt=""
                                  loading="lazy"
                                  className="h-20 w-20 rounded-md border border-border object-cover"
                                />
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
