import { API_URL } from '../config';

/**
 * Direct image URL for a place's main photo, built from its (stable) Google
 * place id. The backend looks up and caches the photo itself, so no details
 * request is needed first. Returns null without a place id.
 * Backend: GET /api/Destinations/place-photo?placeId=&maxWidth=
 */
export function placePhotoUrl(placeId, maxWidth = 800) {
  if (!placeId) return null;
  return `${API_URL}/Destinations/place-photo?placeId=${encodeURIComponent(placeId)}&maxWidth=${maxWidth}`;
}

/** Our backend photo-proxy URL for a Google photo_reference. */
export function proxyPhotoUrl(reference, maxWidth = 400) {
  return `${API_URL}/Destinations/photo?reference=${encodeURIComponent(reference)}&maxWidth=${maxWidth}`;
}

/**
 * Normalise a stored photo URL for display. Stored proxy URLs can point at an
 * old host or a small size, so the photo reference is pulled out and the URL
 * is rebuilt against the current API_URL at the requested width. Other
 * absolute URLs are used as-is. Returns null when there is nothing usable.
 */
export function normalizePhotoUrl(raw, maxWidth = 400) {
  if (!raw || typeof raw !== 'string') return null;
  const refMatch = raw.match(/[?&]reference=([^&]+)/);
  if (refMatch) return proxyPhotoUrl(decodeURIComponent(refMatch[1]), maxWidth);
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return proxyPhotoUrl(raw, maxWidth);
}
