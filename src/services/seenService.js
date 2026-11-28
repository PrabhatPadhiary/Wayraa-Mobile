import { API_URL } from '../config';
import { getAuthToken } from './authService';

/**
 * One-time things already shown to you, kept with your account so a
 * reinstall or a new phone doesn't repeat them: the app's tips you've seen
 * and the highest traveller rank you've been congratulated on.
 *
 * Backend: GET / POST /api/users/me/seen. Tips are only ever added and the
 * rank only goes up there, so two phones can't undo each other.
 */

const TIMEOUT_MS = 4000;

async function call(method, body) {
  const token = await getAuthToken();
  if (!token) return null; // signed out: only this phone remembers
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/users/me/seen`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** { tips: string[], celebratedRank: number|null }, or null (signed out / failed). */
export async function getSeen() {
  try {
    return await call('GET');
  } catch {
    return null;
  }
}

/** Record tips just shown and/or a rank just celebrated. Never throws. */
export async function markSeenOnAccount({ tips, celebratedRank } = {}) {
  try {
    return await call('POST', {
      tips: tips?.length ? tips : undefined,
      celebratedRank: Number.isFinite(celebratedRank) ? celebratedRank : undefined,
    });
  } catch {
    return null;
  }
}
