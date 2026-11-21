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

  return { ...config, android };
};
