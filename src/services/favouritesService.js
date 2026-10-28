import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError } from './errors';

/**
 * Fetch the signed-in user's favourite places.
 * Backend: GET /api/Favourites (requires Firebase auth).
 *
 * Throws AuthRequiredError when the user isn't signed in, and a generic Error
 * on network/HTTP failure — so the screen can tell apart "sign in", "error",
 * and a genuinely empty list.
 */
export async function getFavourites() {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/Favourites`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Treat auth rejections from the backend as "sign in required" too.
  if (response.status === 401 || response.status === 403) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw new Error(`Failed to load favourites (${response.status})`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Add a place to the signed-in user's favourites.
 * Backend: POST /api/Favourites with { placeId, placeName, vicinity, rating,
 * userRatingsTotal, photoUrl, category }.
 *
 * Returns { success: true } on add, { success: true, already: true } if it was
 * already a favourite (HTTP 409), or { success: false, error } otherwise.
 * Throws AuthRequiredError when the user isn't signed in.
 */
export async function addFavourite(place) {
  if (!place?.placeId) return { success: false, error: 'Missing place id' };

  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  try {
    const response = await fetch(`${API_URL}/Favourites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        placeId: place.placeId,
        placeName: place.placeName ?? place.name ?? '',
        vicinity: place.vicinity ?? '',
        rating: place.rating ?? 0,
        userRatingsTotal: place.userRatingsTotal ?? 0,
        photoUrl: place.photoUrl ?? null,
        category: place.category ?? null,
      }),
    });

    if (response.status === 401 || response.status === 403) {
      throw new AuthRequiredError();
    }
    if (response.status === 409) {
      // Already favourited — treat as success (idempotent for the UI).
      return { success: true, already: true };
    }
    if (!response.ok) {
      return { success: false, error: `Failed (${response.status})` };
    }
    return { success: true };
  } catch (error) {
    if (error instanceof AuthRequiredError) throw error;
    console.log('addFavourite error:', error);
    return { success: false, error: 'Network error' };
  }
}

/**
 * Remove a favourite by its Google place id.
 * Backend: DELETE /api/Favourites/{placeId}.
 * Returns true on success.
 */
export async function removeFavourite(placeId) {
  if (!placeId) return false;
  try {
    const token = await getAuthToken();
    if (!token) return false;

    const response = await fetch(`${API_URL}/Favourites/${encodeURIComponent(placeId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    return response.ok;
  } catch (error) {
    console.log('removeFavourite error:', error);
    return false;
  }
}
