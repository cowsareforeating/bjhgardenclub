import { Crosshair } from 'lucide-react';
import type { LocationPickerState } from '../lib/useLocationPicker';
import { LocationMap } from './map/LocationMap';
import { Input } from './ui/input';
import { Label } from './ui/label';

// ============================================================================
// LocationPicker
// ----------------------------------------------------------------------------
// The full "where is this?" UI for the create flow: an address search box with
// a GPS button, a results dropdown, and the editable map. Wire it to a
// useLocationPicker() instance. (Edit screens use <LocationMap> directly with a
// plain address field, since they load a known location and don't search.)
// ============================================================================

export function LocationPicker({ loc }: { loc: LocationPickerState }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="location">Location</Label>
      <div className="relative">
        <Input
          id="location"
          value={loc.address}
          onChange={(e) => loc.onAddressInput(e.target.value)}
          placeholder="Search an address, or tap the map"
          autoComplete="off"
          className="pr-11"
        />
        <button
          type="button"
          onClick={loc.useMyLocation}
          aria-label="Use my location"
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Crosshair className="h-4 w-4" />
        </button>
      </div>

      {loc.searching && <p className="text-xs text-muted-foreground">Searching…</p>}
      {loc.addrResults.length > 0 && (
        <ul className="space-y-1">
          {loc.addrResults.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => loc.pickResult(r)}
              >
                {r.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}

      <LocationMap lat={loc.lat} lon={loc.lon} onPick={loc.setFromCoords} recenter />
    </div>
  );
}
