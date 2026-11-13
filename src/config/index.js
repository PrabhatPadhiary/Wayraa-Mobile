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
 * Google OAuth iOS client ID, bundle id com.wayraa.mobile. Required by
 * expo-auth-session on iOS. It must belong to the Firebase project
 * (wanderlust-35cd9, number 379966737355): Firebase only accepts Google
 * sign-ins from client IDs in its own project. Created via Firebase →
 * Project settings → Add app → iOS (CLIENT_ID in GoogleService-Info.plist).
 * Google sign-in can't work in Expo Go on iOS (wrong bundle id): test it in a
 * dev or release build.
 */
export const GOOGLE_IOS_CLIENT_ID =
  '379966737355-vpod3ufd9l0do0mjt5m2cggvn0jqv6r9.apps.googleusercontent.com';

/**
 * Google OAuth Android client ID (package com.wayraa.mobile + the EAS signing
 * key's SHA-1), in the Firebase project. Android signs in with Google's native
 * account picker, which finds this client by package + signing key; the app
 * code doesn't send it, but while it's empty Google sign-in is switched off on
 * Android (the button explains why). A new signing key needs its SHA-1 added.
 */
export const GOOGLE_ANDROID_CLIENT_ID =
  '379966737355-ovvppnbneavunaa62kdvhcrhjehc45i6.apps.googleusercontent.com';

