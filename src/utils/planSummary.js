import { DAY_SLOTS, slotOf, compareInSlot, isoToDay } from './itinerary';

const SLOT_ORDER = new Map(DAY_SLOTS.map((s, i) => [s.key, i]));

/** Itinerary order inside a day: morning → afternoon → evening → anytime, then as arranged. */
function compareInDay(a, b) {
  return ((SLOT_ORDER.get(slotOf(a)) ?? 9) - (SLOT_ORDER.get(slotOf(b)) ?? 9)) || compareInSlot(a, b);
}

const stayKey = (item) => item.tripPlaceId || (item.title || '').trim().toLowerCase();

/**
 * "Trip at a glance": the whole plan, simplified, for the Overview.
 *
 *  - stays: where you sleep, grouped by night ({ title, stopName, fromNight,
 *    toNight }). A stay on a day is that night's bed; it carries on to the
 *    next nights that have none of their own at the same stop (you add a
 *    hotel once, on check-in), but not onto the trip's last day (leaving).
 *    On a day with two stays (check-out, check-in), the later one counts.
 *  - days: each day that has something planned besides the stay, in order
 *    ({ day, index, stopName, items: [{ id, title, category }] }).
 *
 * @param {object[]} items  itinerary items (GET /Trips/{id}/itinerary)
 * @param {object[]} days   tripDays(trip, sortedDests): { day, index, stop }
 */
export function summarizePlan(items, days) {
  const byDay = new Map(days.map((d) => [d.day, []]));
  (items || []).forEach((it) => {
    const list = byDay.get(isoToDay(it.scheduledDate));
    if (list) list.push(it);
  });
  byDay.forEach((list) => list.sort(compareInDay));

  // Where you sleep each night.
  const nights = days.map(() => null);
  days.forEach((d, i) => {
    const stays = byDay.get(d.day).filter((it) => it.category === 'stay');
    if (stays.length) {
      nights[i] = { item: stays[stays.length - 1], stopId: d.stop?.id };
      return;
    }
    const prev = nights[i - 1];
    const last = i === days.length - 1;
    if (prev && !last && prev.stopId === d.stop?.id) nights[i] = prev;
  });

  const stays = [];
  nights.forEach((n, i) => {
    if (!n) return;
    const open = stays[stays.length - 1];
    if (open && open.key === stayKey(n.item) && open.toNight === i) {
      open.toNight = i + 1;
      return;
    }
    stays.push({
      key: stayKey(n.item),
      id: n.item.id,
      title: n.item.title,
      stopName: days[i].stop?.name || '',
      fromNight: i + 1,
      toNight: i + 1,
    });
  });

  const planned = days
    .map((d) => ({
      day: d.day,
      index: d.index,
      stopName: d.stop?.name || '',
      items: byDay.get(d.day)
        .filter((it) => it.category !== 'stay')
        .map((it) => ({ id: it.id, title: it.title, category: it.category })),
    }))
    .filter((d) => d.items.length > 0);

  return { stays, days: planned };
}

/** "Night 2" / "Nights 1–3". */
export function nightsLabel(from, to) {
  return from === to ? `Night ${from}` : `Nights ${from}–${to}`;
}
