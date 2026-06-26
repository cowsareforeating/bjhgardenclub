import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { ActivityType, TreeBedType, TreeBedWithTypes, PublicProfile } from '../lib/types';
import { careUrgency, NEEDS_CARE_URGENCY, seasonalMultiplier } from '../lib/markerIcons';
import { shareCareSession } from '../lib/share';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Avatar } from '../components/Avatar';
import { CareSessionCard } from '../components/CareSessionCard';
import { cn } from '../lib/utils';

const PHOTO_BUCKET = 'care-photos';
const PAGE_SIZE = 20;

type View = 'attention' | 'recent' | 'all';

const DEFAULT_VIEW: View = 'attention';
function parseView(raw: string | null): View {
  return raw === 'recent' || raw === 'all' || raw === 'attention' ? raw : DEFAULT_VIEW;
}

interface BedRow extends TreeBedWithTypes {
  care_sessions: Array<{
    id: string;
    performed_at: string;
    created_by: string | null;
    care_session_reactions: Array<{ emoji: string; user_id: string }>;
    care_session_participants: Array<{ user_id: string }>;
    care_session_photos: Array<{ id: number; storage_path: string }>;
    care_session_activities: Array<{ activity_type_id: number }>;
  }>;
}

export function Care() {
  const { user, profile, isAdmin } = useAuth();
  const nav = useNavigate();
  const [beds, setBeds] = useState<BedRow[] | null>(null);
  const [types, setTypes] = useState<TreeBedType[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [stewards, setStewards] = useState<Record<string, PublicProfile>>({});
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | 'all'>('all');
  const [activityFilter, setActivityFilter] = useState<number | 'all'>('all');
  const [page, setPage] = useState(0);

  // Keep the active tab in the URL so back navigation lands here with the same
  // view the user was looking at.
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get('view'));
  const setView = (next: View) => {
    const params = new URLSearchParams(searchParams);
    if (next === DEFAULT_VIEW) params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
    setPage(0);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [bedsRes, typeRes, actRes] = await Promise.all([
        supabase
          .from('tree_beds')
          .select(
            '*, tree_bed_type_assignments(type_id, tree_bed_types(label)), care_sessions(id, performed_at, created_by, care_session_reactions(emoji, user_id), care_session_participants(user_id), care_session_photos(id, storage_path), care_session_activities(activity_type_id))'
          ),
        supabase.from('tree_bed_types').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('activity_types').select('*').eq('is_active', true).order('sort_order')
      ]);
      if (cancelled) return;
      if (!typeRes.error) setTypes((typeRes.data ?? []) as TreeBedType[]);
      if (!actRes.error) setActivities((actRes.data ?? []) as ActivityType[]);
      if (bedsRes.error) {
        setError(bedsRes.error.message);
      } else {
        const rows = (bedsRes.data ?? []) as BedRow[];
        setBeds(rows);
        // Profiles for everyone involved (creators + participants) — one query,
        // used for the steward avatar and the feed face piles.
        const ids = [
          ...new Set(
            rows.flatMap((b) =>
              (b.care_sessions ?? []).flatMap((s) => [
                s.created_by,
                ...(s.care_session_participants ?? []).map((p) => p.user_id)
              ])
            )
          )
        ].filter(Boolean) as string[];
        if (ids.length) {
          const { data: profs } = await supabase
            .from('public_profiles')
            .select('id, alias, avatar_path')
            .in('id', ids);
          if (!cancelled && profs) {
            setStewards(Object.fromEntries((profs as PublicProfile[]).map((p) => [p.id, p])));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Snapshot "now" once per render so urgency + sort stay consistent.
  const now = useMemo(() => new Date(), [beds]);
  const seasonMult = useMemo(() => seasonalMultiplier(now), [now]);

  // Beds after the text + type filters. Activity is a feed-only filter now
  // (it's a property of a session, not a bed) — see feedItems below.
  const bedsFiltered = useMemo(() => {
    if (!beds) return [];
    const ql = q.trim().toLowerCase();
    return beds
      .map((b) => ({
        ...b,
        _urgency: careUrgency(
          b.created_at,
          b.care_sessions ?? [],
          b.tree_bed_type_assignments.map((a) => a.tree_bed_types?.label).filter(Boolean) as string[],
          now
        )
      }))
      .filter((b) => {
        if (ql) {
          const hay = `${b.address ?? ''} ${b.name ?? ''}`.toLowerCase();
          if (!hay.includes(ql)) return false;
        }
        if (typeFilter !== 'all' && !b.tree_bed_type_assignments.some((a) => a.type_id === typeFilter)) {
          return false;
        }
        return true;
      });
  }, [beds, q, typeFilter, now]);

  // Needs care / All tabs: a bed list.
  const bedList = useMemo(() => {
    if (view === 'attention') {
      return bedsFiltered
        .filter((b) => b._urgency >= NEEDS_CARE_URGENCY)
        .sort((a, b) => b._urgency - a._urgency);
    }
    return bedsFiltered; // 'all'
  }, [bedsFiltered, view]);

  // Recent tab: a feed of individual care sessions (newest first), with the
  // activity filter applied per session.
  const feedItems = useMemo(() => {
    const items = bedsFiltered.flatMap((b) =>
      (b.care_sessions ?? []).map((s) => ({ session: s, bed: b }))
    );
    const matched =
      activityFilter === 'all'
        ? items
        : items.filter(({ session }) =>
            session.care_session_activities?.some((a) => a.activity_type_id === activityFilter)
          );
    return matched
      .map((item) => ({ item, ts: +new Date(item.session.performed_at) }))
      .sort((a, b) => b.ts - a.ts)
      .map(({ item }) => item);
  }, [bedsFiltered, activityFilter]);

  // Pagination — shared state resets on view/filter changes (see setView and
  // the filter onChange handlers below). Source list depends on current view.
  const sourceList = view === 'recent' ? feedItems : bedList;
  const totalItems = sourceList.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const visibleFeedItems = feedItems.slice(pageStart, pageEnd);
  const visibleBedList = bedList.slice(pageStart, pageEnd);

  // Toggle a reaction on a care session (Recent feed).
  const toggleReaction = async (sessionId: string, emoji: string) => {
    if (!user) return;
    const uid = user.id;
    const bed = beds?.find((b) => b.care_sessions.some((s) => s.id === sessionId));
    const sess = bed?.care_sessions.find((s) => s.id === sessionId);
    const mine = (sess?.care_session_reactions ?? []).some((r) => r.emoji === emoji && r.user_id === uid);
    const prev = beds;
    setBeds((cur) =>
      (cur ?? []).map((b) => ({
        ...b,
        care_sessions: b.care_sessions.map((s) => {
          if (s.id !== sessionId) return s;
          const list = s.care_session_reactions ?? [];
          return {
            ...s,
            care_session_reactions: mine
              ? list.filter((r) => !(r.emoji === emoji && r.user_id === uid))
              : [...list, { emoji, user_id: uid }]
          };
        })
      }))
    );
    const { error: rxErr } = mine
      ? await supabase
          .from('care_session_reactions')
          .delete()
          .match({ care_session_id: sessionId, user_id: uid, emoji })
      : await supabase.from('care_session_reactions').insert({ care_session_id: sessionId, emoji });
    if (rxErr) {
      console.warn('Reaction failed', rxErr);
      setBeds(prev);
    }
  };

  // Add/remove yourself from a session's participants (Recent tab cards).
  const toggleParticipant = async (sessionId: string) => {
    if (!user) {
      nav('/login');
      return;
    }
    const uid = user.id;
    const bed = beds?.find((b) => b.care_sessions.some((s) => s.id === sessionId));
    const sess = bed?.care_sessions.find((s) => s.id === sessionId);
    const joined = (sess?.care_session_participants ?? []).some((p) => p.user_id === uid);
    const prev = beds;
    setBeds((cur) =>
      (cur ?? []).map((b) => ({
        ...b,
        care_sessions: b.care_sessions.map((s) => {
          if (s.id !== sessionId) return s;
          const list = s.care_session_participants ?? [];
          return {
            ...s,
            care_session_participants: joined
              ? list.filter((p) => p.user_id !== uid)
              : [...list, { user_id: uid }]
          };
        })
      }))
    );
    const { error: pErr } = joined
      ? await supabase
          .from('care_session_participants')
          .delete()
          .match({ session_id: sessionId, user_id: uid })
      : await supabase.from('care_session_participants').insert({ session_id: sessionId });
    if (pErr) {
      console.warn('Join/leave failed', pErr);
      setBeds(prev);
    }
  };

  if (beds === null && !error) return <Spinner label="Loading…" />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-4 pb-8">
        <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or address"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <Select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(0); }}
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          {/* Activity is a per-session filter — only meaningful on the Recent feed. */}
          {view === 'recent' && (
            <div className="flex-1">
              <Select
                value={activityFilter}
                onChange={(e) => { setActivityFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(0); }}
              >
                <option value="all">Any activity</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <ViewBtn label="Needs care" active={view === 'attention'} onClick={() => setView('attention')} />
          <ViewBtn label="Recent" active={view === 'recent'} onClick={() => setView('recent')} />
          <ViewBtn label="All" active={view === 'all'} onClick={() => setView('all')} />
        </div>
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <p className="text-xs text-muted-foreground">
          {view === 'recent'
            ? `${feedItems.length} care session${feedItems.length === 1 ? '' : 's'}`
            : `${bedList.length} bed${bedList.length === 1 ? '' : 's'}${
                view === 'attention' ? ` need care ${describeSeason(seasonMult)}` : ''
              }`}
        </p>

        <ul className="space-y-2">
          {view === 'recent'
            ? visibleFeedItems.map(({ session, bed }) => {
                const activityLabels = session.care_session_activities
                  .map((a) => activities.find((x) => x.id === a.activity_type_id)?.label)
                  .filter(Boolean) as string[];
                const photoUrls = (session.care_session_photos ?? []).map(
                  (p) => supabase.storage.from(PHOTO_BUCKET).getPublicUrl(p.storage_path).data.publicUrl
                );
                return (
                  <li key={session.id}>
                    <CareSessionCard
                      performedAt={session.performed_at}
                      createdBy={session.created_by}
                      activityLabels={activityLabels}
                      photoUrls={photoUrls}
                      reactions={session.care_session_reactions ?? []}
                      participantIds={(session.care_session_participants ?? []).map((p) => p.user_id)}
                      profiles={stewards}
                      user={user}
                      userProfile={profile}
                      isAdmin={isAdmin}
                      editTo={`/bed/${bed.id}/care/${session.id}/edit`}
                      addPhotosTo={`/bed/${bed.id}/care/${session.id}/photos`}
                      bed={{ name: bed.name }}
                      onOpen={() => nav(`/bed/${bed.id}`)}
                      onToggleReaction={(emoji) => toggleReaction(session.id, emoji)}
                      onToggleParticipant={() => toggleParticipant(session.id)}
                      onShare={() =>
                        shareCareSession({
                          text: `🌱 ${
                            activityLabels.length ? activityLabels.join(', ') : 'Care session'
                          } at ${bed.name ?? 'a tree bed'} — ${new Date(
                            session.performed_at
                          ).toLocaleDateString()} · BJH Garden Club`,
                          url: `${window.location.origin}${bed.code ? `/b/${bed.code}` : `/bed/${bed.id}`}`,
                          photoUrl: photoUrls[0] ?? null
                        })
                      }
                    />
                  </li>
                );
              })
            : visibleBedList.map((b) => {
                const lastSession = (b.care_sessions ?? []).reduce<BedRow['care_sessions'][number] | null>(
                  (acc, s) => (!acc || new Date(s.performed_at) > new Date(acc.performed_at) ? s : acc),
                  null
                );
                const steward = lastSession?.created_by ? stewards[lastSession.created_by] : undefined;
                const bedTypes = b.tree_bed_type_assignments
                  .map((a) => a.tree_bed_types?.label)
                  .filter(Boolean) as string[];
                return (
                  <li key={b.id}>
                    <Link to={`/bed/${b.id}`} className="block">
                      <Card className="transition-colors hover:bg-muted/40">
                        <CardContent className="space-y-1.5 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <UrgencyDot urgency={b._urgency} />
                              <span className="truncate text-sm font-medium">{b.name ?? 'Tree bed'}</span>
                            </div>
                            {lastSession ? (
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Avatar size={18} alias={steward?.alias} avatarPath={steward?.avatar_path} />
                                <span className="text-xs text-muted-foreground">
                                  Last care: {new Date(lastSession.performed_at).toLocaleDateString()}
                                </span>
                              </div>
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">No care yet</span>
                            )}
                          </div>
                          {b.address && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{b.address}</span>
                            </div>
                          )}
                          <div className="flex items-end justify-between gap-2">
                            {bedTypes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {bedTypes.map((t) => (
                                  <Badge key={t}>{t}</Badge>
                                ))}
                              </div>
                            ) : (
                              <span />
                            )}
                            {user && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  nav(`/bed/${b.id}/care/new`);
                                }}
                                className="inline-flex shrink-0 items-center rounded-md border border-primary/40 bg-primary/10 px-2 py-1 font-sans text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                              >
                                Log care
                              </button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                );
              })}
        </ul>

        {totalItems > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage((p) => p - 1)}
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
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function describeSeason(mult: number): string {
  if (mult >= 1.5) return 'this winter';               // 2.0×
  if (mult <= 0.75) return 'right now in peak summer'; // 0.5×
  return 'this season';                                // 1.0×
}

/** Small dot whose color tracks urgency: muted → amber → red. */
function UrgencyDot({ urgency }: { urgency: number }) {
  const color =
    urgency >= 0.8
      ? 'bg-destructive'
      : urgency >= NEEDS_CARE_URGENCY
      ? 'bg-amber-500'
      : 'bg-muted-foreground/40';
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color)} aria-hidden />;
}

function ViewBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md py-1.5 font-sans text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}
