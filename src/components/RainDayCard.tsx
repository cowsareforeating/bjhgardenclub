import { CloudRain, Droplets } from 'lucide-react';
import { Card, CardContent } from './ui/card';

/**
 * Synthetic, non-editable feed entry shown when recent rain was heavy/steady
 * enough to count as a watering (see lib/rain.ts + careUrgency). Never a real
 * `care_sessions` row — purely a client-side display, so it has none of
 * CareSessionCard's edit/share/photo/reaction affordances, but mirrors its
 * layout exactly (80px icon column, inline icon+label row) just in blue, so
 * the two card types line up in a shared feed.
 */
export function RainDayCard({ date }: { date: string }) {
  return (
    <Card className="border-blue-800 bg-blue-950">
      <CardContent className="flex gap-3 p-3">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-blue-900 text-blue-300">
          <CloudRain className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-blue-100">
              <CloudRain className="h-3.5 w-3.5 text-blue-300" />
              Rain day
            </span>
            <span className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-blue-100">
              <Droplets className="h-3.5 w-3.5 text-blue-300" />
              Watering
            </span>
          </div>
          <p className="mt-1.5 text-xs text-blue-300/70">
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
