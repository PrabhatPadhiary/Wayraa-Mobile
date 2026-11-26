// Learn more: https://docs.expo.dev/guides/customizing-metro/
// Sentry's version of Expo's default config: the same, plus Debug IDs on the
// bundle and source maps so crash reports show the real file and line.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

// RN 0.88 (SDK 58) exposes subpaths like `react-native/asset-registry` ONLY
// through the "exports" field, so package-exports resolution must stay ENABLED
// (disabling it breaks @expo-google-fonts .ttf imports).
config.resolver.unstable_enablePackageExports = true;

// ...but with exports enabled, Metro resolves the Firebase JS SDK's ESM Auth
// build, which fails to register under Hermes ("Component auth has not been
// registered yet"). Force Firebase's "browser"/CJS condition so Metro picks the
// correct React Native-friendly bundle. See expo/expo#36588.
config.resolver.unstable_conditionNames = ['require', 'react-native', 'browser', 'default'];

// Allow .cjs modules (Firebase ships its RN build as CommonJS).
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;
