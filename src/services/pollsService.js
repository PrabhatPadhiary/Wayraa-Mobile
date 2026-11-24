import { API_URL } from '../config';
import { getAuthToken } from './authService';
import { AuthRequiredError, ForbiddenError } from './errors';
import { cachedFetch, peekCache, setCache, CacheKeys } from './cache';

/**
 * A trip's polls: "Dinner on Day 2: where?" with 2-6 options. Owners and
 * members start polls and vote (one vote each, changeable while open);
 * viewers only see them. The creator or the owner can end or delete a poll.
 * Backend: /api/trips/{tripId}/polls.
 *
 * Each: {
 *   id, question, scheduledDate, slot, closesAt, closedAt, isClosed,
 *   itineraryItemId, createdAt, createdBy: { id, name, photoUrl } | null,
 *   totalVotes, myOptionId, leadingOptionIds, canVote, canManage,
 *   options: [{ id, text, tripPlaceId, photoUrl, category, votes, voters: [{ id, name, photoUrl }] }]
 * }
 */

export const POLL_QUESTION_MAX = 140;
export const POLL_OPTION_MAX = 120;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;

async function request(tripId, path = '', options = {}) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/trips/${encodeURIComponent(tripId)}/polls${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (response.status === 403) throw new ForbiddenError();
  if (!response.ok) {
    // 400s carry a message for the user ("This poll has closed.").
    const text = await response.text().catch(() => '');
    const err = new Error(response.status === 400 && text ? text.replace(/^"|"$/g, '') : `Request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }
  return response.json();
}

/** The trip's polls (kept in memory, so coming back to the trip is instant). */
export function getPolls(tripId) {
  return cachedFetch(CacheKeys.polls(tripId), async () => {
    const data = await request(tripId);
    return Array.isArray(data) ? data : [];
  });
}

/** As last loaded for this trip (instant), or undefined. */
export function peekPolls(tripId) {
  return peekCache(CacheKeys.polls(tripId));
}

/** What's on screen now (your own votes too) is what the next visit starts from. */
export function rememberPolls(tripId, polls) {
  if (tripId && Array.isArray(polls)) setCache(CacheKeys.polls(tripId), polls);
}

/**
 * @param {{ question: string, options: { text?: string, tripPlaceId?: string }[],
 *   scheduledDate?: string|null, slot?: string|null, closesAt?: string|null }} poll
 */
export function createPoll(tripId, poll) {
  return request(tripId, '', { method: 'POST', body: JSON.stringify(poll) });
}

export function votePoll(tripId, pollId, optionId) {
  return request(tripId, `/${encodeURIComponent(pollId)}/vote`, { method: 'PUT', body: JSON.stringify({ optionId }) });
}

export function unvotePoll(tripId, pollId) {
  return request(tripId, `/${encodeURIComponent(pollId)}/vote`, { method: 'DELETE' });
}

export function closePoll(tripId, pollId) {
  return request(tripId, `/${encodeURIComponent(pollId)}/close`, { method: 'POST' });
}

export function linkPollToItinerary(tripId, pollId, itineraryItemId) {
  return request(tripId, `/${encodeURIComponent(pollId)}/itinerary`, { method: 'PUT', body: JSON.stringify({ itineraryItemId }) });
}

export function deletePoll(tripId, pollId) {
  return request(tripId, `/${encodeURIComponent(pollId)}`, { method: 'DELETE' });
}
