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
 * True when a request never got an answer: the phone is offline, or can't
 * reach Firebase or the Wayraa API (wrong API_URL, different Wi-Fi, firewall).
 * Covers Firebase's code and React Native fetch's "Network request failed".
 */
function isNetworkError(error) {
  return (
    error?.code === 'auth/network-request-failed' ||
    (error instanceof TypeError && /network request failed/i.test(error.message || ''))
  );
}

/**
 * Message for Firebase's password-policy error. When the project has a
 * password policy (Firebase console → Authentication → Settings), the error
 * text lists the rules that weren't met in brackets, e.g.
 * "[Password must contain an upper case character, ...]". Show those.
 */
function passwordPolicyMessage(error) {
  const match = /\[([^\]]+)\]/.exec(error?.message || '');
  const rules = match
    ? match[1].split(',').map((r) => r.trim().replace(/^Password must /i, '')).filter(Boolean)
    : [];
  if (rules.length === 0) {
    return 'Password is too weak. Use a mix of upper and lower case letters, numbers and symbols.';
  }
  return `Password must ${rules.join(', ')}.`;
}

/**
 * Logs the real auth error (visible in the Metro terminal) and turns it into a
 * message for the user. `known` maps Firebase error codes to messages.
 */
function describeAuthError(context, error, fallback, known = {}) {
  console.warn(`[auth] ${context} failed:`, error?.code || '', error?.message || error);
  if (known[error?.code]) return known[error.code];
  if (error?.code === 'auth/password-does-not-meet-requirements') {
    return passwordPolicyMessage(error);
  }
  // Our API didn't answer (the Firebase step already worked).
  if (error?.code === 'backend/unreachable') {
    return `Can't reach the Wayraa server (${API_URL}). Check that this phone is on the same Wi-Fi as the server.`;
  }
  // Firebase itself couldn't be reached.
  if (isNetworkError(error)) {
    return 'No internet connection. Please check your connection and try again.';
  }
  if (error?.code === 'backend/rejected') {
    return `The Wayraa server couldn't sign you in (${error.status}). Please try again.`;
  }
  return fallback;
}

/**
 * Check if an email already exists in Firebase.
 * Returns: { exists: boolean, methods: string[] }
 */
export async function checkEmailExists(email) {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email);
    return { exists: methods.length > 0, methods };
  } catch (error) {
    // `error` is a user-facing message: invalid email, or a network problem.
    return {
      exists: false,
      methods: [],
      error: describeAuthError('email check', error, 'Please enter a valid email address.', {
        'auth/invalid-email': 'Please enter a valid email address.',
      }),
    };
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
    return {
      success: false,
      error: describeAuthError('email sign-in', error, 'Sign-in failed', {
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-credential': 'Incorrect password. Please try again.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
        'auth/user-not-found': 'No account found with this email.',
      }),
    };
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
    return {
      success: false,
      error: describeAuthError('sign-up', error, 'Account creation failed', {
        'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
        'auth/weak-password': 'Password should be at least 6 characters.',
        'auth/invalid-email': 'Please enter a valid email address.',
      }),
    };
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
  let response;
  try {
    response = await fetch(`${API_URL}/Auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch (e) {
    // No response at all: the API isn't reachable from this device.
    const err = new Error(`Backend unreachable at ${API_URL}: ${e?.message || e}`);
    err.code = 'backend/unreachable';
    throw err;
  }

  if (!response.ok) {
    const err = new Error(`Backend login failed (${response.status})`);
    err.code = 'backend/rejected';
    err.status = response.status;
    throw err;
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
    return {
      success: false,
      error: describeAuthError('Google sign-in', error, 'Google sign-in failed. Please try again.'),
    };
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
