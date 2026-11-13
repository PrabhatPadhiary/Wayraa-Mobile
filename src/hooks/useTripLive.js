import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { API_URL } from '../config';
import { getAuthToken, getStoredUser } from '../services/authService';

const RETRY_MS = 10000;

/**
 * Live updates for one trip, over the backend's SignalR hub (/api/hubs/trips).
 *
 * While `active` (the trip screen is focused), joins the trip's group and calls
 * `onChange(change)` whenever someone else changes the trip:
 *   { tripId, section, action, actorId, actorName, itemName,
 *     targetId, targetName, role, targetIsMe }  (target/role: travellers changes)
 *   section: details | stops | spots | itinerary | budget | checklist | travellers | trip
 *   action:  added | removed | updated | joined | deleted
 *
 * Your own changes are skipped (the screen already shows them). After a dropped
 * connection or coming back from the background, `onChange({ section: 'all',
 * missed: true })` asks for a full refresh, since changes may have been missed.
 *
 * `onViewers(viewers)` gets everyone else who has the trip open right now,
 * [{ userId, name, photoUrl }] (you're left out); [] when disconnected.
 */
export default function useTripLive(tripId, active, onChange, onViewers) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onViewersRef = useRef(onViewers);
  onViewersRef.current = onViewers;

  useEffect(() => {
    if (!tripId || !active) return undefined;

    let stopped = false;
    let retryTimer = null;
    let myId = null;
    // Known before connecting, so you never show up in your own "is here" list.
    const meReady = getStoredUser().then((u) => { myId = u?.id || null; }).catch(() => {});

    const connection = new HubConnectionBuilder()
      .withUrl(`${API_URL}/hubs/trips`, {
        // Fetched fresh on every (re)connect, so an expired token is replaced.
        accessTokenFactory: async () => (await getAuthToken()) || '',
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(LogLevel.None)
      .build();

    connection.on('tripChanged', (change) => {
      if (!change || String(change.tripId) !== String(tripId)) return;
      if (myId && change.actorId === myId) return;
      // A role change or removal about you reads "made you a viewer".
      onChangeRef.current?.({ ...change, targetIsMe: !!myId && change.targetId === myId });
    });

    connection.on('viewers', (msg) => {
      if (!msg || String(msg.tripId) !== String(tripId)) return;
      onViewersRef.current?.((msg.viewers || []).filter((v) => !myId || v.userId !== myId));
    });
    // Disconnected: we no longer know who's here.
    connection.onclose(() => onViewersRef.current?.([]));
    connection.onreconnecting(() => onViewersRef.current?.([]));

    const missed = () => onChangeRef.current?.({ section: 'all', missed: true });
    const join = () => connection.invoke('JoinTrip', tripId).catch(() => {});

    const start = async () => {
      clearTimeout(retryTimer);
      if (stopped || connection.state !== HubConnectionState.Disconnected) return false;
      try {
        await meReady;
        await connection.start();
        if (stopped) {
          connection.stop();
          return false;
        }
        await join();
        return true;
      } catch {
        // Offline or the server is waking up: try again shortly.
        if (!stopped) retryTimer = setTimeout(() => start().then((ok) => ok && missed()), RETRY_MS);
        return false;
      }
    };

    // The automatic reconnect lands in a new connection: rejoin and catch up.
    connection.onreconnected(() => {
      join();
      missed();
    });

    start();

    // Phones drop sockets in the background; reconnect and catch up on return.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start().then((ok) => ok && missed());
    });

    return () => {
      stopped = true;
      onViewersRef.current?.([]);
      clearTimeout(retryTimer);
      sub.remove();
      connection.invoke('LeaveTrip', tripId).catch(() => {}).finally(() => connection.stop());
    };
  }, [tripId, active]);
}
