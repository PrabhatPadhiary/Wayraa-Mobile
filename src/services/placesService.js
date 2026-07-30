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
