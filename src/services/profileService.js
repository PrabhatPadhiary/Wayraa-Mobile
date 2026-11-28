import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { updateProfile, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { API_URL, auth } from '../config';
import { getAuthToken, getStoredUser, forgetStoredUser } from './authService';
import { AuthRequiredError } from './errors';
import { clearLocalNotifications } from './notificationsService';
import { cachedFetch, peekCache, setCache, clearAllCaches, onClearAllCaches, CacheKeys } from './cache';

const USER_STORAGE_KEY = 'wayraa_user';
const PHOTO_SIZE = 600; // px, square crop from the picker
const PHOTO_QUALITY = 0.85;
const COVER_WIDTH = 1600; // px, wide crop from the picker

// ── Your profile photo, shared by every screen ─────────────────────────────
// undefined = not known yet (screens fall back to the Firebase photo),
// null = no photo (initials), string = photo URL.
let myPhoto;
const photoListeners = new Set();

export function setMyPhoto(url) {
  if (url === myPhoto) return;
  myPhoto = url;
  photoListeners.forEach((l) => l(url));
}

// Log out: back to "not known", so the next account shows its own photo
// (from Firebase/Google until its profile loads), never the last person's.
onClearAllCaches(() => setMyPhoto(undefined));

/**
 * Your current profile photo URL (or null), updating live when it changes.
 * `fallback` is used until the app knows the saved photo (e.g. the Firebase
 * or Google photo).
 */
export function useMyPhoto(fallback) {
  const [photo, setPhoto] = useState(myPhoto);
  useEffect(() => {
    photoListeners.add(setPhoto);
    setPhoto(myPhoto);
    return () => { photoListeners.delete(setPhoto); };
  }, []);
  return photo === undefined ? (fallback || null) : photo;
}

/**
 * App start, after the saved copies are loaded (hydrateCache): your photo
 * from the saved profile, so Home shows it at once instead of waiting for
 * the fresh profile. Returns what's known (undefined if nothing saved).
 */
export function seedMyPhoto() {
  if (myPhoto !== undefined) return myPhoto;
  const saved = peekCache(CacheKeys.profile)?.photoUrl;
  if (saved !== undefined) setMyPhoto(saved || null);
  return myPhoto;
}

async function syncPhotoElsewhere(url) {
  setMyPhoto(url);
  try {
    if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: url });
  } catch { /* ignore */ }
  try {
    const stored = (await getStoredUser()) || {};
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ ...stored, photoUrl: url }));
  } catch { /* ignore */ }
}

/**
 * Upload a new profile photo from a picked image (already square-cropped by
 * the picker). Resized to 600 px JPEG first.
 * Backend: POST /api/users/me/photo (multipart "file")
 * @returns {Promise<string>} the new photo URL
 */
export async function uploadProfilePhoto(asset) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const ctx = ImageManipulator.manipulate(asset.uri);
  if (!asset.width || asset.width > PHOTO_SIZE) ctx.resize({ width: PHOTO_SIZE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });

  const form = new FormData();
  form.append('file', new File(saved.uri), 'profile.jpg');
  const response = await fetch(`${API_URL}/users/me/photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) {
    let message = '';
    try { message = (await response.text()).replace(/^"|"$/g, ''); } catch { /* ignore */ }
    throw new Error(message || `Couldn't upload your photo (${response.status})`);
  }
  const { photoUrl } = await response.json();
  await syncPhotoElsewhere(photoUrl);
  return photoUrl;
}

/** Remove the profile photo (back to initials). Backend: DELETE /api/users/me/photo */
export async function removeProfilePhoto() {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/users/me/photo`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(`Couldn't remove your photo (${response.status})`);
  await syncPhotoElsewhere(null);
}

// Keep the saved profile's cover in step, so the header changes at once.
function setCachedCover(url) {
  const cached = peekCache(CacheKeys.profile);
  if (cached) setCache(CacheKeys.profile, { ...cached, coverPhotoUrl: url });
}

/**
 * Upload a new cover photo (behind your profile header) from a picked image,
 * already cropped wide by the picker. Resized to 1600 px JPEG first.
 * Backend: POST /api/users/me/cover (multipart "file")
 * @returns {Promise<string>} the new cover URL
 */
export async function uploadCoverPhoto(asset) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();

  const ctx = ImageManipulator.manipulate(asset.uri);
  if (!asset.width || asset.width > COVER_WIDTH) ctx.resize({ width: COVER_WIDTH });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG });

  const form = new FormData();
  form.append('file', new File(saved.uri), 'cover.jpg');
  const response = await fetch(`${API_URL}/users/me/cover`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) {
    let message = '';
    try { message = (await response.text()).replace(/^"|"$/g, ''); } catch { /* ignore */ }
    throw new Error(message || `Couldn't upload your cover photo (${response.status})`);
  }
  const { coverPhotoUrl } = await response.json();
  setCachedCover(coverPhotoUrl);
  return coverPhotoUrl;
}

/** Remove the cover photo. Backend: DELETE /api/users/me/cover */
export async function removeCoverPhoto() {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/users/me/cover`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(`Couldn't remove your cover photo (${response.status})`);
  setCachedCover(null);
}

/**
 * The signed-in user's profile and travel stats.
 * Backend: GET /api/users/me
 *
 * @returns {Promise<{ id, name, email, createdAt, stats: {
 *   trips, upcomingTrips, completedTrips, destinations, placesSaved,
 *   favourites, journals } }>}
 */
export function getMyProfile() {
  return cachedFetch(CacheKeys.profile, fetchMyProfile);
}

/** Your profile as last loaded (instant), or undefined. */
export function peekMyProfile() {
  return peekCache(CacheKeys.profile);
}

async function fetchMyProfile() {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) throw new Error(`Failed to load your profile (${response.status})`);
  const me = await response.json();
  // The saved photo wins over the Firebase/Google one once we know it.
  if (me.photoUrl !== undefined) setMyPhoto(me.photoUrl || null);
  return me;
}

/**
 * Change the display name everywhere it's shown: the backend (what other
 * travellers see on shared trips), Firebase (the app's greeting) and the
 * locally stored user.
 * Backend: PUT /api/users/me
 */
/** Longest bio, as the backend allows. */
export const MAX_BIO = 160;

/**
 * Set your bio (shown on your public profile); empty clears it.
 * Backend: PUT /api/users/me/bio
 * @returns {Promise<string|null>} the saved bio
 */
export async function updateMyBio(bio) {
  const token = await getAuthToken();
  if (!token) throw new AuthRequiredError();
  const response = await fetch(`${API_URL}/users/me/bio`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bio }),
  });
  if (response.status === 401) throw new AuthRequiredError();
  if (!response.ok) {
    let message = '';
    try { message = (await response.text()).replace(/^"|"$/g, ''); } catch { /* ignore */ }
    throw new Error(message || `Could not save your bio (${response.status})`);
  }
  const { bio: saved } = await response.json();
  const cached = peekCache(CacheKeys.profile);
  if (cached) setCache(CacheKeys.profile, { ...cached, bio: saved ?? null });
  return saved ?? null;
}

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
  forgetStoredUser();
  const cached = peekCache(CacheKeys.profile);
  if (cached) setCache(CacheKeys.profile, { ...cached, name: user.name });

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
 * Signed out: email a password-reset link to this address (the sign-in screen's
 * "Forgot password?"). Returns a friendly error message, or null when sent.
 * Firebase doesn't say whether the address has an account, so neither do we.
 */
export async function sendPasswordResetTo(email) {
  try {
    await sendPasswordResetEmail(auth, (email || '').trim());
    return null;
  } catch (e) {
    const code = e?.code || '';
    if (code === 'auth/invalid-email' || code === 'auth/missing-email') return 'That email address doesn\'t look right.';
    if (code === 'auth/too-many-requests') return 'Too many tries. Please wait a few minutes and try again.';
    if (code === 'auth/network-request-failed') return 'No internet connection. Check it and try again.';
    if (code === 'auth/user-not-found') return null;   // don't reveal whether an account exists
    return 'Could not send the link. Please try again.';
  }
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
  forgetStoredUser();
  await clearLocalNotifications();
  await clearAllCaches();
  return result;
}
