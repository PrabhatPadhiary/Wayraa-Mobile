import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { createJournal, updateJournal, uploadJournalPhoto, deleteJournal } from './journalsService';

/**
 * Background posting for trip stories, Instagram style: the composer hands
 * the post over and closes at once; the Community feed shows a progress card
 * that follows this upload until it's live.
 *
 * Steps: create a hidden draft -> upload each photo (resized first) ->
 * publish. A failure keeps what's done, so `retryStoryUpload()` resumes from
 * the failed step; `dismissStoryUpload()` gives up and deletes the draft.
 *
 * One upload at a time. Screens read it with `useStoryUpload()`-style
 * subscription: `subscribeStoryUpload(listener)` returns an unsubscribe.
 *
 * State: { status: 'idle' | 'uploading' | 'error' | 'done',
 *          title, coverUri, total, uploaded, progress (0..1), message,
 *          journalId, visibility, error }
 */

// Photos are resized to this width (keeping the shape) and saved as JPEG so
// each stays well under the backend's 5MB limit and uploads quickly.
const UPLOAD_WIDTH = 1600;
const UPLOAD_QUALITY = 0.8;

const IDLE = { status: 'idle' };
let state = IDLE;
let job = null; // { journal, photos, draftId, uploaded }
const listeners = new Set();

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function getStoryUpload() {
  return state;
}

export function subscribeStoryUpload(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isStoryUploading() {
  return state.status === 'uploading';
}

/** Resize + compress a picked photo; returns a local JPEG uri. */
async function prepareForUpload(asset) {
  const ctx = ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.width > UPLOAD_WIDTH) ctx.resize({ width: UPLOAD_WIDTH });
  const image = await ctx.renderAsync();
  const result = await image.saveAsync({ compress: UPLOAD_QUALITY, format: SaveFormat.JPEG });
  return result.uri;
}

// Draft + each photo + publish, so the bar moves from the very first step.
function progressOf(uploaded, total, published = false) {
  const steps = total + 2;
  const done = (job?.draftId ? 1 : 0) + uploaded + (published ? 1 : 0);
  return Math.min(1, done / steps);
}

async function run() {
  const { journal, photos } = job;
  try {
    if (!job.draftId) {
      set({ message: 'Getting your story ready…', progress: progressOf(0, photos.length) });
      const created = await createJournal({ ...journal, status: 'draft' });
      job.draftId = created.id;
      set({ journalId: created.id, progress: progressOf(0, photos.length) });
    }
    for (let i = job.uploaded; i < photos.length; i += 1) {
      set({ message: `Uploading photo ${i + 1} of ${photos.length}…` });
      const uri = await prepareForUpload(photos[i]);
      await uploadJournalPhoto(job.draftId, uri, i);
      job.uploaded = i + 1;
      set({ uploaded: job.uploaded, progress: progressOf(job.uploaded, photos.length) });
    }
    set({ message: 'Publishing…' });
    await updateJournal(job.draftId, { ...journal, status: 'published' });
    set({ status: 'done', message: 'Posted', progress: 1 });
    job = null;
  } catch (e) {
    set({ status: 'error', error: e?.message || 'Something went wrong.', message: 'Couldn\'t post' });
  }
}

/**
 * Start posting. Returns false if another post is still uploading.
 * @param {object} journal  fields for createJournal (title, body, destination,
 *                          vibes, visibility, …); status is set here
 * @param {Array} photos    picker assets in display order ([0] = cover)
 */
export function startStoryUpload(journal, photos) {
  if (isStoryUploading()) return false;
  job = { journal, photos, draftId: null, uploaded: 0 };
  state = IDLE;
  set({
    status: 'uploading',
    title: journal.title,
    coverUri: photos[0]?.uri || null,
    total: photos.length,
    uploaded: 0,
    progress: 0,
    message: 'Getting your story ready…',
    journalId: null,
    visibility: journal.visibility,
    error: null,
  });
  run();
  return true;
}

/** Try again after an error, resuming from the failed step. */
export function retryStoryUpload() {
  if (!job || state.status !== 'error') return;
  set({ status: 'uploading', error: null });
  run();
}

/** Clear the card. After an error this also deletes the unfinished draft. */
export function dismissStoryUpload() {
  if (state.status === 'uploading') return;
  if (state.status === 'error' && job?.draftId) deleteJournal(job.draftId).catch(() => {});
  job = null;
  state = IDLE;
  listeners.forEach((fn) => fn(state));
}
