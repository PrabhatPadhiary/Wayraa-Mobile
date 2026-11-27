import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { API_URL } from '../config';
import { cachedFetch, peekCache } from './cache';

/**
 * Tours and tickets you can book (Viator, affiliate). The backend finds the
 * tours; booking happens on Viator's site in an in-app browser. Results are
 * kept in memory for an hour.
 *
 * Every call resolves to { areaName, seeAllUrl, items } and never throws:
 * an empty `items` (also on any error) means "hide the row".
 */

const MAX_AGE = 60 * 60 * 1000;
// scope: "place" (tours for the place itself) or "area" (the area's top tours).
const EMPTY = Object.freeze({ areaName: null, seeAllUrl: null, scope: 'area', items: [] });
// Same as EMPTY, but not kept, so the next visit tries again.
const FAILED = Object.freeze({ ...EMPTY, failed: true });

const round = (n) => Math.round(Number(n) * 1000) / 1000; // ~100 m: nearby lookups share a cache entry
const validCoords = (lat, lng) => Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && !(Number(lat) === 0 && Number(lng) === 0);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** One load; if the partner or the network failed, one more try shortly after. */
async function load(path) {
  const first = await loadOnce(path);
  if (!first.failed) return first;
  await wait(2500);
  return loadOnce(path);
}

// 503 = Viator unreachable right now (FAILED: not kept, tried again next time).
async function loadOnce(path) {
  try {
    const response = await fetch(`${API_URL}/Offers/${path}`);
    if (!response.ok) return FAILED;
    const data = await response.json();
    return {
      areaName: data?.areaName ?? null,
      seeAllUrl: data?.seeAllUrl ?? null,
      scope: data?.scope === 'place' ? 'place' : 'area',
      items: Array.isArray(data?.items) ? data.items : [],
    };
  } catch {
    return FAILED;
  }
}

// "No tours here" is kept too (an hour); a failed load isn't.
const keepIfFound = (value) => !value.failed;

function destinationKey(name, lat, lng, theme) {
  return `offers:dest:${theme || 'all'}:${(name || '').toLowerCase()}:${round(lat)},${round(lng)}`;
}
function placeKey(name, lat, lng, exact) {
  return `offers:place:${exact ? 'x' : 'a'}:${(name || '').toLowerCase()}:${round(lat)},${round(lng)}`;
}

/** Top tours for a city or region. theme 'food': food tours, cooking classes, tastings. */
export function getDestinationActivities({ name, lat, lng, theme }) {
  if (!validCoords(lat, lng)) return Promise.resolve(EMPTY);
  const qs = `name=${encodeURIComponent(name || '')}&lat=${round(lat)}&lng=${round(lng)}${theme ? `&theme=${theme}` : ''}`;
  return cachedFetch(destinationKey(name, lat, lng, theme), () => load(`activities/destination?${qs}`), { maxAge: MAX_AGE, keepIf: keepIfFound });
}

/**
 * Tours for one place. exact: only tours for the place itself (no
 * fallback to the area's top tours), used for the itinerary chip.
 */
export function getPlaceActivities({ name, lat, lng, exact = false }) {
  if (!name || !validCoords(lat, lng)) return Promise.resolve(EMPTY);
  const qs = `name=${encodeURIComponent(name)}&lat=${round(lat)}&lng=${round(lng)}${exact ? '&exact=true' : ''}`;
  return cachedFetch(placeKey(name, lat, lng, exact), () => load(`activities/place?${qs}`), { maxAge: MAX_AGE, keepIf: keepIfFound });
}

/**
 * One tour's details (photos, description, included, stops, meeting point,
 * policies). Resolves to the details, null when Viator has no such tour, or
 * { failed: true } when it couldn't load (not kept: tried again next time).
 */
export function getActivityDetail(code) {
  if (!code) return Promise.resolve(null);
  return cachedFetch(`offers:detail:${code}`, async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(`${API_URL}/Offers/activities/${encodeURIComponent(code)}`);
        if (response.status === 404) return null;
        if (response.ok) return await response.json();
      } catch {
        // network error: try again below
      }
      if (attempt === 0) await wait(2500);
    }
    return { failed: true };
  }, { maxAge: MAX_AGE, keepIf: (v) => !v?.failed });
}

export function peekActivityDetail(code) {
  return peekCache(`offers:detail:${code}`);
}

/** Last loaded results (instant), or undefined. */
export function peekDestinationActivities({ name, lat, lng, theme }) {
  return peekCache(destinationKey(name, lat, lng, theme));
}
export function peekPlaceActivities({ name, lat, lng, exact = false }) {
  return peekCache(placeKey(name, lat, lng, exact));
}

/** Open a partner page (booking link, kept exactly as given: it carries the tracking). */
export async function openOffer(url) {
  if (!url) return;
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Linking.openURL(url).catch(() => {});
  }
}
