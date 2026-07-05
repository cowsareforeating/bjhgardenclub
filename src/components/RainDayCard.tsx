import { Droplets } from 'lucide-react';
import { Card, CardContent } from './ui/card';

/**
 * Synthetic, non-editable feed entry shown when recent rain was heavy/steady
 * enough to count as a watering (see lib/rain.ts + careUrgency). Never a real
 * `care_sessions` row — purely a client-side display, so it has none of
 * CareSessionCard's edit/share/photo/reaction affordances.
 *
 * The app is dark-mode-only (no light theme to fall back on — see
 * index.html), so this is styled as a deliberate light-blue highlight against
 * the dark feed rather than a muted dark-mode tint, to read clearly as
 * "different from a real session."
 */
export function RainDayCard({ date }: { date: string }) {
  return (
    <Card className="border-sky-300 bg-sky-100">
      <CardContent className="flex gap-3 p-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-sky-200 text-sky-600">
          <Droplets className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-sky-700">
            <Droplets className="h-3.5 w-3.5" />
            Watering
          </span>
          <p className="mt-1.5 text-sm text-sky-900">
            Rain day — nature watered this bed, no visit needed
          </p>
          <p className="mt-0.5 text-xs text-sky-700/80">
            {/* `date` is a plain YYYY-MM-DD from Open-Meteo — parse as local
                midnight, not UTC, so it doesn't shift a day in negative UTC
                offsets (e.g. America/New_York). */}
            {new Date(`${date}T00:00:00`).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
