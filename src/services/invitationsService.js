import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError, ForbiddenError } from './errors';

/**
 * Trip sharing: invite links and member management.
 *
 * Each trip has two shared invite links, one per role: "member" (can edit,
 * shown as Editor) and "viewer" (read only). Anyone with a link can join until
 * the owner resets it. (Older single-use links, valid 48
 * hours, still work until they expire.)
 * Backend: InvitationsController and TripMembersController.
 */

/** Public web address that invite links point to (same format as the website). */
export const INVITE_WEB_BASE = 'https://wayraa.com/join/';

/** Shareable link for an invitation id. */
export function inviteLinkFor(inviteId) {
  return `${INVITE_WEB_BASE}${inviteId}`;
}

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Pull the invitation id out of anything a user might paste: a website link
 * (https://wayraa.com/join/<id>), an app link (wayraa://join/<id>), or the
 * bare id. Returns null when there's no id in it.
 */
export function parseInviteId(text) {
  const match = GUID.exec(text || '');
  return match ? match[0].toLowerCase() : null;
}

async function authedFetch(path, options = {}) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) throw new AuthRequiredError();
  return response;
}

/** The backend returns plain-text messages for 400/404/409; surface them. */
async function errorFrom(response, fallback) {
  let message = '';
  try {
    message = (await response.text()).replace(/^"|"$/g, '').trim();
  } catch {
    // ignore
  }
  return new Error(message && message.length < 200 ? message : `${fallback} (${response.status})`);
}

/** { member: { id, link } | null, viewer: { id, link } | null } */
function withLinks(data) {
  const link = (l) => (l?.id ? { id: l.id, link: inviteLinkFor(l.id) } : null);
  return { member: link(data?.member), viewer: link(data?.viewer) };
}

/**
 * The trip's shared invite links (made when missing). Owners and editors.
 * Backend: GET /api/trips/{tripId}/share-links
 */
export async function getShareLinks(tripId) {
  const response = await authedFetch(`/trips/${encodeURIComponent(tripId)}/share-links`);
  if (response.status === 403) throw new ForbiddenError('Only the owner and editors can invite people.');
  if (!response.ok) throw await errorFrom(response, 'Could not load the invite links');
  return withLinks(await response.json());
}

/**
 * Replace one role's link with a new one; the old link stops working. Owner only.
 * Backend: POST /api/trips/{tripId}/share-links/reset
 */
export async function resetShareLink(tripId, role) {
  const response = await authedFetch(`/trips/${encodeURIComponent(tripId)}/share-links/reset`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
  if (response.status === 403) throw new ForbiddenError('Only the trip owner can reset invite links.');
  if (!response.ok) throw await errorFrom(response, 'Could not reset the link');
  return withLinks(await response.json());
}

/**
 * Create an invite link. Owners and editors only.
 * Backend: POST /api/trips/{tripId}/invitations
 *
 * @param {string} tripId
 * @param {'member'|'viewer'} role
 * @returns {Promise<{ id, tripId, role, expiresAt, link }>}
 */
export async function createInvitation(tripId, role = 'member') {
  const response = await authedFetch(`/trips/${encodeURIComponent(tripId)}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
  if (response.status === 403) throw new ForbiddenError('Only the owner and editors can invite people.');
  if (!response.ok) throw await errorFrom(response, 'Could not create the invite');
  const invite = await response.json();
  return { ...invite, link: inviteLinkFor(invite.id) };
}

/**
 * Invites that are still waiting to be used (not used, not expired).
 * Backend: GET /api/trips/{tripId}/invitations
 */
export async function getPendingInvitations(tripId) {
  const response = await authedFetch(`/trips/${encodeURIComponent(tripId)}/invitations`);
  if (response.status === 403) return []; // viewers can't see invites
  if (!response.ok) throw await errorFrom(response, 'Could not load invites');
  const data = await response.json();
  const now = Date.now();
  return (Array.isArray(data) ? data : [])
    .filter((i) => !i.usedBy && new Date(i.expiresAt).getTime() > now)
    .map((i) => ({ ...i, link: inviteLinkFor(i.id) }));
}

/** Backend: DELETE /api/trips/{tripId}/invitations/{inviteId} */
export async function revokeInvitation(tripId, inviteId) {
  const response = await authedFetch(
    `/trips/${encodeURIComponent(tripId)}/invitations/${encodeURIComponent(inviteId)}`,
    { method: 'DELETE' }
  );
  if (response.status === 404) return true; // already gone
  if (!response.ok) throw await errorFrom(response, 'Could not revoke the invite');
  return true;
}

/**
 * Preview an invite before joining: role, expiry and the trip's basics.
 * Backend: GET /api/join/{inviteId}
 * Throws with the backend's reason (expired, already used, not found).
 */
export async function getInvitationPreview(inviteId) {
  const response = await authedFetch(`/join/${encodeURIComponent(inviteId)}`);
  if (!response.ok) throw await errorFrom(response, 'This invite link isn\'t valid');
  return response.json();
}

/**
 * Join the trip an invite is for. Returns the joined trip.
 * Backend: POST /api/join/{inviteId}
 * A 409 means you're already on the trip; that's reported as `alreadyMember`.
 */
export async function joinTrip(inviteId) {
  const response = await authedFetch(`/join/${encodeURIComponent(inviteId)}`, { method: 'POST' });
  if (response.status === 409) {
    const err = await errorFrom(response, 'You are already on this trip');
    err.alreadyMember = true;
    throw err;
  }
  if (!response.ok) throw await errorFrom(response, 'Could not join the trip');
  return response.json();
}

/**
 * Change a member's role. Owner only. `memberUserId` is the member's user id.
 * Backend: PUT /api/trips/{tripId}/members/{memberId}/role
 */
export async function changeMemberRole(tripId, memberUserId, role) {
  const response = await authedFetch(
    `/trips/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberUserId)}/role`,
    { method: 'PUT', body: JSON.stringify({ role }) }
  );
  if (response.status === 403) throw new ForbiddenError('Only the trip owner can change roles.');
  if (!response.ok) throw await errorFrom(response, 'Could not change the role');
  return response.json();
}

/**
 * Remove a member from the trip. Owner only.
 * Backend: DELETE /api/trips/{tripId}/members/{memberId}
 */
export async function removeMember(tripId, memberUserId) {
  const response = await authedFetch(
    `/trips/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberUserId)}`,
    { method: 'DELETE' }
  );
  if (response.status === 403) throw new ForbiddenError('Only the trip owner can remove people.');
  if (!response.ok) throw await errorFrom(response, 'Could not remove this person');
  return true;
}
