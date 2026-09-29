import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError } from './errors';

/**
 * Fetch all trips for the signed-in user (owned or member of).
 * Backend: GET /api/Trips  (requires Firebase auth).
 *
 * Throws AuthRequiredError when the user isn't signed in, and a generic Error
 * on network/HTTP failure — so the screen can tell apart "sign in", "error",
 * and a genuinely empty list.
 */
export async function getMyTrips() {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/Trips`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Treat auth rejections from the backend as "sign in required" too.
  if (response.status === 401 || response.status === 403) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    throw new Error(`Failed to load trips (${response.status})`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
