import { MouseEvent, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Minimal, dependency-free photo carousel. Shows one photo at a time; with more
 * than one it adds prev/next chevrons (wrap-around) and dot indicators. The
 * image itself links to the full-size original. Sizes to its container via
 * `className` (e.g. "h-20 w-20 rounded-2xl").
 */
export function PhotoCarousel({ photos, className }: { photos: string[]; className?: string }) {
  const [i, setI] = useState(0);
  if (photos.length === 0) return null;

  const n = photos.length;
  const idx = ((i % n) + n) % n; // wrap into range
  const step = (e: MouseEvent, dir: number) => {
    e.preventDefault();
    e.stopPropagation();
    setI((v) => v + dir);
  };

  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <a href={photos[idx]} target="_blank" rel="noreferrer" className="block h-full w-full">
        <img src={photos[idx]} alt="" loading="lazy" className="h-full w-full object-cover" />
      </a>

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={(e) => step(e, -1)}
            className="absolute left-0.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-foreground/55 text-background transition-colors hover:bg-foreground/80"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={(e) => step(e, 1)}
            className="absolute right-0.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-foreground/55 text-background transition-colors hover:bg-foreground/80"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
            {photos.map((_, d) => (
              <span
                key={d}
                className={cn('h-1 w-1 rounded-full bg-background/50', d === idx && 'bg-background')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
