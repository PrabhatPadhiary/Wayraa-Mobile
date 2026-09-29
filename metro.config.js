// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase JS SDK (v10/v11) ships its React Native build via CommonJS ".cjs"
// files. Metro's newer ES Module ("package exports") resolution picks the wrong
// Auth bundle, which causes:
//   - "Component auth has not been registered yet"
//   - the AsyncStorage persistence warning
// Disabling package exports resolution makes Metro load the correct RN bundle.
// See https://github.com/expo/expo/issues/36588
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
