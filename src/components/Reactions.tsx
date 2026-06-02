import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { cn } from '../lib/utils';

// Garden-themed palette offered by the "add reaction" button. The DB accepts
// any emoji, so this is just the UI set — easy to change.
export const REACTION_PALETTE = ['🌱', '❤️', '🙌', '🎉', '💧'];

type Reaction = { emoji: string; user_id: string };

/**
 * Slack-style emoji reactions. Shows a chip (emoji + count) per emoji used, with
 * the current user's picks highlighted; tap a chip to toggle it. Signed-in users
 * also get a "+" button revealing the palette. Logged-out users just see counts.
 */
export function Reactions({
  reactions,
  userId,
  onToggle
}: {
  reactions: Reaction[];
  userId: string | null;
  onToggle: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);

  // Aggregate count + "did I react" per emoji, ordered by the palette first.
  const agg = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const cur = agg.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (userId && r.user_id === userId) cur.mine = true;
    agg.set(r.emoji, cur);
  }
  const entries = [...agg.entries()].sort((a, b) => {
    const ia = REACTION_PALETTE.indexOf(a[0]);
    const ib = REACTION_PALETTE.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  if (entries.length === 0 && !userId) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {entries.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          disabled={!userId}
          onClick={() => onToggle(emoji)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
            mine
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-muted',
            !userId && 'cursor-default'
          )}
        >
          <span className="text-sm leading-none">{emoji}</span>
          <span className="tabular-nums">{count}</span>
        </button>
      ))}

      {userId && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Add reaction"
            aria-expanded={open}
            className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </button>
          {open && (
            <>
              {/* click-away catcher */}
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setOpen(false)}
              />
              <div className="absolute left-0 z-20 mt-1 flex gap-0.5 rounded-full border border-border bg-card p-1 shadow-md">
                {REACTION_PALETTE.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      onToggle(e);
                      setOpen(false);
                    }}
                    className="grid h-7 w-7 place-items-center rounded-full text-base leading-none hover:bg-muted"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
