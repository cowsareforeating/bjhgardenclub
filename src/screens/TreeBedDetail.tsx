import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { ChevronLeft, MapPin, Pencil } from 'lucide-react';
import { TILE_URL, TILE_ATTRIBUTION } from '../lib/mapDefaults';
import { careUrgency, getBedMarker, isWateringLabel } from '../lib/markerIcons';
import { useRecentRain } from '../lib/rain';
import { shareCareSession } from '../lib/share';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { TreeBedWithTypes, CareSessionFull, PublicProfile } from '../lib/types';
import { CareSessionCard } from '../components/CareSessionCard';
import { RainDayCard } from '../components/RainDayCard';
import { carePhotoThumbUrl } from '../lib/carePhotos';
import { Gallery } from '../components/Gallery';
import { Lightbox } from '../components/Lightbox';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Select } from '../components/ui/select';

const PAGE_SIZE = 20;
// Cap how many photos the hero gallery loads (newest-first); the rest live in
// the care history below. Off-screen slides lazy-load as you swipe.
const GALLERY_MAX_PHOTOS = 12;

const PHOTO_BUCKET = 'care-photos';

export function TreeBedDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user, isAdmin, profile } = useAuth();
  const { lastRain } = useRecentRain();
  const [bed, setBed] = useState<TreeBedWithTypes | null>(null);
  const [sessions, setSessions] = useState<CareSessionFull[] | null>(null);
  const [activityFilter, setActivityFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [authors, setAuthors] = useState<Record<string, PublicProfile>>({});
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
            '*, care_session_activities(activity_type_id, activity_types(label)), care_session_photos(id, storage_path), care_session_reactions(emoji, user_id), care_session_participants(user_id)'
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
        // Look up the alias/avatar of everyone involved (creators + participants).
        const ids = [
          ...new Set(
            rows.flatMap((s) => [
              s.created_by,
              ...(s.care_session_participants ?? []).map((p) => p.user_id)
            ])
          )
        ].filter(Boolean) as string[];
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

  // Build stable storage-path → public-URL maps so we render once per session row.
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

  const photoThumbUrl = useMemo(() => {
    const cache = new Map<string, string>();
    return (path: string) => {
      const hit = cache.get(path);
      if (hit) return hit;
      const url = carePhotoThumbUrl(path);
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
  const wateringSessions = sessions.filter((s) =>
    s.care_session_activities.some((a) => isWateringLabel(a.activity_types?.label))
  );
  const lastWateringSession = wateringSessions[0];
  // Any signed-in user may edit a bed (care-session editing stays creator/admin).
  const canEdit = !!user;
  const urgency = careUrgency(bed.created_at, wateringSessions, types, new Date(), lastRain?.date);
  const bedIcon = getBedMarker(types, urgency);
  // Show the synthetic rain-day card only while it's the actual reason this
  // bed's watering clock hasn't fired — i.e. it postdates the last real
  // watering session (or the bed's creation, if there are no sessions yet).
  const careAnchorMs = lastWateringSession
    ? new Date(lastWateringSession.performed_at).getTime()
    : new Date(bed.created_at).getTime();
  const showRainCard = !!lastRain && new Date(`${lastRain.date}T00:00:00`).getTime() > careAnchorMs;

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

  // Add/remove yourself from a session's participants (the face pile).
  const toggleParticipant = async (sessionId: string) => {
    if (!user) {
      nav('/login');
      return;
    }
    const uid = user.id;
    const sess = sessions?.find((s) => s.id === sessionId);
    const joined = (sess?.care_session_participants ?? []).some((p) => p.user_id === uid);
    const prev = sessions;
    setSessions((cur) =>
      (cur ?? []).map((s) => {
        if (s.id !== sessionId) return s;
        const list = s.care_session_participants ?? [];
        return {
          ...s,
          care_session_participants: joined
            ? list.filter((p) => p.user_id !== uid)
            : [...list, { user_id: uid }]
        };
      })
    );
    const { error: pErr } = joined
      ? await supabase
          .from('care_session_participants')
          .delete()
          .match({ session_id: sessionId, user_id: uid })
      : await supabase.from('care_session_participants').insert({ session_id: sessionId });
    if (pErr) {
      console.warn('Join/leave failed', pErr);
      setSessions(prev);
    }
  };

  // Hero gallery: newest care photo, then the map (always 2nd), then the rest
  // newest-first. Capped + lazy-loaded so we don't pull every image up front.
  const galleryPaths = sessions
    .flatMap((s) => (s.care_session_photos ?? []).map((p) => p.storage_path))
    .slice(0, GALLERY_MAX_PHOTOS);
  // Slides use 300px thumbnails — the gallery is 256px tall so full-size is wasted.
  // The lightbox gets full-size URLs so zoomed viewing stays sharp.
  const galleryThumbUrls = galleryPaths.map((path) => photoThumbUrl(path));
  const galleryPhotoUrls = galleryPaths.map((path) => photoUrl(path));
  const mapSlide = (
    <MapContainer
      center={[bed.latitude, bed.longitude]}
      zoom={17}
      scrollWheelZoom={false}
      dragging={false}
      doubleClickZoom={false}
      touchZoom={false}
      zoomControl={false}
      keyboard={false}
      className="h-full w-full"
    >
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
      <Marker position={[bed.latitude, bed.longitude]} icon={bedIcon} />
    </MapContainer>
  );
  const photoSlides = galleryThumbUrls.map((thumbUrl, i) => (
    <button
      key={`photo-${i}`}
      type="button"
      className="block h-full w-full cursor-zoom-in"
      onClick={() => setLightboxIndex(i)}
    >
      <img src={thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
    </button>
  ));
  const heroSlides =
    photoSlides.length === 0 ? [mapSlide] : [photoSlides[0], mapSlide, ...photoSlides.slice(1)];

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero gallery (photos + map). z-0 traps Leaflet's panes so the content
          sheet below can sit on the bottom edge. */}
      <div className="relative z-0 h-64">
        <Gallery slides={heroSlides} className="h-full w-full" dotClassName="bottom-8" />

        <button
          type="button"
          onClick={() => nav('/')}
          aria-label="Back to map"
          className="absolute left-3 top-3 z-[1000] grid h-9 w-9 place-items-center rounded-full bg-background/70 text-foreground shadow-md backdrop-blur transition-colors hover:bg-background/90"
        >
          <ChevronLeft className="h-5 w-5" />
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
            {showRainCard && safePage === 0 && activityFilter === 'all' && (
              <li key="rain-day">
                <RainDayCard date={lastRain!.date} />
              </li>
            )}
            {visibleSessions.map((s) => {
              const activityLabels = s.care_session_activities
                .map((a) => a.activity_types?.label)
                .filter(Boolean) as string[];
              const photoUrls = (s.care_session_photos ?? []).map((p) => photoUrl(p.storage_path));
              const thumbUrls = (s.care_session_photos ?? []).map((p) => photoThumbUrl(p.storage_path));
              return (
                <li key={s.id}>
                  <CareSessionCard
                    performedAt={s.performed_at}
                    notes={s.notes}
                    createdBy={s.created_by}
                    activityLabels={activityLabels}
                    photoUrls={photoUrls}
                    thumbUrls={thumbUrls}
                    reactions={s.care_session_reactions ?? []}
                    participantIds={(s.care_session_participants ?? []).map((p) => p.user_id)}
                    profiles={authors}
                    user={user}
                    userProfile={profile}
                    isAdmin={isAdmin}
                    editTo={`/bed/${bed.id}/care/${s.id}/edit`}
                    addPhotosTo={`/bed/${bed.id}/care/${s.id}/photos`}
                    onToggleReaction={(emoji) => toggleReaction(s.id, emoji)}
                    onToggleParticipant={() => toggleParticipant(s.id)}
                    onShare={() =>
                      shareCareSession({
                        text: `🌱 ${
                          activityLabels.length ? activityLabels.join(', ') : 'Care session'
                        } at ${bed.name ?? 'a tree bed'} — ${new Date(
                          s.performed_at
                        ).toLocaleDateString()} · BJH Garden Club`,
                        url: `${window.location.origin}${bed.code ? `/b/${bed.code}` : `/bed/${bed.id}`}`,
                        photoUrl: photoUrls[0] ?? null
                      })
                    }
                  />
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
      {lightboxIndex !== null && (
        <Lightbox
          photos={galleryPhotoUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
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
