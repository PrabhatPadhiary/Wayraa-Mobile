import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, auth } from '../config';

/**
 * Notifications.
 *
 * Push (from the server, see the backend's TripNotifier): someone joins your
 * trip, adds places, adds an expense or changes the itinerary. The phone
 * registers its Expo push token with the backend after sign-in, and removes
 * it on log out.
 *
 * Local (scheduled on the phone): "Your trip starts tomorrow", 9am the day
 * before each upcoming trip, kept in step with your trips each time they load.
 *
 * Push needs a real build (dev build, APK or store build): Expo Go on Android
 * can't get a push token. Local reminders work everywhere except the web.
 */

/** Android channel; the backend sends to the same id (PushService.TripUpdatesChannel). */
export const TRIP_UPDATES_CHANNEL = 'trip-updates';

const TOKEN_STORAGE_KEY = 'wayraa_push_token';
const REMINDER_PREFIX = 'trip-reminder-';
const REMINDER_HOUR = 9; // local time, the day before the trip starts

const isWeb = Platform.OS === 'web';
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

/**
 * How notifications show while the app is open. `getOpenTripId` returns the
 * trip on screen: its updates already show live there, so no banner for them.
 */
export function setupNotificationHandler(getOpenTripId) {
  if (isWeb) return;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification?.request?.content?.data || {};
      const onThatTrip = !!data.tripId && data.type !== 'reminder' && getOpenTripId?.() === data.tripId;
      return {
        shouldShowBanner: !onThatTrip,
        shouldShowList: true,
        shouldPlaySound: !onThatTrip,
        shouldSetBadge: false,
      };
    },
  });
}

/** Android: the channel must exist before asking permission (Android 13+) and before a push arrives. */
async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(TRIP_UPDATES_CHANNEL, {
    name: 'Trip updates',
    description: 'When friends join, add places, expenses or plans to your trips, announcements, and trip reminders.',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#2B3F51',
  });
}

/** Notifications allowed on this phone (iOS "provisional" counts). */
function isAllowed(settings) {
  return !!settings?.granted
    || settings?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

/** 'granted' | 'denied' | 'undetermined' (asked and refused = denied). */
export async function getNotificationPermission() {
  if (isWeb) return 'denied';
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (isAllowed(settings)) return 'granted';
    return settings.canAskAgain === false || settings.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'undetermined';
  }
}

// One registration at a time, and the backend told about a token once per
// app run (per account): every start refreshes it, that's enough.
let registering = null;
let registeredFor = null; // `${uid}|${token}` sent this run

/**
 * After sign-in: ask for permission (once; the OS remembers the answer), then
 * send this phone's push token to the backend. Safe to call often: calls
 * while one is running share it, and an unchanged token isn't re-sent.
 * Never throws. Returns true when the phone is registered for push.
 */
export function registerForPushNotifications() {
  if (!registering) {
    registering = doRegister().finally(() => { registering = null; });
  }
  return registering;
}

async function doRegister() {
  // Guests browsing without an account: nothing to notify about, so don't ask.
  if (isWeb || !auth.currentUser) return false;
  try {
    await ensureChannel();

    let settings = await Notifications.getPermissionsAsync();
    if (!isAllowed(settings) && settings.canAskAgain !== false) {
      settings = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
    }
    if (!isAllowed(settings)) return false;

    // Permission is enough for local reminders; push needs a real build.
    if (isExpoGo && Platform.OS === 'android') return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!token) return false;
    const key = `${auth.currentUser?.uid}|${token}`;
    if (registeredFor === key) return true;
    await sendTokenToBackend(token);
    registeredFor = key;
    return true;
  } catch (e) {
    // Typically: no google-services.json in this Android build yet, an iPhone
    // build without push set up, or offline. The app works without push.
    console.warn('[notifications] push registration skipped:', e?.message || e);
    return false;
  }
}

async function sendTokenToBackend(token) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return;
  const response = await fetch(`${API_URL}/notifications/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
  if (!response.ok) throw new Error(`Registering for notifications failed (${response.status})`);
  await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
}

/**
 * The phone's token can change (rare): register the new one. Returns an
 * unsubscribe.
 *
 * Careful: asking Expo for the token (getExpoPushTokenAsync) also fires this
 * listener with the current token, so re-registering on every event loops
 * forever. Only a token different from the one already seen counts.
 */
let lastDeviceToken = null;
export function watchPushToken() {
  if (isWeb) return () => {};
  const sub = Notifications.addPushTokenListener((deviceToken) => {
    const value = typeof deviceToken?.data === 'string' ? deviceToken.data : JSON.stringify(deviceToken?.data ?? null);
    if (lastDeviceToken === null || value === lastDeviceToken) {
      lastDeviceToken = value; // first sighting, or our own token request
      return;
    }
    lastDeviceToken = value;
    registeredFor = null;
    if (auth.currentUser) registerForPushNotifications();
  });
  return () => sub.remove();
}

/**
 * Log out: this phone stops getting the account's notifications, and its
 * trip reminders go. Call while still signed in (the backend needs to know
 * whose phone it is). Never throws.
 */
export async function unregisterPushNotifications() {
  if (isWeb) return;
  await cancelTripReminders();
  registeredFor = null;
  try {
    const token = await AsyncStorage.getItem(TOKEN_STORAGE_KEY);
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
    const idToken = await auth.currentUser?.getIdToken();
    if (!token || !idToken) return;
    await fetch(`${API_URL}/notifications/token`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ token }),
    });
  } catch (e) {
    console.warn('[notifications] unregister failed:', e?.message || e);
  }
}

/** Account deleted (the server already dropped its phones): clear this phone's side. */
export async function clearLocalNotifications() {
  if (isWeb) return;
  await cancelTripReminders();
  registeredFor = null;
  try { await AsyncStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* ignore */ }
}

// ── Trip reminders (local) ────────────────────────────────────────────────

/** 9am local, the day before the trip's start (trip dates are UTC midnight). */
function reminderTime(startDate) {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() - 1, REMINDER_HOUR, 0, 0);
}

let syncing = Promise.resolve();

/**
 * Keep "starts tomorrow" reminders in step with your trips: one per upcoming
 * trip, moved when its dates change, removed when it's gone. Runs after each
 * trips load (getMyTrips). Never throws.
 */
export function syncTripReminders(trips) {
  if (isWeb || !Array.isArray(trips)) return syncing;
  // One at a time: several screens load trips at once.
  syncing = syncing.then(() => doSyncTripReminders(trips)).catch((e) => {
    console.warn('[notifications] reminder sync failed:', e?.message || e);
  });
  return syncing;
}

async function doSyncTripReminders(trips) {
  if (!isAllowed(await Notifications.getPermissionsAsync())) return;
  await ensureChannel();

  const now = Date.now();
  const wanted = new Map();
  for (const trip of trips) {
    if (!trip?.id || !trip.startDate) continue;
    const at = reminderTime(trip.startDate);
    if (!at || at.getTime() <= now + 60 * 1000) continue;
    wanted.set(`${REMINDER_PREFIX}${trip.id}`, { trip, at });
  }

  const scheduled = (await Notifications.getAllScheduledNotificationsAsync())
    .filter((n) => n?.identifier?.startsWith(REMINDER_PREFIX));
  const scheduledById = new Map(scheduled.map((n) => [n.identifier, n]));

  // Gone, or moved: cancel.
  for (const n of scheduled) {
    const want = wanted.get(n.identifier);
    const same = want
      && n.content?.data?.at === want.at.getTime()
      && n.content?.data?.tripName === want.trip.name;
    if (!same) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
      scheduledById.delete(n.identifier);
    }
  }

  for (const [identifier, { trip, at }] of wanted) {
    if (scheduledById.has(identifier)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Your trip starts tomorrow',
        body: `${trip.name || 'Your trip'} begins tomorrow. Check your plans and packing list.`,
        data: { type: 'reminder', tripId: trip.id, tripName: trip.name, at: at.getTime() },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: TRIP_UPDATES_CHANNEL,
      },
    });
  }
}

export async function cancelTripReminders() {
  if (isWeb) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(scheduled
      .filter((n) => n?.identifier?.startsWith(REMINDER_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch {
    // Nothing scheduled, or not supported here.
  }
}

// ── Opening a notification ────────────────────────────────────────────────

/**
 * Calls `onOpen(data)` when a notification is tapped, including the one that
 * launched the app. Returns an unsubscribe.
 */
export function onNotificationOpened(onOpen) {
  if (isWeb) return () => {};
  let lastId = null;
  const handle = (response) => {
    const id = response?.notification?.request?.identifier;
    if (!response || id === lastId) return;
    lastId = id;
    // Handled: don't open it again on the next start.
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
    const data = response.notification?.request?.content?.data;
    if (data?.tripId) onOpen(data);
  };
  Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
