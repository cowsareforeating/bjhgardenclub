import { useEffect, useRef, useState } from 'react';
import { reverseGeocode, searchAddress } from './geocode';

// ============================================================================
// useLocationPicker
// ----------------------------------------------------------------------------
// All the state + behavior behind the rich "where is this?" picker used by the
// create flow: lat/lon/address, debounced address search, the GPS button, and
// reverse-geocoding a freshly-picked point back into an address. Pairs with the
// <LocationPicker> component. Extracted from AddTreeBed, which reimplemented all
// of this inline.
// ============================================================================

const GPS_TIMEOUT_MS = 8000;
const SEARCH_DEBOUNCE_MS = 500;

interface InitialLocation {
  lat?: number | null;
  lon?: number | null;
  address?: string;
}

type AddressResult = Awaited<ReturnType<typeof searchAddress>>[number];

export function useLocationPicker(initial?: InitialLocation) {
  const [lat, setLat] = useState<number | null>(initial?.lat ?? null);
  const [lon, setLon] = useState<number | null>(initial?.lon ?? null);
  const [address, setAddress] = useState(initial?.address ?? '');
  // True only while the user is actively typing in the address box — gates the
  // search so programmatic fills (tap / GPS / pick) don't re-trigger it.
  const [typing, setTyping] = useState(false);
  const [addrResults, setAddrResults] = useState<AddressResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If we were seeded with coords but no address (e.g. the map FAB preset),
  // reverse-geocode once on mount to suggest one.
  const didSeedGeocode = useRef(false);
  useEffect(() => {
    if (didSeedGeocode.current) return;
    if (initial?.lat != null && initial?.lon != null && !initial?.address) {
      didSeedGeocode.current = true;
      reverseGeocode(initial.lat, initial.lon)
        .then((a) => {
          if (a) setAddress(a);
        })
        .catch(() => undefined);
    }
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set coords from a tapped point or GPS, then reverse-geocode the address.
  const setFromCoords = async (la: number, lo: number) => {
    setLat(la);
    setLon(lo);
    setTyping(false);
    setAddrResults([]);
    const a = await reverseGeocode(la, lo).catch(() => null);
    if (a) setAddress(a);
  };

  const useMyLocation = () => {
    setError(null);
    if (!('geolocation' in navigator)) {
      setError('Your browser doesn’t support location.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void setFromCoords(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Search an address or tap the map instead.'
            : 'Couldn’t get your location. Search an address or tap the map instead.'
        );
      },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS }
    );
  };

  // Debounced address search — only while actively typing.
  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!typing || !address.trim()) {
      setAddrResults([]);
      return;
    }
    const t = setTimeout(async () => {
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setSearching(true);
      try {
        setAddrResults(await searchAddress(address, ctrl.signal));
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [address, typing]);

  // Typing into the address box (re-arms the search).
  const onAddressInput = (value: string) => {
    setAddress(value);
    setTyping(true);
  };

  // Choosing one of the address-search results.
  const pickResult = (r: AddressResult) => {
    setLat(r.lat);
    setLon(r.lon);
    setAddress(r.displayName);
    setTyping(false);
    setAddrResults([]);
  };

  return {
    lat,
    lon,
    address,
    addrResults,
    searching,
    error,
    setAddress,
    setError,
    setFromCoords,
    useMyLocation,
    onAddressInput,
    pickResult
  };
}

export type LocationPickerState = ReturnType<typeof useLocationPicker>;
