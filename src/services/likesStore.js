import { useSyncExternalStore } from 'react';

/**
 * One shared answer to "have I liked this story, and how many likes has it",
 * for every screen (Home, Community, a story, My stories, a place's stories,
 * the preview sheet). So:
 *
 *  - a tap shows at once, everywhere (the server catches up behind it);
 *  - quick repeated taps end on what you last chose (the server's like is a
 *    toggle, so it's toggled until it matches);
 *  - a failed tap goes back to how it was;
 *  - whatever the server last said wins, unless you're mid-tap.
 *
 * Screens keep their own lists; they show each story through likeStateOf()
 * (or the hooks below), which lays the latest known like state over it.
 *
 * The server call is passed in (setLikeSender) to keep this file free of
 * network code and import cycles.
 */

const entries = new Map(); // journalId -> { isLiked, likesCount }
const desired = new Map(); // journalId -> what you last chose, while syncing
const syncing = new Set();
const listeners = new Set();
let version = 0;
let signedIn = false;
let sendToggle = null; // (journalId) => Promise<{ liked, likesCount }>

function emit() {
  version += 1;
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLikeSender(fn) {
  sendToggle = fn;
}

/** A story with the latest known like state laid over it. */
export function likeStateOf(journal) {
  if (!journal?.id) return journal;
  const e = entries.get(journal.id);
  const isLiked = signedIn ? (e ? e.isLiked : !!journal.isLiked) : false;
  const likesCount = e ? e.likesCount : (journal.likesCount || 0);
  if (isLiked === journal.isLiked && likesCount === journal.likesCount) return journal;
  return { ...journal, isLiked, likesCount };
}

/**
 * Stories just loaded from the server: remember their like state.
 * @param {boolean} withAccount  the request was signed in (a guest's
 *   request says "not liked" for everything, so only its counts are used)
 */
export function seedLikes(list, withAccount) {
  let changed = false;
  for (const j of list || []) {
    if (!j?.id || desired.has(j.id)) continue; // mid-tap: yours wins
    const prev = entries.get(j.id);
    const isLiked = withAccount ? !!j.isLiked : (prev?.isLiked ?? false);
    const likesCount = j.likesCount || 0;
    if (prev?.isLiked === isLiked && prev?.likesCount === likesCount) continue;
    entries.set(j.id, { isLiked, likesCount });
    changed = true;
  }
  if (changed) emit();
}

/**
 * Signed in as someone else, or signed out: forget the old account's likes
 * (signed out, nothing shows as liked).
 */
export function resetLikes(nowSignedIn) {
  signedIn = !!nowSignedIn;
  entries.clear();
  desired.clear();
  emit();
}

export function setLikesSignedIn(value) {
  if (signedIn === !!value) return;
  signedIn = !!value;
  emit();
}

/**
 * Like (`liked` true) or unlike a story. Shows at once; the server follows.
 * @param {{ onAuthRequired?: () => void }} [options]
 */
export function setLiked(journal, liked, options = {}) {
  if (!journal?.id) return;
  if (!signedIn) {
    options.onAuthRequired?.();
    return;
  }
  const current = likeStateOf(journal);
  if (current.isLiked === liked) return;
  if (!desired.has(journal.id)) {
    // How it was before this round of taps (to go back to if it fails).
    before.set(journal.id, { isLiked: current.isLiked, likesCount: current.likesCount || 0 });
  }
  entries.set(journal.id, {
    isLiked: liked,
    likesCount: Math.max(0, (current.likesCount || 0) + (liked ? 1 : -1)),
  });
  desired.set(journal.id, liked);
  emit();
  sync(journal.id, options);
}

export function toggleLike(journal, options) {
  const current = likeStateOf(journal);
  setLiked(journal, !current?.isLiked, options);
}

const before = new Map(); // journalId -> state before the taps being synced

async function sync(id, options) {
  if (syncing.has(id) || !sendToggle) return;
  syncing.add(id);
  try {
    let res = null;
    // The server toggles: toggle until it's where you last left it.
    for (let tries = 0; tries < 4; tries += 1) {
      res = await sendToggle(id);
      if (!desired.has(id) || res?.liked === desired.get(id)) break;
    }
    if (desired.has(id)) {
      desired.delete(id);
      before.delete(id);
      if (res && typeof res.liked === 'boolean') {
        entries.set(id, { isLiked: res.liked, likesCount: Math.max(0, res.likesCount ?? 0) });
      }
      emit();
    }
  } catch (e) {
    const was = before.get(id);
    desired.delete(id);
    before.delete(id);
    if (was) entries.set(id, was);
    emit();
    if (e?.name === 'AuthRequiredError' || e?.constructor?.name === 'AuthRequiredError') {
      options.onAuthRequired?.();
    }
  } finally {
    syncing.delete(id);
  }
}

/** One story, kept up to date with likes from anywhere. */
export function useLikeState(journal) {
  useSyncExternalStore(subscribe, () => version);
  return likeStateOf(journal);
}

/** Re-render on any like change; returns likeStateOf to apply to a list. */
export function useLikes() {
  useSyncExternalStore(subscribe, () => version);
  return likeStateOf;
}
