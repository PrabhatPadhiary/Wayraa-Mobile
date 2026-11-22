import AsyncStorage from '@react-native-async-storage/async-storage';

// "Explore as a guest" was chosen: next start opens Home, not Welcome.
// Cleared on log out (after a deliberate log out, Welcome is the right start).
const GUEST_KEY = 'wayraa_browsing_as_guest';

export async function isBrowsingAsGuest() {
  try {
    return (await AsyncStorage.getItem(GUEST_KEY)) === '1';
  } catch {
    return false;
  }
}

export function forgetGuestBrowsing() {
  return AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
}

/**
 * Where the sign-in screens (Welcome, Login, SignUp) go when they're done.
 *
 * Opened from inside the app (a guest tapped "Sign in" on My trips, a story,
 * Favourites...): back to exactly where they were, now signed in. The tabs
 * underneath are kept, so they land on the same tab and screen, not Home.
 *
 * Opened at app start (nothing underneath): into the app.
 */
function appIsUnderneath(navigation) {
  const routes = navigation.getState?.()?.routes || [];
  return routes.some((r) => r.name === 'Main');
}

/** Signed in (or account created). */
export function finishSignIn(navigation, user) {
  if (appIsUnderneath(navigation)) navigation.popTo('Main');
  else navigation.replace('Main', { user });
}

/** "Explore as a guest" / not now. */
export function continueAsGuest(navigation) {
  AsyncStorage.setItem(GUEST_KEY, '1').catch(() => {});
  if (appIsUnderneath(navigation)) navigation.popTo('Main');
  else navigation.replace('Main', { user: null });
}
