import * as Location from 'expo-location';
import { API_URL } from '../config';

/**
 * Request location permission and get current coordinates.
 * Returns { granted, lat, lng } or { granted: false, error }
 */
export async function getCurrentLocation() {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { granted: false, error: 'Location permission denied' };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      granted: true,
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    };
  } catch (error) {
    return { granted: false, error: 'Failed to get location' };
  }
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
        ? `${API_URL}/Destinations/photo?reference=${place.photoReference}&maxWidth=400`
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
