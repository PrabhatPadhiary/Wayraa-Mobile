import { API_URL } from '../config';
import { getAuthToken } from './authService';

/**
 * Fetch all trips for the signed-in user (owned or member of).
 * Backend: GET /api/Trips  (requires Firebase auth).
 * Returns an array of trips, or [] on failure.
 */
export async function getMyTrips() {
  try {
    const token = await getAuthToken();
    if (!token) return [];

    const response = await fetch(`${API_URL}/Trips`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.log('getMyTrips error:', error);
    return [];
  }
}
