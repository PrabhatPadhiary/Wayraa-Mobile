import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMyTrips } from './tripsService';
import { getFavourites } from './favouritesService';
import { getJournalFeed } from './journalsService';
import { getLocationPermission, getCurrentLocation, getNearbyPlaces, reverseGeocode } from './locationService';
import { pickActiveTrips } from '../utils/tripDates';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

/**
 * Home page preload: started while the logo screen is up, so the Explore page
 * opens with its rows already filled (and their photos already cached)
 * instead of showing skeletons.
 *
 *  - preloadPublic()     journals feed, plus nearby places when location is
 *                        already allowed (never prompts on the logo screen)
 *  - preloadSignedIn()   your trips and favourites
 *  - waitForHomePreload(ms)  resolves when everything started has finished,
 *                        or after `ms`, whichever comes first
 *
 * The Explore screen reads each result once (peekPreloaded on first render,
 * takePreloaded when its loader runs); later refreshes fetch as usual.
 *
 * Saved copy ("snapshot"): every result is also saved on the phone. When the
 * app starts again (e.g. Android closed it in the background),
 * restoreHomeSnapshot() puts the saved copy in place at once, so Home opens
 * filled straight away; the fresh results replace it as they arrive. Your
 * trips and favourites are only restored for the same signed-in account.
 */

const SNAPSHOT_KEY = 'wayraa_home_snapshot_v1';
const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // older than this: start fresh
const PUBLIC_KEYS = ['journals', 'nearby'];
const PRIVATE_KEYS = ['trips', 'favourites'];
let snapshotOwner = null; // signed-in account the private results belong to
let saveTimer = null;

const tasks = {};   // key -> promise of the value
const results = {}; // key -> { value } once settled successfully
const latest = {};  // key -> { value } fetched this run (kept for the saved copy)

function run(key, load, imagesFor) {
  if (tasks[key]) return tasks[key];
  tasks[key] = (async () => {
    const value = await load();
    results[key] = { value };
    latest[key] = { value };
    scheduleSnapshotSave();
    // Warm the image cache; errors (a missing photo) don't matter here.
    const urls = (imagesFor?.(value) || []).filter(Boolean);
    if (urls.length) await Image.prefetch(urls, 'memory-disk').catch(() => {});
    return value;
  })().catch(() => {
    delete results[key];
    return undefined;
  });
  return tasks[key];
}

// Through getJournalFeed, which keeps the whole feed for Community to show
// at once; Home's row uses the newest six.
async function loadJournals() {
  return (await getJournalFeed()).slice(0, 6);
}

async function loadNearby() {
  // Only when already allowed: the permission prompt belongs on the home page.
  const perm = await getLocationPermission();
  if (!perm.granted) throw new Error('Location not allowed yet');
  const loc = await getCurrentLocation();
  if (!loc.granted) throw new Error('No location');
  const [places, label] = await Promise.all([
    getNearbyPlaces(loc.lat, loc.lng),
    reverseGeocode(loc.lat, loc.lng),
  ]);
  return { loc, places, label };
}

/**
 * @param {string[]} [staticImages]  fixed images on the home page (popular
 *                                   destinations, categories) to cache too
 */
export function preloadPublic(staticImages = []) {
  if (staticImages.length) Image.prefetch(staticImages, 'memory-disk').catch(() => {});
  run('journals', loadJournals, (list) => list.map((j) => cloudinarySized(j.photos?.[0]?.url, IMAGE_WIDTH.COVER)));
  run('nearby', loadNearby, (n) => n.places.slice(0, 6).map((p) => p.photoUrl));
}

/**
 * @param {string|null} [profilePhoto]
 * @param {string} [userId]  the signed-in account (owner of the saved copy)
 */
export function preloadSignedIn(profilePhoto, userId) {
  snapshotOwner = userId || null;
  if (profilePhoto) Image.prefetch(profilePhoto, 'memory-disk').catch(() => {});
  run('trips', getMyTrips, (trips) => pickActiveTrips(trips).slice(0, 3).map((t) =>
    placePhotoUrl(t.primaryPlaceId, 800) || normalizePhotoUrl(t.coverPhotoUrl, 800)));
  run('favourites', getFavourites, (favs) => favs.slice(0, 8).map((f) =>
    placePhotoUrl(f.placeId, 400) || normalizePhotoUrl(f.photoUrl, 400)));
}

export function waitForHomePreload(maxMs) {
  return Promise.race([
    Promise.all(Object.values(tasks)),
    new Promise((resolve) => setTimeout(resolve, maxMs)),
  ]);
}

/** A finished result, without using it up; undefined if not ready. */
export function peekPreloaded(key) {
  return results[key]?.value;
}

/**
 * Use a preloaded result once: its promise if one was started (resolves to
 * undefined if it failed), else null. Later calls return null, so refreshes
 * fetch fresh data.
 */
export function takePreloaded(key) {
  const task = tasks[key];
  if (!task) return null;
  delete tasks[key];
  delete results[key];
  return task;
}

// ── Saved copy on the phone ──────────────────────────────────────────────

function scheduleSnapshotSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const prev = JSON.parse((await AsyncStorage.getItem(SNAPSHOT_KEY)) || 'null');
      // Keep what's already saved for keys not reloaded this time, but never
      // carry one account's trips into another's copy.
      const sameOwner = prev?.owner === snapshotOwner;
      const data = {};
      [...PUBLIC_KEYS, ...PRIVATE_KEYS].forEach((key) => {
        if (latest[key]) data[key] = latest[key].value;
        else if (prev?.data?.[key] !== undefined && (PUBLIC_KEYS.includes(key) || sameOwner)) data[key] = prev.data[key];
      });
      if (!snapshotOwner) PRIVATE_KEYS.forEach((key) => { delete data[key]; });
      await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: Date.now(), owner: snapshotOwner, data }));
    } catch {
      // A failed save only means a slower next start.
    }
  }, 600);
}

/**
 * Put the saved copy in place for results that haven't arrived yet.
 * Returns true when it covers everything Home shows first (the feed, plus
 * your trips and favourites when signed in), so the logo can go quickly.
 *
 * @param {string|null} userId  signed-in account, or null for a guest
 */
export async function restoreHomeSnapshot(userId) {
  try {
    const snap = JSON.parse((await AsyncStorage.getItem(SNAPSHOT_KEY)) || 'null');
    if (!snap?.data || Date.now() - (snap.savedAt || 0) > SNAPSHOT_MAX_AGE_MS) return false;
    const keys = userId && snap.owner === userId ? [...PUBLIC_KEYS, ...PRIVATE_KEYS] : PUBLIC_KEYS;
    keys.forEach((key) => {
      if (!results[key] && snap.data[key] !== undefined) results[key] = { value: snap.data[key] };
    });
    const needed = userId ? ['journals', ...PRIVATE_KEYS] : ['journals'];
    return needed.every((key) => results[key]);
  } catch {
    return false;
  }
}
