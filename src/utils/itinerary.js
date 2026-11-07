/**
 * Itinerary helpers: trip days, which stop a day belongs to, and "HH:mm" time
 * maths. Days are whole UTC days (days since epoch), matching how the backend
 * stores trip and itinerary dates (UTC midnight).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Itinerary categories (backend values) with icons and colors. */
export const ITINERARY_CATEGORIES = [
  { key: 'activity', label: 'Activity', icon: 'walk', color: '#16a34a', tint: '#e7f6ec' },
  { key: 'food', label: 'Food', icon: 'restaurant', color: '#dc2626', tint: '#fdecec' },
  { key: 'stay', label: 'Stay', icon: 'bed', color: '#2563eb', tint: '#e8effd' },
  { key: 'transport', label: 'Transport', icon: 'train', color: '#7c3aed', tint: '#f1ebfd' },
  { key: 'custom', label: 'Other', icon: 'bookmark', color: '#6b7280', tint: '#eff0f2' },
];
export const ITINERARY_CATEGORY = Object.fromEntries(ITINERARY_CATEGORIES.map((c) => [c.key, c]));

/** Quick time choices in the add sheet. `null` start = anytime. */
export const QUICK_SLOTS = [
  { key: 'morning', label: 'Morning', start: '09:00', end: '11:00' },
  { key: 'lunch', label: 'Lunch', start: '12:30', end: '13:30' },
  { key: 'afternoon', label: 'Afternoon', start: '15:00', end: '17:00' },
  { key: 'evening', label: 'Evening', start: '19:00', end: '21:00' },
  { key: 'anytime', label: 'Anytime', start: null, end: null },
];

/** Colors for stops, by stop order (same palette as the website). */
export const STOP_COLORS = ['#4ade80', '#f97316', '#818cf8', '#f472b6', '#facc15', '#22d3ee'];

export function isoToDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

export function dayToIso(day) {
  return day == null ? null : new Date(day * DAY_MS).toISOString();
}

export function todayDay() {
  const now = new Date();
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
}

/** "Sat 13 Jun" for a whole-day number. */
export function dayLabel(day) {
  const d = new Date(day * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function weekdayOf(day) {
  return WEEKDAYS[new Date(day * DAY_MS).getUTCDay()];
}

export function dateOf(day) {
  return new Date(day * DAY_MS).getUTCDate();
}

/** Map a saved place's category onto an itinerary category. */
export function placeToItineraryCategory(category) {
  const c = (category || '').toLowerCase();
  if (c === 'stay' || c === 'stays' || c === 'hotel' || c === 'hotels') return 'stay';
  if (c === 'food' || c === 'restaurant' || c === 'restaurants') return 'food';
  return 'activity';
}

/**
 * The stop a day belongs to: the stop whose dates cover it; otherwise the
 * latest stop that starts on or before it; otherwise the first stop.
 */
export function stopForDay(day, sortedDests) {
  if (!sortedDests.length) return null;
  const covering = sortedDests.find((d) => {
    const s = isoToDay(d.startDate);
    const e = isoToDay(d.endDate) ?? s;
    return s != null && day >= s && day <= e;
  });
  if (covering) return covering;
  const started = sortedDests
    .filter((d) => isoToDay(d.startDate) != null && isoToDay(d.startDate) <= day)
    .sort((a, b) => isoToDay(b.startDate) - isoToDay(a.startDate));
  return started[0] || sortedDests[0];
}

/**
 * Every day of the trip: [{ day, index, stop, color }]. Empty without dates.
 * Capped at 60 days as a safety net for bad data.
 */
export function tripDays(trip, sortedDests) {
  const start = isoToDay(trip?.startDate);
  const end = isoToDay(trip?.endDate) ?? start;
  if (start == null || end == null || end < start) return [];
  const days = [];
  for (let day = start; day <= Math.min(end, start + 59); day += 1) {
    const stop = stopForDay(day, sortedDests);
    const stopIndex = Math.max(0, sortedDests.findIndex((d) => d.id === stop?.id));
    days.push({ day, index: days.length, stop, color: STOP_COLORS[stopIndex % STOP_COLORS.length] });
  }
  return days;
}

/** "09:30" -> 570, or null. */
export function timeToMinutes(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** 570 -> "09:30" (clamped to the same day). */
export function minutesToTime(minutes) {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "2 h", "45 min", "1 h 30 min". */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Sort key: timed items by start time, untimed last within their group. */
export function compareByTime(a, b) {
  const ta = timeToMinutes(a.startTime);
  const tb = timeToMinutes(b.startTime);
  if (ta == null && tb == null) return 0;
  if (ta == null) return 1;
  if (tb == null) return -1;
  return ta - tb;
}

/**
 * Where a new item should go on a day: right after the latest timed item
 * (its end, or start + 1 h), else 09:00. Two hours long, kept inside the day.
 */
export function nextFreeSlot(dayItems) {
  let latestEnd = null;
  dayItems.forEach((i) => {
    const s = timeToMinutes(i.startTime);
    if (s == null) return;
    const e = timeToMinutes(i.endTime) ?? s + 60;
    latestEnd = latestEnd == null ? e : Math.max(latestEnd, e);
  });
  const start = latestEnd == null ? 9 * 60 : Math.min(latestEnd, 21 * 60);
  return { startTime: minutesToTime(start), endTime: minutesToTime(Math.min(start + 120, 23 * 60 + 59)) };
}
