import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError, ForbiddenError } from './errors';

/**
 * Trip itinerary API: /api/trips/{tripId}/itinerary (Firebase auth).
 * Everyone on the trip can read; owners and editors can change items.
 *
 * Item shape: { id, tripId, destinationId, tripPlaceId, title, category,
 *   scheduledDate, startTime, endTime, notes, createdAt }
 * `category`: stay | food | activity | transport | custom.
 * `startTime` / `endTime`: "HH:mm" strings, or null/"" for "anytime".
 */

function base(tripId) {
  return `${API_URL}/trips/${encodeURIComponent(tripId)}/itinerary`;
}

async function authHeaders(json = false) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  return json
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { Authorization: `Bearer ${token}` };
}

async function toError(response, fallback) {
  if (response.status === 401) return new AuthRequiredError();
  if (response.status === 403) return new ForbiddenError('You can view this trip but not edit it.');
  if (response.status === 404) return new Error('That trip or plan item no longer exists.');
  if (response.status === 400) {
    const message = await response.text().catch(() => '');
    return new Error(message || fallback);
  }
  return new Error(`${fallback} (${response.status})`);
}

/** All itinerary items for a trip, ordered by day then start time. */
export async function getItinerary(tripId) {
  const response = await fetch(base(tripId), { headers: await authHeaders() });
  if (!response.ok) throw await toError(response, 'Could not load the itinerary.');
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * @param {{ destinationId, tripPlaceId?, title, category, scheduledDate,
 *   startTime?, endTime?, notes? }} item
 */
export async function createItineraryItem(tripId, item) {
  const response = await fetch(base(tripId), {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({
      destinationId: item.destinationId,
      tripPlaceId: item.tripPlaceId || null,
      title: item.title,
      category: item.category || 'custom',
      scheduledDate: item.scheduledDate,
      startTime: item.startTime || null,
      endTime: item.endTime || null,
      notes: item.notes || null,
    }),
  });
  if (!response.ok) throw await toError(response, 'Could not add that to the plan.');
  return response.json();
}

/**
 * Update an item. The backend only changes fields that are sent; to clear a
 * time or the notes send an empty string.
 */
export async function updateItineraryItem(tripId, itemId, changes) {
  const response = await fetch(`${base(tripId)}/${encodeURIComponent(itemId)}`, {
    method: 'PUT',
    headers: await authHeaders(true),
    body: JSON.stringify(changes),
  });
  if (!response.ok) throw await toError(response, 'Could not save that change.');
  return response.json();
}

/** Resolves to true when it's gone (including if it was already gone). */
export async function deleteItineraryItem(tripId, itemId) {
  const response = await fetch(`${base(tripId)}/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (response.status === 404) return true;
  if (!response.ok) throw await toError(response, 'Could not remove that from the plan.');
  return true;
}

/** Delete every item scheduled outside [startDate, endDate]. Returns { deleted }. */
export async function deleteItineraryOutsideRange(tripId, startDate, endDate) {
  const response = await fetch(`${base(tripId)}/outside-range`, {
    method: 'DELETE',
    headers: await authHeaders(true),
    body: JSON.stringify({ startDate, endDate }),
  });
  if (!response.ok) throw await toError(response, 'Could not clear those items.');
  return response.json();
}
