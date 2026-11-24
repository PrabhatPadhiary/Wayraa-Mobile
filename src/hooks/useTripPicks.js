import { useCallback, useRef, useState } from 'react';
import { getTripById, addPlaceToTrip, removeTripPlace, AuthRequiredError } from '../services';
import { showAlert } from '../components/AppDialog';

/**
 * Adding places to a trip stop (the `pickForTrip` screens): which places are
 * on the stop, and a toggle that ticks or unticks at once and saves in the
 * background.
 *
 * `picked` is a Map placeId -> trip place id ('' = on the stop, id not known
 * yet). It shows what you asked for, not what the server has said yet:
 * - A tap flips the place straight away, then the add or remove is sent.
 * - Tapping again while that's on its way is fine: when it finishes, the
 *   place is brought in line with your last tap (one request at a time per
 *   place, so they can't cross).
 * - If saving fails, the place goes back to how it's saved and the error shows.
 *
 * @param {object} p
 * @param {string} p.tripId
 * @param {string} p.destId      the trip stop
 * @param {Array}  [p.seed]      [placeId, tripPlaceId] pairs already known
 *                               (from the trip screen), so ticks show at once
 * @returns {{ picked: Map, ready: boolean, toggle: Function, refresh: Function }}
 *   `ready` is false until we know what's saved (no seed, first load pending).
 *   `toggle(placeId, makeDto)`: `makeDto` (may be async) builds the add body.
 *   `refresh()` reloads from the server (on focus), keeping places mid-save.
 */
export default function useTripPicks({ tripId, destId, seed }) {
  const [picked, setPicked] = useState(() => new Map(seed || []));
  const [ready, setReady] = useState(() => Array.isArray(seed));
  const shown = useRef(picked);                     // what you asked for
  const saved = useRef(new Map(seed || []));        // what the server has
  const busy = useRef(new Set());                   // places with a request on its way
  const builders = useRef(new Map());               // placeId -> makeDto

  const show = (next) => {
    shown.current = next;
    setPicked(next);
  };

  const refresh = useCallback(async () => {
    if (!tripId) return new Map();
    const full = await getTripById(tripId);
    const dest = (full?.destinations || []).find((d) => d.id === destId);
    const map = new Map((dest?.places || []).map((pl) => [pl.placeId, pl.id]));
    saved.current = map;
    // Places still saving keep the state you gave them.
    const next = new Map(map);
    busy.current.forEach((id) => {
      if (shown.current.has(id)) next.set(id, shown.current.get(id));
      else next.delete(id);
    });
    show(next);
    setReady(true);
    return map;
  }, [tripId, destId]);

  // Send requests until the server matches what's shown for this place.
  const sync = useCallback(async (id) => {
    if (busy.current.has(id)) return; // the running loop will catch up
    busy.current.add(id);
    try {
      for (;;) {
        const want = shown.current.has(id);
        if (want === saved.current.has(id)) break;
        if (want) {
          const dto = await builders.current.get(id)();
          const res = await addPlaceToTrip(tripId, destId, dto);
          const tripPlaceId = res?.id || '';
          saved.current = new Map(saved.current).set(id, tripPlaceId);
          if (shown.current.has(id)) show(new Map(shown.current).set(id, tripPlaceId));
        } else {
          // Its id may not be known yet (added elsewhere): look it up.
          let tripPlaceId = saved.current.get(id);
          if (!tripPlaceId) tripPlaceId = (await refresh()).get(id);
          if (tripPlaceId) await removeTripPlace(tripPlaceId);
          const next = new Map(saved.current);
          next.delete(id);
          saved.current = next;
        }
      }
    } catch (e) {
      const next = new Map(shown.current);
      if (saved.current.has(id)) next.set(id, saved.current.get(id));
      else next.delete(id);
      show(next);
      showAlert(
        'Could not update trip',
        e instanceof AuthRequiredError ? 'Sign in to edit your trips.' : (e?.message || 'Please try again.'),
      );
    } finally {
      busy.current.delete(id);
    }
  }, [tripId, destId, refresh]);

  const toggle = useCallback((id, makeDto) => {
    if (!id || !tripId || !destId) return;
    if (makeDto) builders.current.set(id, makeDto);
    const next = new Map(shown.current);
    if (next.has(id)) next.delete(id);
    else next.set(id, saved.current.get(id) ?? '');
    show(next);
    sync(id);
  }, [tripId, destId, sync]);

  return { picked, ready, toggle, refresh };
}
