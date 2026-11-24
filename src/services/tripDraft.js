import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStoredUser } from './authService';

/**
 * Trips you started creating but didn't finish ("unfinished trips"), kept on
 * the phone until each is created or discarded, so leaving Create trip (or
 * Android closing the app) doesn't lose them. Home and My Trips list them.
 *
 * Each draft belongs to the account that started it (`ownerId`): you only see
 * your own, and someone else signing in on the same phone sees none of them.
 * Drafts from before owners were recorded are dropped.
 *
 * Per account: up to MAX_DRAFTS, one per destination (saving a draft for a
 * destination replaces any other draft for it); a new one past the limit
 * replaces the oldest. Each expires on its own after 14 days.
 *
 * Reads and writes run one at a time, so an autosave that's still writing
 * can't bring back a draft that was just cleared.
 *
 * Draft: { id, ownerId, savedAt, dest: { placeId, name, secondary, photoUrl,
 *          lat, lng }, tripName, startDate, endDate, travelers, description }
 */
const DRAFTS_KEY = 'wayraa_trip_drafts_v2';
const OLD_KEY = 'wayraa_trip_draft_v1'; // the single draft kept before (no owner)
const MAX_DRAFTS = 3;
const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const newDraftId = () => `d-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

// One read-modify-write at a time.
let queue = Promise.resolve();
function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

async function me() {
  const user = await getStoredUser().catch(() => null);
  return user?.id ? String(user.id) : null;
}

/** Every account's drafts that are still fresh and have an owner. */
async function readAll() {
  try {
    await AsyncStorage.removeItem(OLD_KEY);
    const list = JSON.parse((await AsyncStorage.getItem(DRAFTS_KEY)) || '[]');
    if (!Array.isArray(list)) return [];
    const fresh = list.filter((d) => d && d.ownerId && Date.now() - (d.savedAt || 0) <= DRAFT_MAX_AGE_MS);
    if (fresh.length !== list.length) await writeAll(fresh);
    return fresh;
  } catch {
    return [];
  }
}

function writeAll(list) {
  return AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(list)).catch(() => {});
}

const newestFirst = (a, b) => (b.savedAt || 0) - (a.savedAt || 0);

/** Your unfinished trips, most recently changed first. */
export function getTripDrafts() {
  return serial(async () => {
    const uid = await me();
    if (!uid) return [];
    return (await readAll()).filter((d) => d.ownerId === uid).sort(newestFirst);
  });
}

export async function getTripDraft(id) {
  return (await getTripDrafts()).find((d) => d.id === id) || null;
}

/** Your unfinished trip for a destination (by Google place id), or null. */
export async function findTripDraftFor(placeId) {
  if (!placeId) return null;
  return (await getTripDrafts()).find((d) => d.dest?.placeId === placeId) || null;
}

/** Save (add or update) a draft by its id; one per destination, newest MAX_DRAFTS. */
export function saveTripDraft(draft) {
  return serial(async () => {
    const uid = await me();
    if (!uid) return;
    const all = await readAll();
    const placeId = draft.dest?.placeId;
    const others = all.filter((d) => d.ownerId !== uid);
    const mine = all.filter((d) => d.ownerId === uid
      && d.id !== draft.id
      && !(placeId && d.dest?.placeId === placeId));
    mine.push({ ...draft, ownerId: uid, savedAt: Date.now() });
    mine.sort(newestFirst);
    await writeAll([...others, ...mine.slice(0, MAX_DRAFTS)]);
  });
}

export function clearTripDraft(id) {
  return serial(async () => {
    const all = await readAll();
    await writeAll(all.filter((d) => d.id !== id));
  });
}

/** After a trip is created: forget your drafts for that destination too. */
export function clearTripDraftsFor(placeId) {
  if (!placeId) return Promise.resolve();
  return serial(async () => {
    const uid = await me();
    const all = await readAll();
    await writeAll(all.filter((d) => !(d.ownerId === uid && d.dest?.placeId === placeId)));
  });
}
