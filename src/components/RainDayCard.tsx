import { CloudRain } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

/**
 * Synthetic, non-editable feed entry shown when recent rain was heavy/steady
 * enough to count as a watering (see lib/rain.ts + careUrgency). Never a real
 * `care_sessions` row — purely a client-side display, so it has none of
 * CareSessionCard's edit/share/photo/reaction affordances. Icon column is
 * sized down from CareSessionCard's 80px thumbnail (h-12 vs h-20) and "Rain
 * day" + the Watering tag share one line, so the card stays compact.
 */
export function RainDayCard({ date }: { date: string }) {
  return (
    <Card className="border-blue-800 bg-blue-950">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-900 text-blue-300">
          <CloudRain className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-blue-100">Rain day</span>
            <Badge className="border-blue-700 bg-blue-900 text-blue-200">Watering</Badge>
          </div>
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
        </div>
      </CardContent>
    </Card>
  );
}
