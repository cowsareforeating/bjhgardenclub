import { ReactNode, UIEvent, useState } from 'react';
import { cn } from '../lib/utils';

/**
 * Swipeable scroll-snap gallery of arbitrary slides (photos, a map, etc.).
 * Swipe / trackpad-scroll to move; dots track the current slide. Fills its
 * container via `className`. `dotClassName` overrides the dots' position
 * (default bottom-1) — useful when something overlaps the bottom edge.
 */
export function Gallery({
  slides,
  className,
  dotClassName
}: {
  slides: ReactNode[];
  className?: string;
  dotClassName?: string;
}) {
  const [idx, setIdx] = useState(0);
  if (slides.length === 0) return null;

  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const i = el.clientWidth ? Math.round(el.scrollLeft / el.clientWidth) : 0;
    if (i !== idx) setIdx(i);
  };

  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <div
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((s, i) => (
          <div key={i} className="h-full w-full shrink-0 snap-center">
            {s}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 flex justify-center gap-1',
            dotClassName ?? 'bottom-1'
          )}
        >
          {slides.map((_, d) => (
            <span
              key={d}
              className={cn(
                'h-1.5 w-1.5 rounded-full bg-background/50 shadow',
                d === idx && 'bg-background'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
