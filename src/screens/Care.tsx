import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { ActivityType, TreeBedType, TreeBedWithTypes } from '../lib/types';
import { careUrgency, NEEDS_CARE_URGENCY, seasonalMultiplier } from '../lib/markerIcons';
import { Spinner } from '../components/Spinner';
import { Banner } from '../components/Banner';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { cn } from '../lib/utils';

type View = 'attention' | 'recent' | 'all';

const DEFAULT_VIEW: View = 'attention';
function parseView(raw: string | null): View {
  return raw === 'recent' || raw === 'all' || raw === 'attention' ? raw : DEFAULT_VIEW;
}

interface BedRow extends TreeBedWithTypes {
  care_sessions: Array<{
    performed_at: string;
    care_session_activities: Array<{ activity_type_id: number }>;
  }>;
}

export function Care() {
  const [beds, setBeds] = useState<BedRow[] | null>(null);
  const [types, setTypes] = useState<TreeBedType[]>([]);
  const [activities, setActivities] = useState<ActivityType[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | 'all'>('all');
  const [activityFilter, setActivityFilter] = useState<number | 'all'>('all');

  // Keep the active tab in the URL so back navigation lands here with the same
  // view the user was looking at.
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get('view'));
  const setView = (next: View) => {
    const params = new URLSearchParams(searchParams);
    if (next === DEFAULT_VIEW) params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [bedsRes, typeRes, actRes] = await Promise.all([
        supabase
          .from('tree_beds')
          .select(
            '*, tree_bed_type_assignments(type_id, tree_bed_types(label)), care_sessions(performed_at, care_session_activities(activity_type_id))'
          ),
        supabase.from('tree_bed_types').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('activity_types').select('*').eq('is_active', true).order('sort_order')
      ]);
      if (cancelled) return;
      if (bedsRes.error) setError(bedsRes.error.message);
      else setBeds(bedsRes.data as BedRow[]);
      if (!typeRes.error) setTypes((typeRes.data ?? []) as TreeBedType[]);
      if (!actRes.error) setActivities((actRes.data ?? []) as ActivityType[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Snapshot "now" once per render so urgency + sort stay consistent.
  const now = useMemo(() => new Date(), [beds]);
  const seasonMult = useMemo(() => seasonalMultiplier(now), [now]);

  const filtered = useMemo(() => {
    if (!beds) return [];
    const ql = q.trim().toLowerCase();
    const withUrgency = beds.map((b) => ({
      ...b,
      _urgency: careUrgency(
        b.created_at,
        b.care_sessions ?? [],
        b.tree_bed_type_assignments.map((a) => a.tree_bed_types?.label).filter(Boolean) as string[],
        now
      )
    }));

    let list = withUrgency.filter((b) => {
      if (ql) {
        const hay = `${b.address ?? ''} ${b.name ?? ''}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (typeFilter !== 'all') {
        const has = b.tree_bed_type_assignments.some((a) => a.type_id === typeFilter);
        if (!has) return false;
      }
      if (activityFilter !== 'all') {
        const has = b.care_sessions.some((s) =>
          s.care_session_activities?.some((a) => a.activity_type_id === activityFilter)
        );
        if (!has) return false;
      }
      return true;
    });

    if (view === 'recent') {
      list = list
        .filter((b) => latest(b.care_sessions) !== null)
        .sort((a, b) => (latest(b.care_sessions) ?? 0) - (latest(a.care_sessions) ?? 0));
    } else if (view === 'attention') {
      list = list
        .filter((b) => b._urgency >= NEEDS_CARE_URGENCY)
        .sort((a, b) => b._urgency - a._urgency);
    }
    return list;
  }, [beds, q, typeFilter, activityFilter, view, now]);

  if (beds === null && !error) return <Spinner label="Loading…" />;

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-3 p-4 pb-8">
        <Input
          placeholder="Search by name or address"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-2">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
          <Select
            value={activityFilter}
            onChange={(e) => setActivityFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">Any activity</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <ViewBtn label="Needs care" active={view === 'attention'} onClick={() => setView('attention')} />
          <ViewBtn label="Recent" active={view === 'recent'} onClick={() => setView('recent')} />
          <ViewBtn label="All" active={view === 'all'} onClick={() => setView('all')} />
        </div>

        {error && <Banner kind="error">{error}</Banner>}

        <p className="text-xs text-muted-foreground">
          {filtered.length} bed{filtered.length === 1 ? '' : 's'}
          {view === 'attention' && ` need care ${describeSeason(seasonMult)}`}
        </p>

        <ul className="space-y-2">
          {filtered.map((b) => {
            const last = latest(b.care_sessions);
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
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {last ? new Date(last).toLocaleDateString() : 'no care yet'}
                        </span>
                      </div>
                      {b.address && (
                        <div className="text-xs text-muted-foreground">{b.address}</div>
                      )}
                      {bedTypes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {bedTypes.map((t) => (
                            <Badge key={t} variant="muted">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function latest(sessions: Array<{ performed_at: string }>): number | null {
  if (!sessions.length) return null;
  return Math.max(...sessions.map((s) => new Date(s.performed_at).getTime()));
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
        'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}
