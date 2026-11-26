import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

// One location lookup at a time: callers that ask while one is running share
// it, so the system permission prompt can never appear twice.
let inFlight = null;

/**
 * Current location permission without prompting.
 * Returns { granted, status: 'granted' | 'denied' | 'undetermined', canAskAgain }.
 */
export async function getLocationPermission() {
  try {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    return { granted: status === 'granted', status, canAskAgain: canAskAgain !== false };
  } catch (error) {
    return { granted: false, status: 'undetermined', canAskAgain: true };
  }
}

/**
 * Get the user's coordinates, asking for permission only if the phone hasn't
 * been asked yet. Once allowed, the OS remembers it, so later launches go
 * straight to the location without a prompt.
 *
 * Uses the last known position when it's recent (fast), else a fresh fix.
 * Returns { granted: true, lat, lng } or
 *         { granted: false, status, canAskAgain, error }.
 */
export function getCurrentLocation() {
  if (!inFlight) {
    inFlight = (async () => {
      try {
        let perm = await getLocationPermission();
        if (!perm.granted && perm.canAskAgain) {
          const res = await Location.requestForegroundPermissionsAsync();
          perm = { granted: res.status === 'granted', status: res.status, canAskAgain: res.canAskAgain !== false };
        }
        if (!perm.granted) {
          return { granted: false, status: perm.status, canAskAgain: perm.canAskAgain, error: 'Location permission denied' };
        }

        // Up to 10 minutes old and within 1 km is plenty for "nearby".
        const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000, requiredAccuracy: 1000 })
          .catch(() => null);
        const position = last || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        return { granted: true, lat: position.coords.latitude, lng: position.coords.longitude };
      } catch (error) {
        return { granted: false, status: 'error', canAskAgain: true, error: 'Failed to get location' };
      } finally {
        // Let the next call (e.g. after returning from Settings) start fresh.
        setTimeout(() => { inFlight = null; }, 0);
      }
    })();
  }
  return inFlight;
}

/**
 * Fetch nearby tourist attractions from the backend.
 * Returns array of { placeId, name, vicinity, rating, photoUrl }
 */
export async function getNearbyPlaces(lat, lng, radius = 30000, { type, limit } = {}) {
  try {
    const extra = `${type ? `&type=${encodeURIComponent(type)}` : ''}${limit ? `&limit=${limit}` : ''}`;
    const url = `${API_URL}/Destinations/nearby?lat=${lat}&lng=${lng}&radius=${radius}${extra}`;
    const response = await fetch(url);

    if (!response.ok) return [];

    const data = await response.json();

    // Build photo URLs through our backend proxy
    return data.map((place) => ({
      ...place,
      photoUrl: place.photoReference
        ? `${API_URL}/Destinations/photo?reference=${place.photoReference}&maxWidth=600`
        : null,
    }));
  } catch (error) {
    console.log('Nearby places error:', error);
    return [];
  }
}

/**
 * Reverse-geocode coordinates into a short, human-readable place label
 * (e.g. "Bali" or "Lisbon"). Returns a string or null.
 */
export async function reverseGeocode(lat, lng) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const place = results?.[0];
    if (!place) return null;
    // Prefer city, then subregion/region, then country.
    return place.city || place.subregion || place.region || place.country || null;
  } catch (error) {
    return null;
  }
}

// ── Place name -> coordinates (on the phone, free) ────────────────────────
// For maps of places we only know by name ("Kyoto, Japan"). Uses the phone's
// own geocoder (no permission or API key), remembered on the phone so each
// name is looked up once. Null when it can't be found.
const GEO_KEY = 'wayraa_geocode_v1';
let geoCache = null; // name (lower case) -> { lat, lng } | null
let geoSaveTimer = null;

async function loadGeoCache() {
  if (geoCache) return geoCache;
  try {
    geoCache = JSON.parse((await AsyncStorage.getItem(GEO_KEY)) || '{}') || {};
  } catch {
    geoCache = {};
  }
  return geoCache;
}

export async function geocodePlaceName(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return null;
  const cache = await loadGeoCache();
  if (key in cache) return cache[key];
  let point = null;
  try {
    const results = await Location.geocodeAsync(name);
    const r = results?.[0];
    if (r && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) point = { lat: r.latitude, lng: r.longitude };
  } catch {
    return null; // a failed lookup (offline, ...) isn't remembered
  }
  cache[key] = point;
  clearTimeout(geoSaveTimer);
  geoSaveTimer = setTimeout(() => AsyncStorage.setItem(GEO_KEY, JSON.stringify(cache)).catch(() => {}), 500);
  return point;
}
