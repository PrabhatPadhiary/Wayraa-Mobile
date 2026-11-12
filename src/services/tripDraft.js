import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Trips you started creating but didn't finish ("unfinished trips"), kept on
 * the phone until each is created or discarded, so leaving Create trip (or
 * Android closing the app) doesn't lose them. Home and My Trips list them.
 *
 * Up to MAX_DRAFTS, one per destination; a new one past the limit replaces
 * the oldest. Each expires on its own after 14 days.
 *
 * Draft: { id, savedAt, dest: { placeId, name, secondary, photoUrl, lat, lng },
 *          tripName, startDate, endDate, travelers, description }
 */
const DRAFTS_KEY = 'wayraa_trip_drafts_v2';
const OLD_KEY = 'wayraa_trip_draft_v1'; // the single draft kept before
const MAX_DRAFTS = 3;
const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export const newDraftId = () => `d-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

async function readAll() {
  try {
    let list = JSON.parse((await AsyncStorage.getItem(DRAFTS_KEY)) || 'null');
    if (!Array.isArray(list)) {
      // Carry over the single draft from before.
      const old = JSON.parse((await AsyncStorage.getItem(OLD_KEY)) || 'null');
      list = old ? [{ ...old, id: newDraftId() }] : [];
      await writeAll(list);
      await AsyncStorage.removeItem(OLD_KEY);
    }
    const fresh = list.filter((d) => d && Date.now() - (d.savedAt || 0) <= DRAFT_MAX_AGE_MS);
    if (fresh.length !== list.length) await writeAll(fresh);
    return fresh;
  } catch {
    return [];
  }
}

function writeAll(list) {
  return AsyncStorage.setItem(DRAFTS_KEY, JSON.stringify(list)).catch(() => {});
}

/** Unfinished trips, most recently changed first. */
export async function getTripDrafts() {
  return (await readAll()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export async function getTripDraft(id) {
  return (await readAll()).find((d) => d.id === id) || null;
}

/** The unfinished trip for a destination (by Google place id), or null. */
export async function findTripDraftFor(placeId) {
  if (!placeId) return null;
  return (await readAll()).find((d) => d.dest?.placeId === placeId) || null;
}

/** Save (add or update) a draft by its id; keeps the newest MAX_DRAFTS. */
export async function saveTripDraft(draft) {
  const list = (await readAll()).filter((d) => d.id !== draft.id);
  list.push({ ...draft, savedAt: Date.now() });
  list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  await writeAll(list.slice(0, MAX_DRAFTS));
}

export async function clearTripDraft(id) {
  const list = await readAll();
  await writeAll(list.filter((d) => d.id !== id));
}
