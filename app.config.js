const fs = require('fs');
const path = require('path');

/**
 * Adds build-time settings on top of app.json.
 *
 * Google Maps (Android): the key comes from the GOOGLE_MAPS_ANDROID_API_KEY
 * environment variable (stored in EAS, not in the repo). It's restricted in
 * Google Cloud to Maps SDK for Android and to this app's package + signing
 * certificate. Without it the app still builds; Android maps are just blank.
 *
 * Push notifications (Android): need Firebase's google-services.json for the
 * Android app com.wayraa.mobile. Taken from the GOOGLE_SERVICES_JSON EAS file
 * variable if set, else ./google-services.json in the project. Without it the
 * app still builds; it just can't get a push token on Android.
 *
 * Crash reporting (Sentry): with SENTRY_ORG, SENTRY_PROJECT and
 * SENTRY_AUTH_TOKEN set (EAS environment variables), release builds upload
 * their source maps so crash reports point at the real code. Without them
 * the plugin is left out and nothing is uploaded; the build still works.
 * Reporting itself is switched on by EXPO_PUBLIC_SENTRY_DSN (src/config/sentry.js).
 */
module.exports = ({ config }) => {
  const android = { ...config.android };

  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (mapsKey) {
    android.config = { ...(android.config || {}), googleMaps: { apiKey: mapsKey } };
  }

  const googleServices = process.env.GOOGLE_SERVICES_JSON
    || (fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : null);
  if (googleServices) {
    android.googleServicesFile = googleServices;
  }

  const plugins = [...(config.plugins || [])];
  const { SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN } = process.env;
  if (SENTRY_ORG && SENTRY_PROJECT && SENTRY_AUTH_TOKEN) {
    plugins.push(['@sentry/react-native/expo', {
      url: 'https://sentry.io/',
      organization: SENTRY_ORG,
      project: SENTRY_PROJECT,
    }]);
  }

  return { ...config, android, plugins };
};
