import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export function Lightbox({
  photos,
  initialIndex = 0,
  onClose
}: {
  photos: string[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(photos.length - 1, i + 1));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, photos.length]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </button>

      <img
        src={photos[idx]}
        alt=""
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            disabled={idx === 0}
            className="absolute left-4 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white disabled:opacity-30"
            onClick={(e) => { e.stopPropagation(); setIdx((i) => i - 1); }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            disabled={idx === photos.length - 1}
            className="absolute right-4 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white disabled:opacity-30"
            onClick={(e) => { e.stopPropagation(); setIdx((i) => i + 1); }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="absolute bottom-4 text-xs text-white/70">
            {idx + 1} / {photos.length}
          </span>
        </>
      )}
    </div>
  );
}
