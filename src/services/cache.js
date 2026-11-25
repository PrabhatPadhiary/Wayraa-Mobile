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
 * Some keys are also saved on the phone (AsyncStorage), so they're there on
 * the next app start, and offline: your trips list, favourites, profile, and
 * each trip you've opened with its plan, budget, checklist, polls and
 * announcements (so a trip still opens with no internet). Everything else is
 * memory only, gone when the app is closed. Saved trips that are no longer
 * in your trips list (deleted, or you left) are removed when the list loads.
 *
 * Saved copies are tagged with the account; clearAllCaches() on log out and
 * account deletion wipes everything, so the next person never sees them.
 */

const STORAGE_PREFIX = 'wayraa_cache:';
const PERSISTED = new Set(['trips', 'favourites', 'profile']);
// Per-trip keys ("trip:<id>", "itinerary:<id>", ...) that are saved too.
const TRIP_PREFIXES = ['trip', 'itinerary', 'expenses', 'checklist', 'polls', 'announcements'];

const tripIdOf = (key) => {
  const i = key.indexOf(':');
  return i > 0 && TRIP_PREFIXES.includes(key.slice(0, i)) ? key.slice(i + 1) : null;
};
const isPersisted = (key) => PERSISTED.has(key) || tripIdOf(key) !== null;

/** The cache keys, in one place. */
export const CacheKeys = {
  trips: 'trips',
  trip: (tripId) => `trip:${tripId}`,
  favourites: 'favourites',
  profile: 'profile',
  itinerary: (tripId) => `itinerary:${tripId}`,
  expenses: (tripId) => `expenses:${tripId}`,
  checklist: (tripId) => `checklist:${tripId}`,
  polls: (tripId) => `polls:${tripId}`,
  announcements: (tripId) => `announcements:${tripId}`,
  place: (placeId) => `place:${placeId}`,
};

const entries = new Map(); // key -> { value, at }
const inflight = new Map(); // key -> Promise
let generation = 0; // bumped by clearAllCaches: late answers are dropped
let ownerUid = null; // whose data the saved copies are

export function peekCache(key) {
  return entries.get(key)?.value;
}

/** How old the saved copy of `key` is, in ms (Infinity if there's none). */
export function cacheAge(key) {
  const entry = entries.get(key);
  return entry ? Date.now() - (entry.at || 0) : Infinity;
}

export function setCache(key, value) {
  if (value === undefined) return;
  const entry = { value, at: Date.now() };
  entries.set(key, entry);
  if (isPersisted(key) && ownerUid) {
    AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ uid: ownerUid, ...entry })).catch(() => {});
  }
  if (key === CacheKeys.trips && Array.isArray(value)) pruneSavedTrips(value);
}

/**
 * Your trips list just loaded: remove saved copies of trips that aren't in
 * it any more (deleted, or you left), on the phone and in memory.
 */
function pruneSavedTrips(trips) {
  const keep = new Set(trips.map((t) => String(t?.id)));
  for (const key of [...entries.keys()]) {
    const id = tripIdOf(key);
    if (id !== null && !keep.has(id)) entries.delete(key);
  }
  AsyncStorage.getAllKeys()
    .then((all) => all.filter((k) => {
      if (!k.startsWith(STORAGE_PREFIX)) return false;
      const id = tripIdOf(k.slice(STORAGE_PREFIX.length));
      return id !== null && !keep.has(id);
    }))
    .then((gone) => (gone.length ? AsyncStorage.multiRemove(gone) : null))
    .catch(() => {});
}

/** Forget one key, or every key starting with `prefix` + ':' (e.g. 'trip'). */
export function dropCache(keyOrPrefix) {
  for (const key of [...entries.keys()]) {
    if (key === keyOrPrefix || key.startsWith(`${keyOrPrefix}:`)) entries.delete(key);
  }
  // The saved copy too, even if it was never loaded into memory.
  if (isPersisted(keyOrPrefix)) AsyncStorage.removeItem(STORAGE_PREFIX + keyOrPrefix).catch(() => {});
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
 * App start, signed in: load the saved copies (trips, favourites, profile,
 * and the trips you've opened) into memory, so screens can show them at once,
 * even offline. Copies saved by another account are thrown away.
 */
export async function hydrateCache(uid) {
  ownerUid = uid || null;
  if (!uid) return;
  try {
    const keys = (await AsyncStorage.getAllKeys())
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .map((k) => k.slice(STORAGE_PREFIX.length))
      .filter(isPersisted);
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

// One person's history kept outside the cache: recent searches (Explore),
// recent cities and the city being explored (location sheet). Cleared with
// the caches, so the next account on this phone starts clean.
const PERSONAL_KEYS = ['wayraa_recent_searches', 'wayraa_recent_cities_v1', 'wayraa_explore_city_v1'];

// Other modules that keep one account's data in memory (your photo, the Home
// preload) register here, so log out resets them too.
const clearListeners = new Set();

/** Run `reset` whenever clearAllCaches() runs (log out, account deleted). */
export function onClearAllCaches(reset) {
  clearListeners.add(reset);
}

/** Log out / account deleted: forget everything, in memory and on the phone. */
export async function clearAllCaches() {
  generation += 1;
  entries.clear();
  inflight.clear();
  ownerUid = null;
  clearListeners.forEach((reset) => {
    try { reset(); } catch { /* one failing reset mustn't stop the rest */ }
  });
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(STORAGE_PREFIX));
    keys.push(...PERSONAL_KEYS);
    await AsyncStorage.multiRemove(keys);
  } catch {
    // Nothing to clear.
  }
}
