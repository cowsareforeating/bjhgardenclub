import { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Pencil, Share2, Sprout } from 'lucide-react';
import { activityIcon } from '../lib/activityIcons';
import type { PublicProfile } from '../lib/types';
import { Avatar } from './Avatar';
import { PhotoCarousel } from './PhotoCarousel';
import { Reactions } from './Reactions';
import { Card, CardContent } from './ui/card';

export interface CareSessionCardProps {
  performedAt: string;
  notes?: string | null;
  createdBy: string | null;
  activityLabels: string[];
  photoUrls: string[];
  reactions: Array<{ emoji: string; user_id: string }>;
  participantIds: string[];
  /** Alias/avatar lookup for the face pile. */
  profiles: Record<string, PublicProfile>;
  user: { id: string } | null;
  /** Current user's own profile, so a just-joined avatar shows instantly. */
  userProfile: { alias: string | null; avatar_path: string | null } | null;
  isAdmin: boolean;
  /** Route for the edit pencil. */
  editTo: string;
  /** When present (e.g. the Recent feed), show the bed name for context. */
  bed?: { name: string | null };
  /** When provided, tapping the card (outside its buttons) runs this. */
  onOpen?: () => void;
  onToggleReaction: (emoji: string) => void;
  onToggleParticipant: () => void;
  onShare: () => void;
}

/**
 * The care-history card, shared by the bed detail page and the Recent feed.
 * Presentational — all mutations come back through the callbacks.
 */
export function CareSessionCard({
  performedAt,
  notes,
  createdBy,
  activityLabels,
  photoUrls,
  reactions,
  participantIds,
  profiles,
  user,
  userProfile,
  isAdmin,
  editTo,
  bed,
  onOpen,
  onToggleReaction,
  onToggleParticipant,
  onShare
}: CareSessionCardProps) {
  const canEdit = !!user && (isAdmin || createdBy === user.id);
  // Interactive bits stop the card-wide tap so only the "body" opens the bed.
  const stop = (e: MouseEvent) => e.stopPropagation();
  // Face pile = creator + participants, deduped.
  const pileIds = [...new Set([createdBy, ...participantIds].filter(Boolean))] as string[];
  const pile = pileIds.map((pid) =>
    pid === user?.id
      ? profiles[pid] ?? { id: pid, alias: userProfile?.alias ?? null, avatar_path: userProfile?.avatar_path ?? null }
      : profiles[pid] ?? { id: pid, alias: null, avatar_path: null }
  );
  const pileNames = pile.map((p) => p.alias || 'Member');
  const pileLabel =
    pileNames.length <= 1 ? pileNames[0] ?? 'Member' : `${pileNames[0]} +${pileNames.length - 1}`;
  const isParticipant = !!user && participantIds.includes(user.id);

  return (
    <Card
      onClick={onOpen}
      className={onOpen ? 'cursor-pointer transition-colors hover:bg-muted/40' : undefined}
    >
      <CardContent className="flex gap-3 p-3">
        {photoUrls.length > 0 ? (
          <div className="shrink-0" onClick={stop}>
            <PhotoCarousel photos={photoUrls} className="h-20 w-20 rounded-2xl" />
          </div>
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
                      className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-foreground"
                    >
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      {a}
                    </span>
                  );
                })
              ) : (
                <span className="text-sm font-semibold text-foreground">Care session</span>
              )}
            </div>
            <div className="-mr-1 -mt-0.5 flex shrink-0 items-center gap-0.5" onClick={stop}>
              <button
                type="button"
                aria-label="Share to WhatsApp"
                onClick={onShare}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
              {canEdit && (
                <Link
                  to={editTo}
                  aria-label="Edit care session"
                  className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>

          {bed && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{bed.name ?? 'Tree bed'}</span>
            </div>
          )}

          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="flex shrink-0 -space-x-2">
              {pile.slice(0, 4).map((p) => (
                <Avatar key={p.id} size={20} alias={p.alias} avatarPath={p.avatar_path} className="ring-2 ring-card" />
              ))}
            </div>
            <span className="min-w-0 truncate text-xs font-medium text-foreground">{pileLabel}</span>
            {user && createdBy !== user.id && (
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  onToggleParticipant();
                }}
                aria-pressed={isParticipant}
                className={
                  isParticipant
                    ? 'shrink-0 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 font-sans text-xs font-medium text-primary'
                    : 'shrink-0 rounded-md border border-border bg-card px-2 py-0.5 font-sans text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                }
              >
                {isParticipant ? 'Joined ✓' : 'I joined'}
              </button>
            )}
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground">
            {new Date(performedAt).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
            {photoUrls.length > 0 && ` · ${photoUrls.length} photo${photoUrls.length > 1 ? 's' : ''}`}
          </p>

          {notes && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{notes}</p>}

          <div onClick={stop}>
            <Reactions reactions={reactions} userId={user?.id ?? null} onToggle={onToggleReaction} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
