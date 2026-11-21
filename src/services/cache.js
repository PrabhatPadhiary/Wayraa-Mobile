import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A small cache for API data, so screens open instantly with the last copy
 * while a fresh one loads ("stale while revalidate").
 *
 *  - cachedFetch(key, fetcher)  fetches and keeps the result. Calls for the
 *    same key while one is on its way share it (no duplicate requests).
 *    With `maxAge`, a copy younger than that is returned without fetching.
 *  - peekCache(key)             the last copy, instantly (or undefined).
 *  - setCache(key, value)       screens write back what they show (after
 *    your own edits), so the next visit starts from that.
 *
 * Keys in PERSISTED are also saved on the phone (AsyncStorage), so they're
 * there on the next app start too: your trips list, favourites, profile.
 * Everything else is memory only, gone when the app is closed.
 *
 * Saved copies are tagged with the account; clearAllCaches() on log out and
 * account deletion wipes everything, so the next person never sees them.
 */

const STORAGE_PREFIX = 'wayraa_cache:';
const PERSISTED = new Set(['trips', 'favourites', 'profile']);

/** The cache keys, in one place. */
export const CacheKeys = {
  trips: 'trips',
  trip: (tripId) => `trip:${tripId}`,
  favourites: 'favourites',
  profile: 'profile',
  itinerary: (tripId) => `itinerary:${tripId}`,
  expenses: (tripId) => `expenses:${tripId}`,
  checklist: (tripId) => `checklist:${tripId}`,
  place: (placeId) => `place:${placeId}`,
};

const entries = new Map(); // key -> { value, at }
const inflight = new Map(); // key -> Promise
let generation = 0; // bumped by clearAllCaches: late answers are dropped
let ownerUid = null; // whose data the saved copies are

export function peekCache(key) {
  return entries.get(key)?.value;
}

export function setCache(key, value) {
  if (value === undefined) return;
  const entry = { value, at: Date.now() };
  entries.set(key, entry);
  if (PERSISTED.has(key) && ownerUid) {
    AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ uid: ownerUid, ...entry })).catch(() => {});
  }
}

/** Forget one key, or every key starting with `prefix` + ':' (e.g. 'trip'). */
export function dropCache(keyOrPrefix) {
  for (const key of [...entries.keys()]) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) {
      entries.delete(key);
      if (PERSISTED.has(key)) AsyncStorage.removeItem(STORAGE_PREFIX + key).catch(() => {});
    }
  }
}

/**
 * Fetch through the cache.
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {{ maxAge?: number, keepIf?: (value) => boolean }} [options]
 *   maxAge: ms a copy counts as fresh (0 = always fetch; the default).
 *   keepIf: only keep results passing this (e.g. skip "not found" nulls).
 */
export function cachedFetch(key, fetcher, { maxAge = 0, keepIf } = {}) {
  const entry = entries.get(key);
  if (entry && maxAge > 0 && Date.now() - entry.at < maxAge) return Promise.resolve(entry.value);
  if (inflight.has(key)) return inflight.get(key);

  const gen = generation;
  const request = Promise.resolve()
    .then(fetcher)
    .then((value) => {
      if (gen === generation && (!keepIf || keepIf(value))) setCache(key, value);
      return value;
    })
    .finally(() => {
      if (inflight.get(key) === request) inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

/**
 * App start, signed in: load the saved copies (trips, favourites, profile)
 * into memory, so the first screens can show them at once. Copies saved by
 * another account are thrown away.
 */
export async function hydrateCache(uid) {
  ownerUid = uid || null;
  if (!uid) return;
  try {
    const keys = [...PERSISTED];
    const pairs = await AsyncStorage.multiGet(keys.map((k) => STORAGE_PREFIX + k));
    pairs.forEach(([storageKey, raw], i) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (saved?.uid !== uid) {
          AsyncStorage.removeItem(storageKey).catch(() => {});
          return;
        }
        // Don't overwrite something fresher fetched meanwhile.
        if (!entries.has(keys[i])) entries.set(keys[i], { value: saved.value, at: saved.at || 0 });
      } catch {
        // A broken copy: ignore it.
      }
    });
  } catch {
    // Storage unavailable: just no head start.
  }
}

/** Log out / account deleted: forget everything, in memory and on the phone. */
export async function clearAllCaches() {
  generation += 1;
  entries.clear();
  inflight.clear();
  ownerUid = null;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(STORAGE_PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing to clear.
  }
}
