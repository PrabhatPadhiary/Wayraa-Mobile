import { useEffect, useRef, useState } from 'react';
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';

/**
 * Is the phone online? One listener for the whole app, shared by every screen.
 *
 *  - useIsOffline()          true while there's no internet (for the banner)
 *  - useOnReconnect(fn)      runs fn when the internet comes back, so a
 *                            screen can quietly reload what failed
 *
 * Offline means the OS says there's no connection, or a connection without
 * internet (e.g. Wi-Fi that isn't working). Unknown counts as online, so the
 * banner never shows by mistake. A short wait before saying "offline" avoids
 * a flash while Android checks a new network.
 */

const OFFLINE_AFTER_MS = 1500;

let online = true;     // what the app acts on
let pending = null;    // timer before switching to offline
const listeners = new Set();

function readOnline(state) {
  if (!state) return true;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

function setOnline(value) {
  if (value === online) return;
  online = value;
  listeners.forEach((l) => l(value));
}

function handle(state) {
  const next = readOnline(state);
  clearTimeout(pending);
  pending = null;
  if (next) setOnline(true);
  else pending = setTimeout(() => setOnline(false), OFFLINE_AFTER_MS);
}

let started = false;
function start() {
  if (started) return;
  started = true;
  getNetworkStateAsync().then(handle).catch(() => {});
  addNetworkStateListener(handle);
}

/** True when the phone is known to be offline. */
export function isOffline() {
  return !online;
}

export function useIsOffline() {
  start();
  const [offline, setOffline] = useState(!online);
  useEffect(() => {
    const l = (value) => setOffline(!value);
    listeners.add(l);
    setOffline(!online);
    return () => { listeners.delete(l); };
  }, []);
  return offline;
}

/** Call `fn` each time the internet comes back after being offline. */
export function useOnReconnect(fn) {
  start();
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const l = (value) => { if (value) latest.current?.(); };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
}

/**
 * The hint under a "Couldn't load ..." message: check your connection when
 * the phone is offline, else say our server isn't responding (the phone's
 * internet is fine, so that advice would be wrong). Updates live.
 */
export function useRetryHint() {
  const offline = useIsOffline();
  return offline
    ? 'Check your connection and try again.'
    : 'Wayraa isn\'t responding right now. Try again in a moment.';
}

/**
 * Why a load failed: 'offline' (the phone has no internet), 'server' (our
 * server didn't answer or had an error, e.g. down or restarting), or null
 * (anything else: not found, not allowed, ...).
 */
export function loadFailureKind(error) {
  if (isOffline() || error?.isOffline) return 'offline';
  if (error?.isNetworkError) return 'server';
  const status = Number(error?.status) || Number(/\((5\d\d)\)/.exec(error?.message || '')?.[1]) || 0;
  return status >= 500 ? 'server' : null;
}
