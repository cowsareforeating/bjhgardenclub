import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { ChevronLeft, Maximize2, MapPin, Pencil, Sprout } from 'lucide-react';
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapDefaults';
import { careUrgency, getBedMarker } from '../lib/markerIcons';
import { activityIcon } from '../lib/activityIcons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { TreeBedWithTypes, CareSessionFull, PublicProfile } from '../lib/types';
import { Avatar } from '../components/Avatar';
import { PhotoCarousel } from '../components/PhotoCarousel';
import { Reactions } from '../components/Reactions';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Select } from '../components/ui/select';

const PAGE_SIZE = 10;

const PHOTO_BUCKET = 'care-photos';

export function TreeBedDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user, isAdmin } = useAuth();
  const [bed, setBed] = useState<TreeBedWithTypes | null>(null);
  const [sessions, setSessions] = useState<CareSessionFull[] | null>(null);
  const [activityFilter, setActivityFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [mapInteractive, setMapInteractive] = useState(false);
  const [authors, setAuthors] = useState<Record<string, PublicProfile>>({});
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
            '*, care_session_activities(activity_type_id, activity_types(label)), care_session_photos(id, storage_path), care_session_reactions(emoji, user_id)'
          )
          .eq('tree_bed_id', id)
          .order('performed_at', { ascending: false })
      ]);
      if (cancelled) return;
      if (bedRes.error) setError(bedRes.error.message);
      else setBed(bedRes.data as TreeBedWithTypes | null);
      if (sessionRes.error) {
        setError(sessionRes.error.message);
      } else {
        const rows = (sessionRes.data ?? []) as CareSessionFull[];
        setSessions(rows);
        // Look up the alias/avatar of everyone who logged a session here.
        const ids = [...new Set(rows.map((s) => s.created_by).filter(Boolean))] as string[];
        if (ids.length) {
          const { data: profs } = await supabase
            .from('public_profiles')
            .select('id, alias, avatar_path')
            .in('id', ids);
          if (!cancelled && profs) {
            setAuthors(Object.fromEntries((profs as PublicProfile[]).map((p) => [p.id, p])));
          }
        }
      }
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

  // Distinct activity labels present in this bed's sessions → filter options.
  const allActivityLabels = useMemo(() => {
    const set = new Set<string>();
    (sessions ?? []).forEach((s) =>
      s.care_session_activities.forEach((a) => {
        const l = a.activity_types?.label;
        if (l) set.add(l);
      })
    );
    return [...set].sort();
  }, [sessions]);

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
  // Any signed-in user may edit a bed (care-session editing stays creator/admin).
  const canEdit = !!user;
  const urgency = careUrgency(bed.created_at, sessions, types);
  const bedIcon = getBedMarker(types, urgency);

  // Care-history filter + pagination.
  const filteredSessions =
    activityFilter === 'all'
      ? sessions
      : sessions.filter((s) =>
          s.care_session_activities.some((a) => a.activity_types?.label === activityFilter)
        );
  const pageCount = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const showPagination = filteredSessions.length > PAGE_SIZE;
  const visibleSessions = filteredSessions.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Stat cards: Care sessions, Last care, and Tree ID (only when present).
  const treeIdHref = bed.tree_id
    ? `https://tree-map.nycgovparks.org/tree-map/tree/${encodeURIComponent(bed.tree_id.replace(/^#/, '').trim())}`
    : undefined;
  const stats: Array<{ label: string; value: string; href?: string }> = [
    { label: 'Care sessions', value: String(sessions.length) },
    { label: 'Last care', value: lastSession ? new Date(lastSession.performed_at).toLocaleDateString() : '—' }
  ];
  if (bed.tree_id) {
    stats.push({ label: 'Tree ID', value: `#${bed.tree_id.replace(/^#/, '')}`, href: treeIdHref });
  }
  const statCols = stats.length >= 3 ? 'grid-cols-3' : 'grid-cols-2';

  const toggleReaction = async (sessionId: string, emoji: string) => {
    if (!user) {
      nav('/login');
      return;
    }
    const uid = user.id;
    const target = sessions.find((s) => s.id === sessionId);
    const mine = (target?.care_session_reactions ?? []).some(
      (r) => r.emoji === emoji && r.user_id === uid
    );
    const prev = sessions;
    // Optimistic update.
    setSessions((cur) =>
      (cur ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const list = s.care_session_reactions ?? [];
        return {
          ...s,
          care_session_reactions: mine
            ? list.filter((r) => !(r.emoji === emoji && r.user_id === uid))
            : [...list, { emoji, user_id: uid }]
        };
      })
    );
    const { error: rxErr } = mine
      ? await supabase
          .from('care_session_reactions')
          .delete()
          .match({ care_session_id: sessionId, user_id: uid, emoji })
      : await supabase.from('care_session_reactions').insert({ care_session_id: sessionId, emoji });
    if (rxErr) {
      console.warn('Reaction failed', rxErr);
      setSessions(prev); // revert
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero map with overlaid controls. z-0 traps Leaflet's panes so the
          content sheet below can sit on the map's bottom edge. */}
      <div className="relative z-0 h-64">
        <MapContainer
          center={[bed.latitude, bed.longitude]}
          zoom={17}
          scrollWheelZoom={false}
          dragging={false}
          doubleClickZoom={false}
          touchZoom={false}
          zoomControl={false}
          className="h-full w-full"
        >
          <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
          <Marker position={[bed.latitude, bed.longitude]} icon={bedIcon} />
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
              {bed.name ?? 'Tree bed'}
            </h1>
            {canEdit && (
              <Link
                to={`/bed/${bed.id}/edit`}
                aria-label="Edit bed"
                className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            )}
          </div>

          {types.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {types.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          )}

          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>
              {bed.address || `${bed.latitude.toFixed(5)}, ${bed.longitude.toFixed(5)}`}
            </span>
          </p>
          {bed.tree_species?.name && (
            <p className="mt-1 text-sm text-muted-foreground">
              Species: <span className="font-medium text-foreground">{bed.tree_species.name}</span>
            </p>
          )}
        </div>

        <div className={`grid gap-2 ${statCols}`}>
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} href={s.href} />
          ))}
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

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Care history{sessions.length > 0 ? ` (${sessions.length})` : ''}
            </h2>
            {allActivityLabels.length > 0 && (
              <Select
                aria-label="Filter by activity"
                value={activityFilter}
                onChange={(e) => {
                  setActivityFilter(e.target.value);
                  setPage(0);
                }}
                className="h-8 w-auto min-w-[150px] shrink-0"
              >
                <option value="all">All activities</option>
                {allActivityLabels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No care sessions logged yet.</p>
          ) : (
            filteredSessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No sessions match this filter.</p>
            )
          )}

          <ul className="space-y-2">
            {visibleSessions.map((s) => {
              const activityLabels = s.care_session_activities
                .map((a) => a.activity_types?.label)
                .filter(Boolean) as string[];
              const photos = s.care_session_photos ?? [];
              const canEditSession = !!user && (isAdmin || s.created_by === user.id);
              const author = s.created_by ? authors[s.created_by] : undefined;
              return (
                <li key={s.id}>
                  <Card className="rounded-2xl">
                    <CardContent className="flex gap-3 p-3">
                      {/* Leading visual: photo carousel, or a placeholder tile. */}
                      {photos.length > 0 ? (
                        <PhotoCarousel
                          photos={photos.map((p) => photoUrl(p.storage_path))}
                          className="h-20 w-20 shrink-0 rounded-2xl"
                        />
                      ) : (
                        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
                          <Sprout className="h-7 w-7" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            {activityLabels.length > 0 ? (
                              activityLabels.map((a) => {
                                const Icon = activityIcon(a);
                                return (
                                  <span
                                    key={a}
                                    className="inline-flex items-center gap-1 text-sm font-semibold text-foreground"
                                  >
                                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                    {a}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-sm font-semibold text-foreground">Care session</span>
                            )}
                          </div>
                          {canEditSession && (
                            <Link
                              to={`/bed/${bed.id}/care/${s.id}/edit`}
                              aria-label="Edit care session"
                              className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>

                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Avatar size={18} alias={author?.alias} avatarPath={author?.avatar_path} />
                          <span className="text-xs font-medium text-foreground">
                            {author?.alias || 'Member'}
                          </span>
                        </div>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(s.performed_at).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                          {photos.length > 0 &&
                            ` · ${photos.length} photo${photos.length > 1 ? 's' : ''}`}
                        </p>

                        {s.notes && (
                          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{s.notes}</p>
                        )}

                        <Reactions
                          reactions={s.care_session_reactions ?? []}
                          userId={user?.id ?? null}
                          onToggle={(emoji) => toggleReaction(s.id, emoji)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>

          {showPagination && (
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                Page {safePage + 1} of {pageCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MapInteractivity({ enabled }: { enabled: boolean }) {
  const map = useMap();
  useEffect(() => {
    const handlers = [map.dragging, map.scrollWheelZoom, map.touchZoom, map.doubleClickZoom];
    handlers.forEach((h) => (enabled ? h.enable() : h.disable()));
  }, [enabled, map]);
  return null;
}

function Stat({ label, value, href }: { label: string; value: string; href?: string }) {
  const display = href ? (
    <a href={href} target="_blank" rel="noreferrer" className="underline">
      {value}
    </a>
  ) : (
    value
  );
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-1 break-words text-base font-semibold tracking-tight">{display}</div>
      </CardContent>
    </Card>
  );
}
