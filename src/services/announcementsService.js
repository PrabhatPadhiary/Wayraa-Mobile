import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError, ForbiddenError } from './errors';

/**
 * A trip's announcements: notes from the owner to everyone on the trip.
 * Everyone can read; only the owner posts, edits and deletes. Posting
 * notifies the others. Backend: /api/trips/{tripId}/announcements.
 *
 * Each: { id, text, createdAt, editedAt, author: { id, name, photoUrl } | null }
 */

export const ANNOUNCEMENT_MAX_LENGTH = 500;

async function request(tripId, path = '', options = {}) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/trips/${encodeURIComponent(tripId)}/announcements${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (response.status === 403) throw new ForbiddenError();
  if (!response.ok) {
    // 400s carry a message for the user ("Keep it under 500 characters.").
    const text = await response.text().catch(() => '');
    const err = new Error(response.status === 400 && text ? text.replace(/^"|"$/g, '') : `Request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

export async function getAnnouncements(tripId) {
  const data = await request(tripId);
  return Array.isArray(data) ? data : [];
}

export function postAnnouncement(tripId, text) {
  return request(tripId, '', { method: 'POST', body: JSON.stringify({ text }) });
}

export function updateAnnouncement(tripId, id, text) {
  return request(tripId, `/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ text }) });
}

export function deleteAnnouncement(tripId, id) {
  return request(tripId, `/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
