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
 */

export const OFFLINE_MESSAGE = "You're offline. Connect to the internet and try again.";

/** True for an error from a request that never reached the server. */
export function isNetworkFailure(error) {
  return error?.isNetworkError === true;
}

const originalFetch = global.fetch;

if (originalFetch && !originalFetch.__wayraaOffline) {
  const wrapped = (...args) =>
    originalFetch(...args).catch((error) => {
      if (error?.name === 'AbortError' || error?.isNetworkError) throw error;
      const friendly = new TypeError(OFFLINE_MESSAGE);
      friendly.isNetworkError = true;
      friendly.cause = error;
      throw friendly;
    });
  wrapped.__wayraaOffline = true;
  global.fetch = wrapped;
}
