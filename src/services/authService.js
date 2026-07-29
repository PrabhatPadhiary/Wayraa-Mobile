import { signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, googleProvider, API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_STORAGE_KEY = 'wayraa_user';

/**
 * Sign in with Google using Firebase, then register/login with backend.
 * On web: uses popup. On mobile: will use expo-auth-session redirect.
 */
export async function signInWithGoogle() {
  try {
    // Firebase Google sign-in (popup works on web)
    const result = await signInWithPopup(auth, googleProvider);
    const token = await result.user.getIdToken();

    // Send token to backend
    const response = await fetch(`${API_URL}/Auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error('Backend login failed');
    }

    const user = await response.json();

    // Store user locally
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));

    return { success: true, user };
  } catch (error) {
    let errorMessage = 'Google sign-in failed';
    if (error.code === 'auth/popup-closed-by-user') {
      errorMessage = 'Sign-in cancelled';
    } else if (error.code === 'auth/popup-blocked') {
      errorMessage = 'Popup was blocked. Please allow popups and try again.';
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Sign out the current user.
 */
export async function logoutUser() {
  try {
    await signOut(auth);
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Logout failed' };
  }
}

/**
 * Get the currently stored user (from local storage).
 */
export async function getStoredUser() {
  try {
    const stored = await AsyncStorage.getItem(USER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Get the current Firebase ID token (for authenticated API calls).
 */
export async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
