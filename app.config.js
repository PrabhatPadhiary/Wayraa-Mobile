/**
 * Adds build-time settings on top of app.json.
 *
 * Google Maps (Android): the key comes from the GOOGLE_MAPS_ANDROID_API_KEY
 * environment variable (stored in EAS, not in the repo). It's restricted in
 * Google Cloud to Maps SDK for Android and to this app's package + signing
 * certificate. Without it the app still builds; Android maps are just blank.
 */
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!mapsKey) return config;
  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android?.config || {}),
        googleMaps: { apiKey: mapsKey },
      },
    },
  };
};
