import { File } from 'expo-file-system';
import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError } from './errors';

/**
 * Community trip journals. Backend: JournalsController.
 * Reading the feed and a journal works signed out; liking and commenting
 * need an account (AuthRequiredError otherwise).
 */

/** Vibes offered when writing a journal (same list as the website). */
export const JOURNAL_VIBES = ['Adventure', 'Relaxing', 'Foodie', 'Cultural', 'Budget', 'Luxury', 'Solo', 'Group', 'Road Trip', 'Nature'];

/** "road trip" -> "Road Trip" (vibes are stored lower-case). */
export function vibeLabel(vibe) {
  const v = (vibe || '').trim().toLowerCase();
  return JOURNAL_VIBES.find((x) => x.toLowerCase() === v)
    || v.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Feed sends vibes as "a,b,c"; detail sends an array. Normalise to an array. */
function vibesOf(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return (raw || '').split(',').map((v) => v.trim()).filter(Boolean);
}

async function headers(json = false) {
  const token = await getAuthToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function requireToken() {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  return token;
}

/**
 * Public, published journals, newest first, with `isLiked` for the signed-in
 * user. Backend: GET /api/Journals/feed
 */
export async function getJournalFeed() {
  const response = await fetch(`${API_URL}/Journals/feed`, { headers: await headers() });
  if (!response.ok) throw new Error(`Couldn't load the community feed (${response.status})`);
  const data = await response.json();
  return (Array.isArray(data) ? data : []).map((j) => ({ ...j, vibes: vibesOf(j.vibes) }));
}

/**
 * One journal with photos, places and comments.
 * Backend: GET /api/Journals/{id}
 */
export async function getJournal(id) {
  const response = await fetch(`${API_URL}/Journals/${encodeURIComponent(id)}`, { headers: await headers() });
  if (response.status === 404) throw new Error('This journal is no longer available.');
  if (!response.ok) throw new Error(`Couldn't load this journal (${response.status})`);
  const j = await response.json();
  return { ...j, vibes: vibesOf(j.vibes), isLiked: !!j.isLikedByMe };
}

/**
 * Like / unlike. Returns { liked, likesCount }.
 * Backend: POST /api/Journals/{id}/like (toggles)
 */
export async function toggleJournalLike(id) {
  const token = await requireToken();
  const response = await fetch(`${API_URL}/Journals/${encodeURIComponent(id)}/like`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(`Couldn't update the like (${response.status})`);
  return response.json();
}

/** Backend: POST /api/Journals/{id}/comments  { body } */
export async function addJournalComment(id, body) {
  const token = await requireToken();
  const response = await fetch(`${API_URL}/Journals/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body }),
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(`Couldn't post your comment (${response.status})`);
  return response.json();
}

/** Backend: DELETE /api/Journals/{id}/comments/{commentId} (own comments) */
export async function deleteJournalComment(id, commentId) {
  const token = await requireToken();
  const response = await fetch(
    `${API_URL}/Journals/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok && response.status !== 404) throw new Error(`Couldn't delete the comment (${response.status})`);
  return true;
}

async function errorText(response, fallback) {
  try {
    const t = (await response.text()).replace(/^"|"$/g, '').trim();
    if (t && t.length < 200) return t;
  } catch { /* ignore */ }
  return `${fallback} (${response.status})`;
}

/**
 * Create a journal. Backend: POST /api/Journals
 * Title, body and destination are required by the backend.
 *
 * @param {object} journal  { title, body, destination, startDate?, endDate?,
 *   travelersCount?, budget?, currency?, visibility: 'public'|'private',
 *   proTips?, vibes?: string[], status: 'draft'|'published', tripId?, places? }
 * @returns {Promise<{ id, title, status, visibility }>}
 */
export async function createJournal(journal) {
  const token = await requireToken();
  const response = await fetch(`${API_URL}/Journals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(journal),
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(await errorText(response, 'Couldn\'t create your story'));
  return response.json();
}

/** Partial update (e.g. { status: 'published' }). Backend: PUT /api/Journals/{id} */
export async function updateJournal(id, changes) {
  const token = await requireToken();
  const response = await fetch(`${API_URL}/Journals/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(changes),
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(await errorText(response, 'Couldn\'t update your story'));
  return true;
}

/**
 * Upload one photo (a local JPEG uri). Backend: POST /api/Journals/{id}/photos
 * (multipart "files"; max 5MB per image, so resize before calling).
 *
 * Expo's fetch (the global fetch in this SDK) only accepts strings, Blobs or
 * expo-file-system `File`s in FormData — not React Native's { uri, name,
 * type } objects ("Unsupported FormDataPart implementation"). A `File` is
 * Blob-like: its name and MIME type (image/jpeg from the .jpg extension) go
 * into the part headers the backend checks.
 */
export async function uploadJournalPhoto(id, uri, index = 0) {
  const token = await requireToken();
  const form = new FormData();
  form.append('files', new File(uri), `photo-${index + 1}.jpg`);
  const response = await fetch(`${API_URL}/Journals/${encodeURIComponent(id)}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }, // fetch sets the multipart boundary
    body: form,
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(await errorText(response, 'A photo failed to upload'));
  return response.json();
}

/** Delete one of your journals. Backend: DELETE /api/Journals/{id} */
export async function deleteJournal(id) {
  const token = await requireToken();
  const response = await fetch(`${API_URL}/Journals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok && response.status !== 404) throw new Error(await errorText(response, 'Couldn\'t delete the story'));
  return true;
}
