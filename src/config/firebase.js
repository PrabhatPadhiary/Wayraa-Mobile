import { Platform } from 'react-native';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
  GoogleAuthProvider,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
 
/**
 * Firebase configuration - same project as the web app.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyASmRKKGVmkcV91-EM2yvosFKq1C1kgX-w',
  authDomain: 'wanderlust-35cd9.firebaseapp.com',
  projectId: 'wanderlust-35cd9',
  storageBucket: 'wanderlust-35cd9.firebasestorage.app',
  messagingSenderId: '379966737355',
  appId: '1:379966737355:web:ac5ec8dbe0474db1a8c44e',
};
 
// Initialize Firebase (avoid re-initialization)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
 
// Web uses getAuth; React Native (iOS/Android) must use initializeAuth with
// AsyncStorage persistence, otherwise Firebase throws
// "Component auth has not been registered yet" and warns about memory-only
// persistence. Guard against re-initialization on Fast Refresh.
let auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    // Already initialized (e.g. after a Fast Refresh) — reuse it.
    auth = getAuth(app);
  }
}
 
const googleProvider = new GoogleAuthProvider();
 
export { app, auth, googleProvider };