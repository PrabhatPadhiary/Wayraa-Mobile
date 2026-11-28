import { useCallback, useEffect, useState } from 'react';
import { getTripById, addPlaceToTrip, removeTripPlace } from '../services';

/**
 * Choosing places for a trip stop (the `pickForTrip` screens: the destination
 * page, its See all / search, and a place's page). Ticks are a draft: nothing
 * is saved, and nobody is notified, until you confirm with `commit()` ("Add 3
 * places"). Then the adds and removes are sent together.
 *
 * The draft is shared by every picking screen for the same stop (one session
 * per trip + stop), so ticks carry from the destination page to See all and
 * back. Confirming is instant: the trip page shows the changes at once and
 * they're saved in the background. It's dropped once committed or discarded, or when no picking screen
 * for that stop is open any more.
 *
 * `picked` is a Map placeId -> trip place id ('' = not saved yet): what the
 * stop will have once you confirm.
 *
 * @param {object} p
 * @param {string} p.tripId
 * @param {string} p.destId      the trip stop
 * @param {Array}  [p.seed]      [placeId, tripPlaceId] pairs already saved
 *                               (from the trip screen), so ticks show at once
 * @returns {{
 *   picked: Map, saved: Map, ready: boolean,     saved: what's on the stop now
 *   toggle: (placeId, makeDto) => void,   makeDto (may be async) builds the add body
 *   refresh: () => Promise<Map>,          reloads what's saved, keeping the draft
 *   addedCount: number, changed: boolean,
 *   saving: boolean,
 *   commit: () => Promise<{ added: number }>,   resolves once sending has
 *     started; the trip page shows the places at once (onTripPicksSaving)
 *   discard: () => void,
 *   pending: () => ({ changed, added, saving }),   the draft right now
 * }}
 */

const sessions = new Map();

// ── Saved in the background ───────────────────────────────────────────────
// Confirming doesn't wait for the server: the trip page hears straight away
// what's being added and removed (and shows it), then again when it's done.
//   { type: 'started', tripId, destId, adds: [dto], removes: [tripPlaceId] }
//   { type: 'finished', tripId, destId, failed, added, error }
const saveListeners = new Set();
export function onTripPicksSaving(fn) {
  saveListeners.add(fn);
  return () => saveListeners.delete(fn);
}
const announce = (event) => saveListeners.forEach((fn) => { try { fn(event); } catch { /* a listener's problem */ } });

function sessionFor(tripId, destId, seed) {
  const key = `${tripId}:${destId}`;
  let s = sessions.get(key);
  if (!s) {
    const saved = new Map(seed || []);
    s = {
      key,
      tripId,
      destId,
      saved, // what the server has
      want: new Map(saved), // what you've ticked
      builders: new Map(), // placeId -> makeDto
      ready: Array.isArray(seed),
      saving: false,
      users: 0,
      listeners: new Set(),
    };
    sessions.set(key, s);
  }
  return s;
}

const emit = (s) => s.listeners.forEach((fn) => fn());
const addsOf = (s) => [...s.want.keys()].filter((id) => !s.saved.has(id));
const removesOf = (s) => [...s.saved.keys()].filter((id) => !s.want.has(id));

export default function useTripPicks({ tripId, destId, seed }) {
  const active = !!(tripId && destId);
  const [session] = useState(() => (active ? sessionFor(tripId, destId, seed) : null));
  const [, setTick] = useState(0);

  // Re-render when the shared draft changes; drop it when the last picking
  // screen for this stop closes (a draft left like that is abandoned).
  useEffect(() => {
    if (!session) return undefined;
    const fn = () => setTick((n) => n + 1);
    session.listeners.add(fn);
    session.users += 1;
    return () => {
      session.listeners.delete(fn);
      session.users -= 1;
      if (session.users <= 0 && sessions.get(session.key) === session) sessions.delete(session.key);
    };
  }, [session]);

  const refresh = useCallback(async () => {
    if (!session) return new Map();
    const full = await getTripById(session.tripId);
    const dest = (full?.destinations || []).find((d) => d.id === session.destId);
    const server = new Map((dest?.places || []).map((pl) => [pl.placeId, pl.id]));
    // Keep the draft on top of what's saved: your pending adds and removes.
    const adds = addsOf(session);
    const removes = new Set(removesOf(session));
    const want = new Map([...server].filter(([id]) => !removes.has(id)));
    adds.forEach((id) => { if (!want.has(id)) want.set(id, server.get(id) ?? ''); });
    session.saved = server;
    session.want = want;
    session.ready = true;
    emit(session);
    return server;
  }, [session]);

  const toggle = useCallback((id, makeDto) => {
    if (!session || !id || session.saving) return;
    if (makeDto) session.builders.set(id, makeDto);
    const next = new Map(session.want);
    if (next.has(id)) next.delete(id);
    else next.set(id, session.saved.get(id) ?? '');
    session.want = next;
    emit(session);
  }, [session]);

  // Save the draft. Resolves as soon as the places are ready to send (the
  // trip page shows them at once); the adds and removes then go to the
  // server together, in the background, and the trip page hears when
  // they're done (and about any that failed).
  const commit = useCallback(async () => {
    if (!session) return { added: 0 };
    const adds = addsOf(session);
    // (A place still being saved from a moment ago has no real id yet.)
    const removes = removesOf(session).map((id) => session.saved.get(id))
      .filter((tripPlaceId) => tripPlaceId && !String(tripPlaceId).startsWith('pending-'));
    if (!adds.length && !removes.length) return { added: 0 };
    session.saving = true;
    emit(session);
    // The add bodies (some look the place up first).
    const built = await Promise.all(adds.map(async (id) => {
      try {
        const build = session.builders.get(id);
        return build ? await build() : null;
      } catch {
        return null;
      }
    }));
    const dtos = built.filter(Boolean);
    const { tripId, destId } = session;
    // The draft is done with: a new visit starts fresh.
    session.saving = false;
    session.saved = new Map(session.want);
    sessions.delete(session.key);
    emit(session);
    announce({ type: 'started', tripId, destId, adds: dtos, removes });

    // In the background, all at once.
    Promise.allSettled([
      ...dtos.map((dto) => addPlaceToTrip(tripId, destId, dto)),
      ...removes.map((tripPlaceId) => removeTripPlace(tripPlaceId)),
    ]).then((results) => {
      const failedResults = results.filter((r) => r.status === 'rejected');
      const failed = failedResults.length + (adds.length - dtos.length);
      const added = results.slice(0, dtos.length).filter((r) => r.status === 'fulfilled').length;
      announce({
        type: 'finished',
        tripId,
        destId,
        failed,
        added,
        error: failedResults[0]?.reason?.message || null,
      });
    });
    return { added: dtos.length };
  }, [session]);

  // The draft right now (not as of the last render): for checks made while
  // leaving a screen, which can run before it has re-rendered.
  const pending = useCallback(() => {
    if (!session || sessions.get(session.key) !== session) return { changed: false, added: 0, saving: false };
    const added = addsOf(session).length;
    return { changed: added > 0 || removesOf(session).length > 0, added, saving: session.saving };
  }, [session]);

  const discard = useCallback(() => {
    if (!session) return;
    session.want = new Map(session.saved);
    sessions.delete(session.key);
    emit(session);
  }, [session]);

  if (!session) {
    return {
      picked: new Map(), saved: new Map(), ready: false, toggle, refresh, addedCount: 0, changed: false, saving: false, commit, discard, pending,
    };
  }
  const addedCount = addsOf(session).length;
  return {
    picked: session.want,
    saved: session.saved,
    ready: session.ready,
    toggle,
    refresh,
    addedCount,
    changed: addedCount > 0 || removesOf(session).length > 0,
    saving: session.saving,
    commit,
    discard,
    pending,
  };
}

/**
 * The confirm button's label: only additions are counted. "Add 3 places",
 * "Save changes" (only places taken off), or "Done" (nothing changed).
 */
export function pickCtaLabel({ addedCount, changed, saving }) {
  if (saving) return addedCount ? 'Adding…' : 'Saving…';
  if (addedCount) return `Add ${addedCount} ${addedCount === 1 ? 'place' : 'places'}`;
  return changed ? 'Save changes' : 'Done';
}
