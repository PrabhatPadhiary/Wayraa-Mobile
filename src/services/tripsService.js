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

/**
 * Create a trip with its first destination.
 * Backend: POST /api/Trips  (requires Firebase auth).
 *
 * @param {object} trip
 * @param {string} trip.name
 * @param {string} [trip.description]
 * @param {string|null} [trip.startDate] ISO date string
 * @param {string|null} [trip.endDate]   ISO date string
 * @param {number} [trip.travelersCount]
 * @param {string} [trip.primaryDestination]
 * @param {string|null} [trip.coverPhotoUrl]
 * @param {{ googlePlaceId: string, name: string, latitude?: number, longitude?: number, photoUrl?: string }} trip.destination
 *
 * Returns the created trip ({ id, name, startDate, endDate, status, destination }).
 * Throws AuthRequiredError when not signed in, and an Error carrying the
 * backend's message for validation failures (HTTP 400).
 */
export async function createTrip(trip) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/Trips`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: trip.name,
      description: trip.description || null,
      startDate: trip.startDate || null,
      endDate: trip.endDate || null,
      coverPhotoUrl: trip.coverPhotoUrl || null,
      travelersCount: trip.travelersCount ?? 1,
      primaryDestination: trip.primaryDestination || null,
      destination: {
        googlePlaceId: trip.destination?.googlePlaceId,
        name: trip.destination?.name,
        latitude: trip.destination?.latitude ?? null,
        longitude: trip.destination?.longitude ?? null,
        photoUrl: trip.destination?.photoUrl || null,
        order: 0,
      },
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthRequiredError();
  }
  if (response.status === 400) {
    const message = await response.text().catch(() => '');
    throw new Error(message || 'Please check the trip details and try again.');
  }
  if (!response.ok) {
    throw new Error(`Failed to create trip (${response.status})`);
  }

  return response.json();
}

/**
 * Fetch one trip with its destinations, saved places and members.
 * Backend: GET /api/Trips/{id}  (requires Firebase auth; owner or member).
 *
 * Throws AuthRequiredError when not signed in. Throws an Error with
 * `status === 404` when the trip doesn't exist or isn't visible to the user.
 */
export async function getTripById(tripId) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/Trips/${encodeURIComponent(tripId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401 || response.status === 403) {
    throw new AuthRequiredError();
  }
  if (!response.ok) {
    const error = new Error(
      response.status === 404 ? 'Trip not found.' : `Failed to load trip (${response.status})`
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}
