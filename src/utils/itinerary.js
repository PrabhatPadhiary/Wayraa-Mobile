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
  // `bar`: the card's side colour, same as the website (activity blue, food
  // amber, stay green, transport purple, other slate); `color` for icons/text.
  { key: 'activity', label: 'Activity', icon: 'walk', color: '#2563eb', bar: '#60a5fa', tint: '#e8f1fe' },
  { key: 'food', label: 'Food', icon: 'restaurant', color: '#b45309', bar: '#fbbf24', tint: '#fef6e0' },
  { key: 'stay', label: 'Stay', icon: 'bed', color: '#15803d', bar: '#4ade80', tint: '#e7f8ee' },
  { key: 'transport', label: 'Transport', icon: 'train', color: '#7c3aed', bar: '#a78bfa', tint: '#f1ebfd' },
  { key: 'custom', label: 'Other', icon: 'bookmark', color: '#475569', bar: '#94a3b8', tint: '#eff1f4' },
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

/**
 * Parts of the day, the itinerary's main structure. An exact time is
 * optional; items without one keep their slot and their order in it.
 */
export const DAY_SLOTS = [
  { key: 'morning', label: 'Morning', icon: 'partly-sunny-outline' },
  { key: 'afternoon', label: 'Afternoon', icon: 'sunny-outline' },
  { key: 'evening', label: 'Evening', icon: 'moon-outline' },
  { key: 'anytime', label: 'Anytime', icon: 'time-outline' },
];
const SLOT_KEYS = new Set(DAY_SLOTS.map((s) => s.key));

/** Hour rows in each part of the day: the full 24 hours. */
export const SLOT_HOURS = {
  morning: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  afternoon: [12, 13, 14, 15, 16],
  evening: [17, 18, 19, 20, 21, 22, 23],
  anytime: [],
};

/** The hour row an item sits on (times outside the rows go to the nearest one). */
export function hourRowOf(item, slot) {
  const hours = SLOT_HOURS[slot] || [];
  const m = timeToMinutes(item?.startTime);
  if (!hours.length || m == null) return null;
  return Math.min(hours[hours.length - 1], Math.max(hours[0], Math.floor(m / 60)));
}

/** 9 -> "09:00", 13 -> "13:00" (24-hour clock). */
export function hourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

/** The part of the day a "HH:mm" time falls in (before 12, before 17, later). */
export function slotForTime(time) {
  const m = timeToMinutes(time);
  if (m == null) return 'anytime';
  if (m < 12 * 60) return 'morning';
  if (m < 17 * 60) return 'afternoon';
  return 'evening';
}

/** An item's part of the day: its saved slot, else from its time (older items). */
export function slotOf(item) {
  return SLOT_KEYS.has(item?.slot) ? item.slot : slotForTime(item?.startTime);
}

/** Order inside a slot: the order you arranged, then time, then when added. */
export function compareInSlot(a, b) {
  return ((a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    || compareByTime(a, b)
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

/** "9:5" / "09:05" -> "09:05" (24-hour clock, as shown in the itinerary). */
export function timeLabel(time) {
  const m = timeToMinutes(time);
  return m == null ? '' : minutesToTime(m);
}

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

const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/** "Monday, 12th January" for a whole-day number. */
export function longDayLabel(day) {
  const d = new Date(day * DAY_MS);
  const n = d.getUTCDate();
  const suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
  return `${LONG_WEEKDAYS[d.getUTCDay()]}, ${n}${suffix} ${LONG_MONTHS[d.getUTCMonth()]}`;
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
  const startOf = (d) => isoToDay(d.startDate);
  const endOf = (d) => isoToDay(d.endDate) ?? isoToDay(d.startDate);
  const covering = sortedDests.filter((d) => startOf(d) != null && day >= startOf(d) && day <= endOf(d));
  if (covering.length === 1) return covering[0];
  if (covering.length > 1) {
    // Travel day (one stop ends, the next starts): the day belongs to the
    // stop you arrive at.
    const arriving = covering.filter((d) => startOf(d) === day);
    const leaving = covering.filter((d) => endOf(d) === day && startOf(d) !== day);
    const pool = arriving.length && leaving.length && arriving.length + leaving.length === covering.length
      ? arriving
      : covering;
    // Otherwise the most specific stop wins: a day trip or side trip inside a
    // longer stay (Nara on the 12th inside Kyoto 9-15) shows as that trip.
    return [...pool].sort((a, b) => (endOf(a) - startOf(a)) - (endOf(b) - startOf(b))
      || startOf(b) - startOf(a))[0];
  }
  const started = sortedDests
    .filter((d) => startOf(d) != null && startOf(d) <= day)
    .sort((a, b) => startOf(b) - startOf(a));
  return started[0] || sortedDests[0];
}

/**
 * On a travel day, the stop you leave (its stay ends that day) when it isn't
 * the day's own stop; else null. Lets the itinerary say "Kyoto → Osaka".
 */
export function leavingStopForDay(day, sortedDests, dayStop) {
  return sortedDests.find((d) => {
    const s = isoToDay(d.startDate);
    const e = isoToDay(d.endDate) ?? s;
    return d.id !== dayStop?.id && s != null && s < day && e === day;
  }) || null;
}

/**
 * Every day of the trip: [{ day, index, stop, fromStop, color }]. `fromStop`
 * is set on a travel day (the stop being left). Empty without dates.
 * Capped at 60 days as a safety net for bad data.
 */
export function tripDays(trip, sortedDests) {
  const start = isoToDay(trip?.startDate);
  const end = isoToDay(trip?.endDate) ?? start;
  if (start == null || end == null || end < start) return [];
  const days = [];
  for (let day = start; day <= Math.min(end, start + 59); day += 1) {
    const stop = stopForDay(day, sortedDests);
    const fromStop = leavingStopForDay(day, sortedDests, stop);
    const stopIndex = Math.max(0, sortedDests.findIndex((d) => d.id === stop?.id));
    days.push({ day, index: days.length, stop, fromStop, color: STOP_COLORS[stopIndex % STOP_COLORS.length] });
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

/** Straight-line distance in km between two { latitude, longitude }, or null. */
export function distanceKm(a, b) {
  const ok = (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
  if (!ok(a) || !ok(b)) return null;
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rough travel between two places: walking up to 1.5 km, else driving.
 * Straight-line distance stretched for real streets; good for "about how
 * far", not for timing a train. Returns { mode, minutes, km } or null.
 */
export function travelBetween(a, b) {
  const km = distanceKm(a, b);
  if (km == null) return null;
  if (km < 0.08) return { mode: 'here', minutes: 0, km };
  if (km <= 1.5) return { mode: 'walk', minutes: Math.max(2, Math.round(((km * 1.25) / 4.8) * 60)), km };
  return { mode: 'drive', minutes: Math.max(5, Math.round(((km * 1.35) / 24) * 60)), km };
}

/** "12 min walk · 0.9 km", "35 min drive · 9 km", "Same spot". */
export function travelLabel(t) {
  if (!t) return '';
  if (t.mode === 'here') return 'Same spot';
  const km = t.km < 10 ? t.km.toFixed(1) : String(Math.round(t.km));
  return `${formatDuration(t.minutes)} ${t.mode === 'walk' ? 'walk' : 'drive'} · ${km} km`;
}
