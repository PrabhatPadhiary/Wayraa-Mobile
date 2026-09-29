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
