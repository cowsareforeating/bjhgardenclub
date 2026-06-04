import { cn } from '../lib/utils';

/**
 * Horizontally scrollable strip of photos. Each image is normalized to a fixed
 * height with natural width, so varied aspect ratios show with minimal cropping
 * (no forced square/banner). A gallery that doesn't show everything at once.
 */
export function PhotoStrip({ photos, className }: { photos: string[]; className?: string }) {
  if (photos.length === 0) return null;
  return (
    <div
      className={cn(
        'flex snap-x gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]',
        '[&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {photos.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          loading="lazy"
          className="h-28 w-auto shrink-0 snap-start rounded-lg border border-border object-cover"
        />
      ))}
    </div>
  );
}
