import { Image } from 'expo-image';
import { API_URL } from '../config';
import { getMyTrips } from './tripsService';
import { getFavourites } from './favouritesService';
import { getLocationPermission, getCurrentLocation, getNearbyPlaces, reverseGeocode } from './locationService';
import { pickActiveTrips } from '../utils/tripDates';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';

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
 */

const tasks = {};   // key -> promise of the value
const results = {}; // key -> { value } once settled successfully

function run(key, load, imagesFor) {
  if (tasks[key]) return tasks[key];
  tasks[key] = (async () => {
    const value = await load();
    results[key] = { value };
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

async function loadJournals() {
  const response = await fetch(`${API_URL}/Journals/feed`);
  if (!response.ok) throw new Error(`Journals feed failed (${response.status})`);
  const data = await response.json();
  return Array.isArray(data) ? data.slice(0, 6) : [];
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
  run('journals', loadJournals, (list) => list.map((j) => j.photos?.[0]?.url));
  run('nearby', loadNearby, (n) => n.places.slice(0, 6).map((p) => p.photoUrl));
}

/** @param {string|null} [profilePhoto] */
export function preloadSignedIn(profilePhoto) {
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
