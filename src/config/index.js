export { app, auth, googleProvider } from './firebase';

//export const API_URL = 'http://localhost:5273/api';

export const API_URL = 'http://192.168.1.2:5273/api';

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

