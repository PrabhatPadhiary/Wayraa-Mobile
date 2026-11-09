import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateProfile, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { API_URL, auth } from '../config';
import { getAuthToken, getStoredUser } from './authService';
import { AuthRequiredError } from './errors';

const USER_STORAGE_KEY = 'wayraa_user';

/**
 * The signed-in user's profile and travel stats.
 * Backend: GET /api/users/me
 *
 * @returns {Promise<{ id, name, email, createdAt, stats: {
 *   trips, upcomingTrips, completedTrips, destinations, placesSaved,
 *   favourites, journals } }>}
 */
export async function getMyProfile() {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(`Failed to load your profile (${response.status})`);
  return response.json();
}

/**
 * Change the display name everywhere it's shown: the backend (what other
 * travellers see on shared trips), Firebase (the app's greeting) and the
 * locally stored user.
 * Backend: PUT /api/users/me
 */
export async function updateMyName(name) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/users/me`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) {
    let message = '';
    try { message = (await response.text()).replace(/^"|"$/g, ''); } catch { /* ignore */ }
    throw new Error(message || `Could not update your name (${response.status})`);
  }
  const user = await response.json();

  // Keep Firebase and the stored user in step (best effort: the backend,
  // which other travellers see, is already updated).
  try {
    if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: user.name });
  } catch { /* ignore */ }
  try {
    const stored = (await getStoredUser()) || {};
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ ...stored, ...user }));
  } catch { /* ignore */ }

  return user;
}

/** How the user signs in: 'google', 'password', or both. */
export function signInMethods() {
  const providers = (auth.currentUser?.providerData || []).map((p) => p.providerId);
  return {
    google: providers.includes('google.com'),
    password: providers.includes('password'),
  };
}

/** Email a password-reset link (email/password accounts only). */
export async function sendPasswordReset() {
  const email = auth.currentUser?.email;
  if (!email) throw new Error('No email address on this account.');
  await sendPasswordResetEmail(auth, email);
  return email;
}

/**
 * Permanently delete the account and its data, then sign out locally.
 * Backend: DELETE /api/users/me — hands shared trips to another member,
 * deletes solo trips, journals, favourites, and the Firebase login.
 *
 * @returns {Promise<{ tripsTransferred: number, tripsDeleted: number }>}
 */
export async function deleteMyAccount() {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/users/me`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(`Could not delete your account (${response.status}). Please try again.`);
  const result = await response.json();

  // The server already removed the Firebase login; clear this device too.
  try { await signOut(auth); } catch { /* already signed out */ }
  try { await AsyncStorage.removeItem(USER_STORAGE_KEY); } catch { /* ignore */ }
  return result;
}
