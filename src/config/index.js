export { app, auth, googleProvider } from './firebase';

// Backend address.
//  - Release builds (the APK / store builds) use production.
//  - Development (Expo Go / dev builds) uses your Mac's backend on the LAN.
//  - EXPO_PUBLIC_API_URL (set in eas.json or the shell) overrides both.
export const PROD_API_URL = 'https://wanderlust-backend-8qn5.onrender.com/api';
const LOCAL_API_URL = 'http://192.168.1.6:5273/api'; // Home wifi (current IP)
//const LOCAL_API_URL = 'http://192.168.1.9:5273/api'; // Home wifi (previous IP)
//const LOCAL_API_URL = 'http://172.20.10.9:5273/api'; // Mobile hotspot
//const LOCAL_API_URL = 'http://localhost:5273/api';

export const API_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? LOCAL_API_URL : PROD_API_URL);


/**
 * Google OAuth Web client ID (from the Firebase project's Google sign-in
 * provider). Used by expo-auth-session to obtain a Google ID token, which is
 * then exchanged into Firebase via signInWithCredential. Web client IDs are
 * safe to ship in client code.
 */
export const GOOGLE_WEB_CLIENT_ID =
  '379966737355-o00i3e5tf9882s41s95r88oplg5547c3.apps.googleusercontent.com';

/**
 * Google OAuth iOS client ID (Application type: iOS in Google Cloud Console,
 * bundle id com.wayraa.mobile). Required by expo-auth-session on iOS.
 * TODO: paste the iOS client ID here.
 */
export const GOOGLE_IOS_CLIENT_ID =
  '411332993861-mjhe3ib8elhk3a9qd81spkpgtvdl1m0m.apps.googleusercontent.com';

/**
 * Google OAuth Android client ID (Application type: Android in Google Cloud
 * Console, package com.wayraa.mobile + the signing key's SHA-1). Required by
 * expo-auth-session on Android. While empty, Google sign-in is disabled on
 * Android (the button explains why) instead of crashing the screen.
 * TODO: paste the Android client ID here.
 */
export const GOOGLE_ANDROID_CLIENT_ID = '';

