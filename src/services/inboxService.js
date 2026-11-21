import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError } from './errors';

/**
 * The bell on Home: your in-app notifications (the same ones that are
 * pushed: friends joining, places, expenses, itinerary, announcements).
 * Backend: /api/notifications.
 */

async function request(path, options = {}) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(`Notifications request failed (${response.status})`);
  return response.status === 204 ? null : response.json();
}

/**
 * Newest first. For the next page pass the last item's `createdAt` (as the
 * server sent it, unparsed) as `before`.
 * Each: { id, type, title, body, tripId, createdAt, isRead, actor: { id, name, photoUrl } | null }
 */
export async function getNotifications({ before, limit = 30 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  const data = await request(`/notifications?${params}`);
  return Array.isArray(data) ? data : [];
}

/** How many are unread (0 when signed out or offline: it's just the dot). */
export async function getUnreadNotificationCount() {
  try {
    const data = await request('/notifications/unread-count');
    return data?.count || 0;
  } catch {
    return 0;
  }
}

/** Mark everything up to `upTo` (the newest seen item's createdAt) as read. */
export async function markNotificationsRead(upTo) {
  await request('/notifications/read', {
    method: 'POST',
    body: JSON.stringify(upTo ? { upTo } : {}),
  });
}
