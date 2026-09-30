import { API_URL } from '../config';

/**
 * Search for place predictions via the backend proxy (Google Places Autocomplete).
 * Returns array of { placeId, name, description, secondary }
 */
export async function searchPlaces(query) {
  if (!query || query.trim().length < 2) return [];

  try {
    const url = `${API_URL}/Destinations/search?query=${encodeURIComponent(query)}`;
    const response = await fetch(url);

    if (!response.ok) return [];

    const data = await response.json();
    return data;
  } catch (error) {
    console.log('Places search error:', error);
    return [];
  }
}

/** Build our backend photo-proxy URL for a Google photo_reference. */
function proxyPhotoUrl(reference, maxWidth = 400) {
  return `${API_URL}/Destinations/photo?reference=${encodeURIComponent(reference)}&maxWidth=${maxWidth}`;
}

/**
 * Normalize a place's first photo into a proxy URL we can load directly.
 * Backend returns photos[].url as a full Google URL (with an expiring
 * reference + exposed key); we pull the reference and route it through the
 * proxy so it loads reliably.
 */
function photoUrlFromPlace(place, maxWidth = 400) {
  const googleUrl = place?.photos?.[0]?.url;
  if (!googleUrl || typeof googleUrl !== 'string') return null;
  const refMatch = googleUrl.match(/photo_reference=([^&]+)/);
  if (!refMatch) return null;
  return proxyPhotoUrl(decodeURIComponent(refMatch[1]), maxWidth);
}

/**
 * Fetch details for a place.
 * Backend: GET /Destinations/details?placeId=
 * Returns the raw details object plus a normalized `photoUrl`, or null.
 */
export async function getPlaceDetails(placeId) {
  if (!placeId) return null;
  try {
    const url = `${API_URL}/Destinations/details?placeId=${encodeURIComponent(placeId)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return { ...data, photoUrl: photoUrlFromPlace(data, 800) };
  } catch (error) {
    console.log('getPlaceDetails error:', error);
    return null;
  }
}

/**
 * Fetch places for a destination by category.
 * Backend: GET /Destinations/places?placeId=&category=
 * `category` is one of: "restaurants" | "stays" | "attractions" | "activities".
 * Returns an array of places, each with a normalized `photoUrl`.
 */
export async function getPlacesByCategory(placeId, category) {
  if (!placeId || !category) return [];
  try {
    const url = `${API_URL}/Destinations/places?placeId=${encodeURIComponent(placeId)}&category=${encodeURIComponent(category)}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.map((place) => ({ ...place, photoUrl: photoUrlFromPlace(place, 400) }));
  } catch (error) {
    console.log('getPlacesByCategory error:', error);
    return [];
  }
}
