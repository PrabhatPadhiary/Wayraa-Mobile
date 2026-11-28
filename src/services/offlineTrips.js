import { auth } from '../config';
import { cacheAge, CacheKeys } from './cache';
import { getTripById } from './tripsService';
import { getItinerary } from './itineraryService';
import { getChecklist } from './checklistService';
import { getExpenses, getBalances } from './budgetService';
import { getPolls } from './pollsService';
import { getAnnouncements } from './announcementsService';
import { pickActiveTrips } from '../utils/tripDates';
import { isOffline } from '../hooks/useNetwork';

/**
 * Keep your trips ready for offline, without opening each one.
 *
 * When your trips list loads (and you're online), the trips you might need on
 * the road (ongoing, upcoming and drafts, up to MAX_TRIPS; past trips are
 * skipped) are fetched quietly in the background: details, day plan,
 * checklist, budget, polls and announcements. The cache saves them on the
 * phone (see cache.js), so they open with no internet.
 *
 * Cheap by design: a trip saved less than FRESH_FOR_MS ago is skipped, one
 * trip at a time, at most one run every MIN_GAP_MS. Failures are ignored
 * (it's a nice-to-have; opening the trip later saves it anyway).
 */

const MAX_TRIPS = 10;
const FRESH_FOR_MS = 6 * 60 * 60 * 1000; // 6 hours
const MIN_GAP_MS = 10 * 60 * 1000;       // 10 minutes

let running = false;
let lastRun = 0;

export function saveTripsForOffline(trips) {
  if (running || !auth.currentUser || isOffline()) return;
  if (Date.now() - lastRun < MIN_GAP_MS) return;
  const wanted = pickActiveTrips(trips)
    .slice(0, MAX_TRIPS)
    .filter((t) => t?.id && cacheAge(CacheKeys.trip(t.id)) > FRESH_FOR_MS);
  if (!wanted.length) return;

  running = true;
  lastRun = Date.now();
  (async () => {
    for (const trip of wanted) {
      if (isOffline() || !auth.currentUser) break; // lost signal or signed out
      const id = trip.id;
      await Promise.allSettled([
        getTripById(id),
        getItinerary(id),
        getChecklist(id),
        getExpenses(id),
        getBalances(id),
        getPolls(id),
        getAnnouncements(id),
      ]);
    }
  })().finally(() => { running = false; });
}
