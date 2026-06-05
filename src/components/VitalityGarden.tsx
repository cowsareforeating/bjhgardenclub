import { useEffect, useRef, useState } from 'react';

// ============================================================================
// VitalityGarden
// ----------------------------------------------------------------------------
// A decorative strip of Lucide-style sprouts, trees & flowers that signals club
// health as a *density of life*: the higher `vitality` (0..1), the more plants
// fade in. Plants scatter across the available width by density (responsive —
// a wider strip simply holds more, not bigger), each at a randomized position,
// size, hue, mirror and sway timing. Movement is always on; opacity + depth
// make it feel lush. Purely visual — pointer-events are off and it's aria-hidden.
//
// Drop it into a flex row and let it take the leftover space:
//   <VitalityGarden vitality={score} className="mx-2 min-w-0 flex-1 self-stretch" />
// ============================================================================

type Plant = {
  iconIndex: number;
  left: number; // percent
  bottom: number; // px
  size: number; // px
  flip: boolean;
  fol: string; // foliage / stem colour
  bloom: string; // flower bloom colour
  dur: number;
  delay: number;
  amp: number;
  threshold: number; // vitality at which it starts to appear
  base: number; // its max opacity (depth)
};

const BLOOM_HUES = [330, 344, 48, 275, 12, 210]; // pink, rose, yellow, violet, red-orange, blue
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pick = <T,>(arr: T[]): T => arr[(Math.random() * arr.length) | 0];

// Each icon: `stem` is the always-green part; `bloom` (flowers only) is the
// coloured part. 24×24 viewBox, matching Lucide's geometry & caps.
const ICONS: Array<{ stem: JSX.Element; bloom?: JSX.Element }> = [
  // --- sprouts ---
  {
    stem: (
      <>
        <path d="M12 22V11" />
        <path d="M12 13c-3 0-5-2-5-5 3 0 5 2 5 5Z" />
        <path d="M12 11c0-3 2-5 5-5 0 3-2 5-5 5Z" />
      </>
    )
  },
  {
    stem: (
      <>
        <path d="M12 22V9" />
        <path d="M12 15c-3 0-5-2-5-5 3 0 5 2 5 5Z" />
        <path d="M12 13c3 0 5-2 5-5-3 0-5 2-5 5Z" />
        <path d="M12 11c0-2.5 1.3-4.3 3.5-5C16 8.6 14.3 11 12 11Z" />
      </>
    )
  },
  {
    stem: (
      <>
        <path d="M12 22v-9" />
        <path d="M12 13c0-4 3.5-6 8-6 .3 3-2 6-5 6" />
        <path d="M12 17c-3 0-5-2-5-5 3 0 5 2 5 5Z" />
      </>
    )
  },
  // --- trees ---
  {
    stem: (
      <>
        <path d="M12 21v-5" />
        <circle cx="12" cy="9" r="6" />
      </>
    )
  },
  {
    stem: (
      <>
        <path d="M12 22v-3" />
        <path d="M12 3 7.5 10h9Z" />
        <path d="M12 8 6 15h12Z" />
        <path d="M12 13 5 19h14Z" />
      </>
    )
  },
  {
    stem: (
      <>
        <path d="M12 22v-7" />
        <path d="M12 2c2.8 0 4.5 2.7 4.5 6S14.8 15 12 15s-4.5-3.7-4.5-7S9.2 2 12 2Z" />
        <path d="M12 4v9" />
      </>
    )
  },
  // --- flowers ---
  {
    stem: (
      <>
        <path d="M12 21v-8" />
        <path d="M12 17c2.2 0 3.6-1.4 3.6-3.6-2.2 0-3.6 1.4-3.6 3.6Z" />
      </>
    ),
    bloom: (
      <>
        <circle cx="12" cy="5.2" r="2.3" />
        <circle cx="12" cy="10.8" r="2.3" />
        <circle cx="9.2" cy="8" r="2.3" />
        <circle cx="14.8" cy="8" r="2.3" />
        <circle cx="12" cy="8" r="1.4" />
      </>
    )
  },
  {
    stem: (
      <>
        <path d="M12 22v-9" />
        <path d="M12 18c-2.3 0-3.8-1.6-3.8-3.8 2.3 0 3.8 1.6 3.8 3.8Z" />
      </>
    ),
    bloom: (
      <>
        <path d="M8.5 9c0-2.5 1.4-4.5 3.5-4.5S15.5 6.5 15.5 9c0 2.2-1.4 4-3.5 4S8.5 11.2 8.5 9Z" />
        <path d="M12 4.5V13" />
      </>
    )
  },
  {
    stem: (
      <>
        <path d="M12 22V7" />
        <path d="M12 13c-2.2-.3-3.4-1.8-3.7-4" />
        <path d="M12 17c2.2-.3 3.4-1.8 3.7-4" />
      </>
    ),
    bloom: (
      <>
        <circle cx="12" cy="5" r="2" />
        <circle cx="8" cy="8.5" r="1.5" />
        <circle cx="16" cy="11" r="1.5" />
      </>
    )
  }
];

export function VitalityGarden({
  vitality = 0.7,
  className
}: {
  vitality?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const lastMax = useRef(-1);

  // (Re)generate the plant set whenever the strip's density target changes.
  // Density = ~one plant per half-height of width, so it stays constant per
  // unit width as the container resizes. Randomised fresh each time → no two
  // loads (or resizes) look the same.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const build = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      // Spacing ~0.83h → 60% of the old (0.5h) max density at full vitality.
      const max = Math.max(2, Math.round(w / (h * 0.83)));
      if (max === lastMax.current) return;
      lastMax.current = max;

      const slot = 100 / max; // each plant owns one lane → no direct stacking
      const next: Plant[] = [];
      for (let i = 0; i < max; i++) {
        const iconIndex = (Math.random() * ICONS.length) | 0;
        const size = rand(h * 0.6, h * 1.08);
        const depth = (size / h - 0.6) / 0.48; // 0..~1, smaller = further back
        next.push({
          iconIndex,
          // lane centre + jitter (±~42% of the lane): more overlap than before,
          // but never a direct stack.
          left: clamp(slot * (i + 0.5) + (Math.random() - 0.5) * slot * 0.85, 0, 100),
          bottom: rand(-2, h * 0.05),
          size,
          flip: Math.random() < 0.5,
          fol: `hsl(${Math.round(132 + rand(-16, 26))} 56% ${Math.round(33 + rand(0, 13))}%)`,
          bloom: `hsl(${pick(BLOOM_HUES)} 72% 58%)`,
          dur: rand(3.6, 6.4),
          delay: -rand(0, 6),
          amp: rand(2.4, 5),
          threshold: Math.random(),
          base: clamp(0.5 + depth * 0.45 + rand(-0.08, 0.08), 0.42, 1)
        });
      }
      setPlants(next);
    };

    build();
    const ro = new ResizeObserver(build);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const v = clamp(vitality, 0, 1);

  return (
    <div
      ref={ref}
      aria-hidden
      className={className}
      style={{ position: 'relative', overflow: 'hidden', pointerEvents: 'none' }}
    >
      {plants.map((p, idx) => {
        const icon = ICONS[p.iconIndex];
        // fade in over a small band once vitality crosses this plant's threshold
        const opacity = clamp((v - p.threshold) / 0.12, 0, 1) * p.base;
        return (
          <span
            key={idx}
            style={{
              position: 'absolute',
              bottom: p.bottom,
              left: `${p.left}%`,
              lineHeight: 0,
              transform: `translateX(-50%)${p.flip ? ' scaleX(-1)' : ''}`,
              zIndex: Math.round(p.size), // bigger = nearer the front
              opacity,
              transition: 'opacity .55s ease'
            }}
          >
            <svg
              width={p.size}
              height={p.size}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color: p.fol }}
            >
              <g
                className="vg-sway"
                style={
                  {
                    '--vg-dur': `${p.dur}s`,
                    '--vg-delay': `${p.delay}s`,
                    '--vg-amp': `${p.amp}deg`
                  } as React.CSSProperties
                }
              >
                {icon.stem}
                {icon.bloom && <g style={{ color: p.bloom }}>{icon.bloom}</g>}
              </g>
            </svg>
          </span>
        );
      })}
    </div>
  );
}
