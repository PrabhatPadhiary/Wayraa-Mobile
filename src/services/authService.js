import { Platform } from 'react-native';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  updateProfile,
  signOut,
  GoogleAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { auth, googleProvider, API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_STORAGE_KEY = 'wayraa_user';

/**
 * Check if an email already exists in Firebase.
 * Returns: { exists: boolean, methods: string[] }
 */
export async function checkEmailExists(email) {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    return { exists: methods.length > 0, methods };
  } catch (error) {
    // Firebase may return an error for invalid emails
    return { exists: false, methods: [], error: error.message };
  }
}

/**
 * Sign in with existing email and password.
 */
export async function signInWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const token = await result.user.getIdToken();
    return await loginWithBackend(token);
  } catch (error) {
    let errorMessage = 'Sign-in failed';
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      errorMessage = 'Incorrect password. Please try again.';
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage = 'Too many attempts. Please try again later.';
    } else if (error.code === 'auth/user-not-found') {
      errorMessage = 'No account found with this email.';
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Create a new account with email and password.
 */
export async function createAccountWithEmail(email, password, name) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);

    // Update the display name in Firebase
    if (name) {
      await updateProfile(result.user, { displayName: name });
    }

    const token = await result.user.getIdToken(true); // force refresh to get updated claims
    return await loginWithBackend(token);
  } catch (error) {
    let errorMessage = 'Account creation failed';
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = 'An account with this email already exists.';
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password should be at least 6 characters.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Please enter a valid email address.';
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Sign in with Google using Firebase, then register/login with backend.
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const token = await result.user.getIdToken();
    return await loginWithBackend(token);
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
 * Send Firebase token to backend and store user.
 */
async function loginWithBackend(token) {
  const response = await fetch(`${API_URL}/Auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error('Backend login failed');
  }

  const user = await response.json();
  await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  return { success: true, user };
}

/**
 * Complete a native Google sign-in.
 *
 * The Google ID token is obtained by expo-auth-session (see useGoogleAuth),
 * exchanged into a Firebase session with signInWithCredential, then sent to the
 * backend via the same /Auth/login flow the web app uses.
 *
 * @param {string} idToken - Google OpenID Connect ID token
 */
export async function completeGoogleSignIn(idToken) {
  try {
    if (!idToken) {
      return { success: false, error: 'Google sign-in failed' };
    }
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    const firebaseToken = await result.user.getIdToken();
    return await loginWithBackend(firebaseToken);
  } catch (error) {
    return { success: false, error: 'Google sign-in failed. Please try again.' };
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
