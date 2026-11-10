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

/**
 * Place search with types. Each result: { placeId, name, description,
 * secondary, types } — `types` are Google's place types.
 * Backend: GET /Destinations/search?query=[&scope=all][&lat=&lng=&radius=]
 *
 * @param {string} query
 * @param {object} [options]
 * @param {boolean} [options.regionsOnly]  cities / regions only (no businesses)
 * @param {{ lat: number, lng: number, radius?: number }} [options.near]
 *   keep results inside this circle (radius in metres), e.g. the destination
 */
export async function searchAnyPlace(query, { regionsOnly = false, near = null } = {}) {
  if (!query || query.trim().length < 2) return [];
  try {
    const params = new URLSearchParams({ query: query.trim() });
    if (!regionsOnly) params.set('scope', 'all');
    if (near && Number.isFinite(near.lat) && Number.isFinite(near.lng)) {
      params.set('lat', String(near.lat));
      params.set('lng', String(near.lng));
      if (near.radius) params.set('radius', String(Math.round(near.radius)));
    }
    const url = `${API_URL}/Destinations/search?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const REGION_TYPES = new Set([
  'locality', 'sublocality', 'postal_town', 'colloquial_area', 'country',
  'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3',
]);

/** True for a city / area / country, false for a specific place (a business, a landmark). */
export function isRegionResult(result) {
  const types = result?.types;
  // No types: an older backend, whose search only returns regions.
  if (!Array.isArray(types) || types.length === 0) return true;
  return !types.includes('establishment') && types.some((t) => REGION_TYPES.has(t));
}

/**
 * Coordinates from a place-details response as { lat, lng }, or null.
 * Our backend sends geometry as { latitude, longitude }; Google's raw shape
 * is { location: { lat, lng } }. Both are accepted.
 */
export function placeCoords(details) {
  const g = details?.geometry;
  const lat = g?.latitude ?? g?.location?.lat;
  const lng = g?.longitude ?? g?.location?.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * How far around a destination to search for its places, by what it is:
 * a city ~50 km, a district or county 100 km, a state 400 km; a country
 * (or unknown) has no limit (null).
 */
export function searchRadiusFor(types = []) {
  if (types.includes('country')) return null;
  if (types.includes('administrative_area_level_1')) return 400000;
  if (types.includes('administrative_area_level_2') || types.includes('administrative_area_level_3')) return 100000;
  return 50000;
}

/** Journal place category from Google types: food, stay, attraction or other. */
export function journalCategoryFor(types = []) {
  const has = (...names) => names.some((n) => types.includes(n));
  if (has('restaurant', 'cafe', 'bar', 'bakery', 'food', 'meal_takeaway', 'meal_delivery', 'night_club')) return 'food';
  if (has('lodging', 'campground', 'rv_park')) return 'stay';
  if (has('tourist_attraction', 'museum', 'park', 'natural_feature', 'amusement_park', 'zoo', 'aquarium',
    'art_gallery', 'church', 'hindu_temple', 'mosque', 'synagogue', 'place_of_worship', 'stadium', 'point_of_interest')) return 'attraction';
  return 'other';
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

/**
 * One page of places inside a destination, for "See all" and "Search in X".
 * Backend: GET /Destinations/places/search?placeId=&(query|filter|category)=&page=
 * Pages are 0, 1, 2 (Google gives up to 60 results in all).
 *
 * @param {object} options
 * @param {string} options.placeId     the destination's Google place id
 * @param {string} [options.query]     free text, e.g. "biryani"
 * @param {string} [options.filter]    e.g. "Cafes"
 * @param {string} [options.category]  restaurants | stays | attractions | activities
 * @param {number} [options.page]
 * @returns {Promise<{ places: Array, hasMore: boolean }>}  places carry `photoUrl`
 */
export async function searchInDestination({ placeId, query, filter, category, page = 0 }) {
  const params = new URLSearchParams({ placeId, page: String(page) });
  if (query) params.set('query', query);
  else if (filter) params.set('filter', filter);
  else if (category) params.set('category', category);
  const response = await fetch(`${API_URL}/Destinations/places/search?${params.toString()}`);
  if (!response.ok) throw new Error(`Couldn't load places (${response.status})`);
  const data = await response.json();
  return {
    places: (data?.places || []).map((place) => ({ ...place, photoUrl: photoUrlFromPlace(place, 400) })),
    hasMore: !!data?.hasMore,
  };
}

/**
 * Fetch places for a destination using a free-text filter.
 * Backend: GET /Destinations/filter?placeId=&filter=
 * The filter string is appended to "top {filter} in {placeName}" by the backend.
 * Returns an array of places, each with a normalized `photoUrl`.
 */
export async function getPlacesByFilter(placeId, filter) {
  if (!placeId || !filter) return [];
  try {
    const url = `${API_URL}/Destinations/filter?placeId=${encodeURIComponent(placeId)}&filter=${encodeURIComponent(filter)}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.map((place) => ({ ...place, photoUrl: photoUrlFromPlace(place, 400) }));
  } catch (error) {
    console.log('getPlacesByFilter error:', error);
    return [];
  }
}

/**
 * Fetch themed destinations for a home-screen category.
 * Backend: GET /Destinations/by-category?theme=&lat=&lng=
 * `theme` is one of: "beaches" | "mountains" | "cities" | "historical" |
 * "islands" | "wildlife".
 *
 * When `coords` ({ lat, lng }) is provided the results are biased toward the
 * user's region ("Nearby"); otherwise they are global. Returns an array of
 * places, each with a normalized `photoUrl`.
 */
export async function getPlacesByTheme(theme, coords = null) {
  if (!theme) return [];
  try {
    let url = `${API_URL}/Destinations/by-category?theme=${encodeURIComponent(theme)}`;
    if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
      url += `&lat=${coords.lat}&lng=${coords.lng}`;
    }
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.map((place) => ({ ...place, photoUrl: photoUrlFromPlace(place, 400) }));
  } catch (error) {
    console.log('getPlacesByTheme error:', error);
    return [];
  }
}
