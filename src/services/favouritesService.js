import { API_URL } from '../config';
import { getAuthToken } from './authService';

/**
 * Fetch the signed-in user's favourite places.
 * Backend: GET /api/Favourites (requires Firebase auth).
 * Returns an array, or [] on failure.
 */
export async function getFavourites() {
  try {
    const token = await getAuthToken();
    if (!token) return [];

    const response = await fetch(`${API_URL}/Favourites`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.log('getFavourites error:', error);
    return [];
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
