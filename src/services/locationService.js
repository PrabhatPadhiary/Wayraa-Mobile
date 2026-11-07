import * as Location from 'expo-location';
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
export async function getNearbyPlaces(lat, lng, radius = 30000) {
  try {
    const url = `${API_URL}/Destinations/nearby?lat=${lat}&lng=${lng}&radius=${radius}`;
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
