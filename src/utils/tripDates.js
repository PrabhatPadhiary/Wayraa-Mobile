/**
 * Trip date helpers.
 *
 * The backend stores trip dates as UTC midnight, so they are read in UTC.
 * Local-time formatting would show the previous day in time zones behind UTC.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar day of a Date (read in UTC) as a UTC-midnight timestamp. */
function utcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatDay(date, withYear) {
  const base = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return withYear ? `${base} ${date.getUTCFullYear()}` : base;
}

/** "12 Jun – 18 Jun 2026", "From 12 Jun 2026", or null when there's no start. */
export function formatDateRange(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    return `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`;
  }
  if (start) return `From ${formatDay(start, true)}`;
  return null;
}

/** Inclusive number of days between two dates, or null if either is missing. */
export function dayCount(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const days = Math.round((utcDay(new Date(endDate)) - utcDay(new Date(startDate))) / DAY_MS) + 1;
  return days > 0 ? days : null;
}

/**
 * Whole days from today (the device's calendar date) until the start date.
 * 0 = today, 1 = tomorrow, negative = already started. Null without a date.
 */
export function daysUntil(startDate) {
  if (!startDate) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((utcDay(new Date(startDate)) - today) / DAY_MS);
}

// Soonest start first; trips without a start date go last.
function byStartAsc(a, b) {
  const start = (t) => (t.startDate ? new Date(t.startDate).getTime() : Infinity);
  const diff = start(a) - start(b);
  return Number.isNaN(diff) ? 0 : diff;
}

/**
 * Choose the trip to feature on the home screen: an ongoing trip first, then
 * the soonest upcoming one, then the most recent draft. Returns null if none.
 */
export function pickNextTrip(trips) {
  return pickActiveTrips(trips)[0] || null;
}

/**
 * All of the user's active (not completed) trips for the home carousel, in the
 * order they should appear: ongoing first (soonest start), then upcoming
 * (soonest start), then drafts (most recently created). Completed trips are
 * left out. Returns [] when there are none.
 */
export function pickActiveTrips(trips) {
  if (!Array.isArray(trips)) return [];
  const withStatus = (status) =>
    trips.filter((t) => (t.status || '').toLowerCase() === status);

  const live = withStatus('in_progress').sort(byStartAsc);
  const upcoming = withStatus('planning').sort(byStartAsc);
  const drafts = withStatus('draft').sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return [...live, ...upcoming, ...drafts];
}

/**
 * Order for the My Trips list: the active trips in the same order as the home
 * carousel (ongoing, upcoming, drafts — see pickActiveTrips), then completed
 * trips, most recently finished first. Trips with an unknown status go last.
 */
export function sortTripsForList(trips) {
  if (!Array.isArray(trips)) return [];
  const active = pickActiveTrips(trips);
  const finishedAt = (t) => new Date(t.endDate || t.startDate || t.createdAt || 0).getTime() || 0;
  const completed = trips
    .filter((t) => (t.status || '').toLowerCase() === 'completed')
    .sort((a, b) => finishedAt(b) - finishedAt(a));
  const known = new Set([...active, ...completed]);
  return [...active, ...completed, ...trips.filter((t) => !known.has(t))];
}
