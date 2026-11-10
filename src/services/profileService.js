import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { updateProfile, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { API_URL, auth } from '../config';
import { getAuthToken, getStoredUser } from './authService';
import { AuthRequiredError } from './errors';

const USER_STORAGE_KEY = 'wayraa_user';
const PHOTO_SIZE = 600; // px, square crop from the picker
const PHOTO_QUALITY = 0.85;

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
