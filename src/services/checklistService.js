import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError, ForbiddenError } from './errors';

/**
 * Trip checklist API. Backend: /api/trips/{tripId}/checklist (Firebase auth).
 * Everyone on the trip can read; owners and editors can change items.
 *
 * Item shape: { id, tripId, title, category, dueDate, assignedToUserId,
 *   assignedToName, isCompleted, completedAt, completedByUserId,
 *   createdByUserId, createdAt, order }
 * `category` is one of: packing | bookings | documents | money | safety | other.
 */

function base(tripId) {
  return `${API_URL}/trips/${encodeURIComponent(tripId)}/checklist`;
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
  if (response.status === 404) return new Error('That trip or item no longer exists.');
  if (response.status === 400) {
    const message = await response.text().catch(() => '');
    return new Error(message || fallback);
  }
  return new Error(`${fallback} (${response.status})`);
}

/** All checklist items for a trip, in display order. */
export async function getChecklist(tripId) {
  const response = await fetch(base(tripId), { headers: await authHeaders() });
  if (!response.ok) throw await toError(response, 'Could not load the checklist.');
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Create an item.
 * @param {{ title: string, category?: string, dueDate?: string|null, order?: number }} item
 */
export async function createChecklistItem(tripId, item) {
  const response = await fetch(base(tripId), {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({
      title: item.title,
      category: item.category || 'other',
      dueDate: item.dueDate || null,
      order: item.order ?? 0,
    }),
  });
  if (!response.ok) throw await toError(response, 'Could not add that item.');
  return response.json();
}

/** Flip an item between done and not done. Returns the updated item. */
export async function toggleChecklistItem(tripId, itemId) {
  const response = await fetch(`${base(tripId)}/${encodeURIComponent(itemId)}/toggle`, {
    method: 'PATCH',
    headers: await authHeaders(),
  });
  if (!response.ok) throw await toError(response, 'Could not update that item.');
  return response.json();
}

/** Delete an item. Resolves to true when it's gone (including if already gone). */
export async function deleteChecklistItem(tripId, itemId) {
  const response = await fetch(`${base(tripId)}/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (response.status === 404) return true;
  if (!response.ok) throw await toError(response, 'Could not delete that item.');
  return true;
}
