import { UIEvent, useState } from 'react';
import { cn } from '../lib/utils';

/**
 * Swipeable photo gallery. Photos lay out in a horizontal scroll-snap track —
 * swipe (or trackpad-scroll) to move between them; no tiny chevron targets.
 * Dots reflect the current photo. Tapping a photo opens it full-size. Fills its
 * container via `className` (e.g. "h-20 w-20 rounded-2xl").
 */
export function PhotoCarousel({ photos, className }: { photos: string[]; className?: string }) {
  const [idx, setIdx] = useState(0);
  if (photos.length === 0) return null;

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
        {photos.map((url, i) => (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block h-full w-full shrink-0 snap-center"
          >
            <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
          </a>
        ))}
      </div>

      {photos.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
          {photos.map((_, d) => (
            <span
              key={d}
              className={cn('h-1 w-1 rounded-full bg-background/50', d === idx && 'bg-background')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
