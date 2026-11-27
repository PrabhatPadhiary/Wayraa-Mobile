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

/**
 * The trip's polls (kept in memory, so coming back to the trip is instant).
 * A vote you're still saving is laid over them (see castVote), so a reload
 * or a friend's live change mid-save can't flip your choice back.
 */
export function getPolls(tripId) {
  return cachedFetch(CacheKeys.polls(tripId), async () => {
    const data = await request(tripId);
    return Array.isArray(data) ? data : [];
  }).then(withPendingVotes);
}

/** As last loaded for this trip (instant), or undefined. */
export function peekPolls(tripId) {
  const list = peekCache(CacheKeys.polls(tripId));
  return list ? withPendingVotes(list) : list;
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

/** The poll as it looks after my vote moves to `optionId` (null: taken back). */
export function withMyVote(poll, optionId, me) {
  const prev = poll.myOptionId || null;
  if (prev === (optionId || null)) return poll;
  const voter = me ? { id: me.id, name: me.name, photoUrl: me.photoUrl } : null;
  const options = poll.options.map((o) => {
    let { votes, voters } = o;
    if (o.id === prev) {
      votes -= 1;
      voters = voters.filter((v) => v.id !== me?.id);
    }
    if (o.id === optionId) {
      votes += 1;
      voters = voter ? [...voters, voter] : voters;
    }
    return { ...o, votes, voters };
  });
  const totalVotes = poll.totalVotes + (prev ? 0 : 1) - (optionId ? 0 : 1);
  const top = Math.max(0, ...options.map((o) => o.votes));
  return {
    ...poll,
    options,
    myOptionId: optionId || null,
    totalVotes,
    leadingOptionIds: top > 0 ? options.filter((o) => o.votes === top).map((o) => o.id) : [],
  };
}

// ── Your vote, while it's being saved ─────────────────────────────────────
//
// Tapping options quickly used to send every tap, then apply each reply as it
// came back, so after you stopped the vote flipped through your old choices.
// Now (as with likes): the screen follows every tap at once, but only your
// LAST choice is sent, a moment after you stop tapping. Replies are only
// applied when nothing newer is waiting, and while a vote is saving, freshly
// loaded polls show your choice (withPendingVotes). If saving fails, the poll
// goes back to how the server last had it.

const SEND_AFTER_MS = 300;
const pending = new Map(); // pollId -> { tripId, choice, me, confirmed, sending, timer, onUpdate, onError }

/**
 * Vote for `optionId` (null: take your vote back).
 * @param {{ tripId: string, poll: object, optionId: string|null, me: object|null,
 *   onUpdate: (poll) => void, onError: (error) => void }} args
 *   poll: as on screen now. onUpdate: show this poll. onError: saving failed.
 */
export function castVote({ tripId, poll, optionId, me, onUpdate, onError }) {
  let entry = pending.get(poll.id);
  if (!entry) {
    // The poll before this run of taps: what we go back to if saving fails.
    entry = { tripId, confirmed: poll, sending: false, timer: null };
    pending.set(poll.id, entry);
  }
  Object.assign(entry, { choice: optionId || null, me, onUpdate, onError });
  onUpdate(withMyVote(poll, entry.choice, me)); // on screen at once
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => { entry.timer = null; send(poll.id); }, SEND_AFTER_MS);
}

/** Is a vote on this poll still being saved? */
export function isVoteSaving(pollId) {
  return pending.has(pollId);
}

async function send(pollId) {
  const entry = pending.get(pollId);
  if (!entry || entry.sending) return; // the running send picks up the newest choice
  const choice = entry.choice;
  entry.sending = true;
  try {
    const saved = choice
      ? await votePoll(entry.tripId, pollId, choice)
      : await unvotePoll(entry.tripId, pollId);
    entry.sending = false;
    if (saved) entry.confirmed = saved;
    if (entry.choice !== choice || entry.timer) {
      // You tapped again meanwhile: that newer choice goes next (now, or when
      // its short wait ends). This reply isn't shown: it's already out of date.
      if (!entry.timer) send(pollId);
      return;
    }
    pending.delete(pollId);
    if (saved) {
      remember(entry.tripId, saved);
      entry.onUpdate(saved);
    }
  } catch (e) {
    entry.sending = false;
    if (entry.choice !== choice || entry.timer) {
      if (!entry.timer) send(pollId); // a newer choice: try that instead
      return;
    }
    pending.delete(pollId);
    entry.onUpdate(entry.confirmed);
    entry.onError(e);
  }
}

/** Saved polls on the phone get the new version too (next visit starts from it). */
function remember(tripId, poll) {
  const list = peekCache(CacheKeys.polls(tripId));
  if (Array.isArray(list)) setCache(CacheKeys.polls(tripId), list.map((p) => (p.id === poll.id ? poll : p)));
}

/** Polls with any vote you're still saving shown as you chose it. */
function withPendingVotes(list) {
  if (!Array.isArray(list) || pending.size === 0) return list;
  return list.map((p) => {
    const entry = pending.get(p.id);
    return entry ? withMyVote(p, entry.choice, entry.me) : p;
  });
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
