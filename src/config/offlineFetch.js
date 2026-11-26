/**
 * Friendlier offline errors, for every request in the app.
 *
 * A fetch that never gets an answer rejects (HTTP errors like 404 or 500 come
 * back as normal responses, not rejections). How it's worded depends on the
 * fetch in use and the platform: "Network request failed", "Fetch failed: The
 * Internet connection appears to be offline", "Unable to resolve host"... and
 * screens showed that text as is. Here every such failure (except a request
 * we cancelled on purpose) becomes one clear message. It stays a TypeError and
 * is marked `isNetworkError`, so code can tell it apart from server errors.
 * When the phone itself is online, the wording says Wayraa can't be reached
 * instead (`isOffline` false): the server is down, not the internet.
 */

import { isOffline } from '../hooks/useNetwork';

export const OFFLINE_MESSAGE = "You're offline. Connect to the internet and try again.";
// The phone is online but our server didn't answer (down, restarting).
export const SERVER_MESSAGE = "Can't reach Wayraa right now. Try again in a moment.";

/** True for an error from a request that never reached the server. */
export function isNetworkFailure(error) {
  return error?.isNetworkError === true;
}

const originalFetch = global.fetch;

if (originalFetch && !originalFetch.__wayraaOffline) {
  const wrapped = (...args) =>
    originalFetch(...args).catch((error) => {
      if (error?.name === 'AbortError' || error?.isNetworkError) throw error;
      // Only "offline" when the phone really is; else it's our server.
      const offline = isOffline();
      const friendly = new TypeError(offline ? OFFLINE_MESSAGE : SERVER_MESSAGE);
      friendly.isNetworkError = true;
      friendly.isOffline = offline;
      friendly.cause = error;
      throw friendly;
    });
  wrapped.__wayraaOffline = true;
  global.fetch = wrapped;
}
