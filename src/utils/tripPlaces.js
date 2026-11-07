/**
 * Helpers for saving places to a trip. The backend stores a place's category as
 * 'stay' | 'food' | 'activity'.
 */

export const TRIP_CATEGORIES = [
  { key: 'stay', label: 'Stay', icon: 'bed-outline' },
  { key: 'food', label: 'Food', icon: 'restaurant-outline' },
  { key: 'activity', label: 'Activity', icon: 'walk-outline' },
];

/**
 * Map the many category spellings used around the app (stays, restaurants,
 * attractions, ...) onto the backend's three. Returns null when it can't tell,
 * so the user is asked to choose instead of us guessing.
 */
export function toTripCategory(category) {
  const c = (category || '').toLowerCase();
  if (c === 'stay' || c === 'stays' || c === 'hotel' || c === 'hotels') return 'stay';
  if (c === 'food' || c === 'restaurant' || c === 'restaurants') return 'food';
  if (
    c === 'activity' || c === 'activities' ||
    c === 'attraction' || c === 'attractions'
  ) {
    return 'activity';
  }
  return null;
}

/**
 * The photo URL the backend returned for a place, as-is (the same value the
 * website stores), or null. Used only as a stored fallback: the app itself
 * shows trip photos from the place id.
 */
export function rawPhotoUrl(place) {
  return place?.photos?.[0]?.url || null;
}

/**
 * Build the request body for POST .../places from a place object as returned by
 * the places endpoints (search results, details, category lists).
 *
 * @param {object} place  { placeId, name | placeName, vicinity, rating,
 *   userRatingsTotal, photos[], geometry: { latitude, longitude } }
 * @param {string} category  'stay' | 'food' | 'activity'
 */
export function buildTripPlaceDto(place, category) {
  return {
    placeId: place.placeId,
    placeName: place.placeName ?? place.name ?? '',
    vicinity: place.vicinity ?? place.formattedAddress ?? null,
    rating: place.rating ?? null,
    userRatingsTotal: place.userRatingsTotal ?? null,
    photoUrl: place.rawPhotoUrl ?? rawPhotoUrl(place),
    category,
    notes: null,
    latitude: place.geometry?.latitude ?? place.latitude ?? null,
    longitude: place.geometry?.longitude ?? place.longitude ?? null,
  };
}
