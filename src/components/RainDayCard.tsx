import { Droplets } from 'lucide-react';
import { Card, CardContent } from './ui/card';

/**
 * Synthetic, non-editable feed entry shown when recent rain was heavy/steady
 * enough to count as a watering (see lib/rain.ts + careUrgency). Never a real
 * `care_sessions` row — purely a client-side display, so it has none of
 * CareSessionCard's edit/share/photo/reaction affordances or its left photo
 * thumbnail — just a compact dark-blue text card.
 */
export function RainDayCard({ date }: { date: string }) {
  return (
    <Card className="border-blue-800 bg-blue-950">
      <CardContent className="p-3">
        <span className="inline-flex items-center gap-1 font-sans text-sm font-semibold text-blue-300">
          <Droplets className="h-3.5 w-3.5" />
          Watering
        </span>
        <p className="mt-1.5 text-sm text-blue-100">
          Rain day — nature watered this bed, no visit needed
        </p>
        <p className="mt-0.5 text-xs text-blue-300/70">
          {/* `date` is a plain YYYY-MM-DD from Open-Meteo — parse as local
              midnight, not UTC, so it doesn't shift a day in negative UTC
              offsets (e.g. America/New_York). */}
          {new Date(`${date}T00:00:00`).toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })}
        </p>
      </CardContent>
    </Card>
  );
}
