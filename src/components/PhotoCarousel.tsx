import { Gallery } from './Gallery';

/**
 * Swipeable photo gallery (thin wrapper over Gallery). Each photo is a snap
 * slide; tapping opens it full-size. Fills its container via `className`.
 */
export function PhotoCarousel({ photos, className }: { photos: string[]; className?: string }) {
  if (photos.length === 0) return null;
  return (
    <Gallery
      className={className}
      slides={photos.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noreferrer" className="block h-full w-full">
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        </a>
      ))}
    />
  );
}
