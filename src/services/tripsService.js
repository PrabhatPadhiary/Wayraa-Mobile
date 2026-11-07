import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError, ForbiddenError } from './errors';

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

/**
 * Add a place to one destination of a trip.
 * Backend: POST /api/trips/{tripId}/destinations/{destinationId}/places
 * (owners and editors only).
 *
 * @param {string} tripId
 * @param {string} destinationId
 * @param {object} dto  see buildTripPlaceDto in utils/tripPlaces
 * @returns {Promise<{ alreadyAdded: boolean, id?: string }>} `id` is the trip
 *   place id (needed to remove it again). `alreadyAdded` is true on HTTP 409.
 * @throws AuthRequiredError when signed out, ForbiddenError for viewers, and an
 *   Error for a missing trip/destination or any other failure.
 */
export async function addPlaceToTrip(tripId, destinationId, dto) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(
    `${API_URL}/trips/${encodeURIComponent(tripId)}/destinations/${encodeURIComponent(destinationId)}/places`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(dto),
    }
  );

  if (response.status === 401) throw new AuthRequiredError();
  if (response.status === 403) throw new ForbiddenError('You can view this trip but not edit it.');
  if (response.status === 409) return { alreadyAdded: true };
  if (response.status === 404) throw new Error('That trip or destination no longer exists.');
  if (response.status === 400) {
    const message = await response.text().catch(() => '');
    throw new Error(message || 'That place could not be added.');
  }
  if (!response.ok) throw new Error(`Failed to add place (${response.status})`);

  const data = await response.json().catch(() => ({}));
  return { alreadyAdded: false, id: data?.id };
}

/**
 * Remove a saved place from a trip.
 * Backend: DELETE /api/trip-places/{id} (owners and editors only).
 * Resolves to true when the place is gone (including if it was already gone).
 * @throws AuthRequiredError when signed out, ForbiddenError for viewers.
 */
export async function removeTripPlace(tripPlaceId) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/trip-places/${encodeURIComponent(tripPlaceId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) throw new AuthRequiredError();
  if (response.status === 403) throw new ForbiddenError('You can view this trip but not edit it.');
  if (response.status === 404) return true;
  if (!response.ok) throw new Error(`Failed to remove place (${response.status})`);
  return true;
}

/** Shared error mapping for the destination endpoints (owners and editors only). */
async function destinationError(response, fallback) {
  if (response.status === 401) return new AuthRequiredError();
  if (response.status === 403) return new ForbiddenError('You can view this trip but not edit it.');
  if (response.status === 409) return new Error('That destination is already in this trip.');
  if (response.status === 404) return new Error('That trip or destination no longer exists.');
  if (response.status === 400) {
    const message = await response.text().catch(() => '');
    return new Error(message || fallback);
  }
  return new Error(`${fallback} (${response.status})`);
}

/**
 * Add a destination (stop) to a trip.
 * Backend: POST /api/Trips/{id}/destinations (owners and editors only).
 *
 * @param {string} tripId
 * @param {{ googlePlaceId: string, name: string, latitude?: number, longitude?: number,
 *   photoUrl?: string, order: number, startDate?: string|null, endDate?: string|null }} destination
 * @returns {Promise<{ id: string, googlePlaceId: string, name: string }>}
 * @throws AuthRequiredError, ForbiddenError, or an Error (409 = already in the trip).
 */
export async function addTripDestination(tripId, destination) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/Trips/${encodeURIComponent(tripId)}/destinations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      googlePlaceId: destination.googlePlaceId,
      name: destination.name,
      latitude: destination.latitude ?? null,
      longitude: destination.longitude ?? null,
      photoUrl: destination.photoUrl || null,
      order: destination.order ?? 0,
      startDate: destination.startDate || null,
      endDate: destination.endDate || null,
    }),
  });

  if (!response.ok) throw await destinationError(response, 'Could not add that destination.');
  return response.json();
}

/**
 * Remove a destination from a trip. Its saved places are deleted with it.
 * Backend: DELETE /api/Trips/{id}/destinations/{destinationId}.
 * Resolves to true when it's gone (including if it was already gone).
 */
export async function removeTripDestination(tripId, destinationId) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(
    `${API_URL}/Trips/${encodeURIComponent(tripId)}/destinations/${encodeURIComponent(destinationId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );

  if (response.status === 404) return true;
  if (!response.ok) throw await destinationError(response, 'Could not remove that destination.');
  return true;
}

/**
 * Set dates on one or more destinations. The backend then recalculates the
 * trip's own start/end from all destinations that have dates.
 * Backend: PUT /api/Trips/{id}/destinations/dates.
 *
 * @param {string} tripId
 * @param {Array<{ destinationId: string, startDate: string|null, endDate: string|null }>} updates
 */
export async function updateDestinationDates(tripId, updates) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/Trips/${encodeURIComponent(tripId)}/destinations/dates`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) throw await destinationError(response, 'Could not update the dates.');
  return response.json();
}

/**
 * Update a trip's details. Only the fields sent are changed.
 * Backend: PUT /api/Trips/{id} (owner only).
 *
 * @param {string} tripId
 * @param {{ name?, description?, startDate?, endDate?, travelersCount? }} changes
 */
export async function updateTrip(tripId, changes) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/Trips/${encodeURIComponent(tripId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(changes),
  });

  if (response.status === 401) throw new AuthRequiredError();
  if (response.status === 403) throw new ForbiddenError('Only the trip owner can edit this trip.');
  if (response.status === 404) throw new Error('That trip no longer exists.');
  if (response.status === 400) {
    const message = await response.text().catch(() => '');
    throw new Error(message || 'Please check the trip details and try again.');
  }
  if (!response.ok) throw new Error(`Failed to save the trip (${response.status})`);
  return response.json();
}

/**
 * Permanently delete a trip and everything in it (stops, places, members,
 * expenses, checklist, itinerary). Journals linked to it are kept, unlinked.
 * Backend: DELETE /api/Trips/{id} (owner only).
 * Resolves to true when it's gone (including if it was already gone).
 */
export async function deleteTrip(tripId) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const response = await fetch(`${API_URL}/Trips/${encodeURIComponent(tripId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) throw new AuthRequiredError();
  if (response.status === 403) throw new ForbiddenError('Only the trip owner can delete this trip.');
  if (response.status === 404) return true;
  if (!response.ok) throw new Error(`Failed to delete the trip (${response.status})`);
  return true;
}
