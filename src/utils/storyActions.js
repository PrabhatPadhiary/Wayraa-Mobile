import { Share } from 'react-native';
import { showAlert } from '../components/AppDialog';
import {
  updateJournal,
  deleteJournal,
  journalShareUrl,
  REPORT_REASONS,
  reportJournal,
  hideJournal,
  unhideJournal,
  blockUser,
} from '../services';

/** Is this story yours? (`myUserId` is the signed-in user's id, from getStoredUser.) */
export function isMyStory(journal, myUserId) {
  return !!myUserId && !!journal?.author?.id && journal.author.id === myUserId;
}

async function shareStory(journal) {
  const url = journalShareUrl(journal.id);
  const where = journal.destination ? ` from ${journal.destination}` : '';
  try {
    await Share.share({
      message: `"${journal.title}": a trip story${where} on Wayraa\n${url}`,
      url, // iOS shows the link preview; Android uses the message
    });
  } catch {
    // Closing the share sheet isn't an error worth showing.
  }
}

/**
 * The ⋯ menu for a story.
 *
 *  - Your own: Edit story · Hide from / Show in Community · Share · Delete
 *  - Someone else's: Share · Not interested · Report story · Block <name>
 *    (the last three need you signed in)
 *
 * @param {object} journal
 * @param {boolean} isMine
 * @param {boolean} [signedIn]
 * @param {object} navigation
 * @param {(journal) => void} [onChanged]  the story after a change (visibility)
 * @param {() => void} [onDeleted]
 * @param {() => void} [onRemoved]         hidden or reported: take it off screen
 * @param {(userId) => void} [onBlocked]   its author blocked: hide all of theirs
 */
export function openStoryMenu({ journal, isMine, signedIn = true, navigation, onChanged, onDeleted, onRemoved, onBlocked }) {
  if (!journal) return;
  const share = { text: 'Share', icon: 'share-outline', onPress: () => shareStory(journal) };
  const cancel = { text: 'Cancel', style: 'cancel' };

  if (!isMine) {
    const needsSignIn = (fn) => () => (signedIn ? fn() : askToSignIn(navigation));
    const author = journal.author?.name || 'this traveller';
    showAlert(journal.title, undefined, [
      share,
      { text: 'Not interested', icon: 'eye-off-outline', onPress: needsSignIn(() => notInterested(journal, onRemoved)) },
      { text: 'Report story', icon: 'flag-outline', onPress: needsSignIn(() => pickReportReason(journal, onRemoved)) },
      ...(journal.author?.id ? [{
        text: `Block ${author}`,
        style: 'destructive',
        icon: 'ban-outline',
        onPress: needsSignIn(() => confirmBlock({ id: journal.author.id, name: author }, onBlocked)),
      }] : []),
      cancel,
    ]);
    return;
  }

  const hidden = journal.visibility === 'private';
  showAlert(journal.title, hidden ? 'Hidden from Community: only you can see it.' : undefined, [
    {
      text: 'Edit story',
      icon: 'create-outline',
      onPress: () => navigation.navigate('WriteJournal', { editJournalId: journal.id }),
    },
    {
      text: hidden ? 'Show in Community' : 'Hide from Community',
      icon: hidden ? 'eye-outline' : 'eye-off-outline',
      onPress: () => setVisibility(journal, hidden ? 'public' : 'private', onChanged),
    },
    share,
    {
      text: 'Delete story',
      style: 'destructive',
      icon: 'trash-outline',
      onPress: () => confirmDelete(journal, onDeleted),
    },
    cancel,
  ]);
}

async function setVisibility(journal, visibility, onChanged) {
  try {
    await updateJournal(journal.id, { visibility });
    onChanged?.({ ...journal, visibility });
    if (visibility === 'private') {
      showAlert('Hidden from Community', 'Only you can see this story now. Find it any time in Profile → Your stories.');
    } else {
      showAlert('Back in Community', 'Everyone can see this story again.');
    }
  } catch (e) {
    showAlert('Couldn\'t change that', e?.message || 'Please try again.');
  }
}

function confirmDelete(journal, onDeleted) {
  showAlert(
    'Delete this story?',
    'Its photos, likes and comments will be removed too. This can\'t be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteJournal(journal.id);
            onDeleted?.();
          } catch (e) {
            showAlert('Couldn\'t delete the story', e?.message || 'Please try again.');
          }
        },
      },
    ],
  );
}

function askToSignIn(navigation) {
  showAlert('Sign in first', 'Create an account or sign in to do that.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Sign in', onPress: () => navigation.navigate('Welcome') },
  ]);
}

async function notInterested(journal, onRemoved) {
  try {
    await hideJournal(journal.id);
    onRemoved?.();
    showAlert('Hidden from your feed', 'You won\'t see this story in Community any more.', [
      { text: 'OK', style: 'cancel' },
      { text: 'Undo', onPress: () => unhideJournal(journal.id).catch(() => {}) },
    ]);
  } catch (e) {
    showAlert('Couldn\'t hide it', e?.message || 'Please try again.');
  }
}

function pickReportReason(journal, onRemoved) {
  showAlert('Why are you reporting this story?', 'Your report is anonymous.', [
    ...REPORT_REASONS.map((r) => ({
      text: r.label,
      icon: 'flag-outline',
      onPress: () => sendReport(journal, r.key, onRemoved),
    })),
    { text: 'Cancel', style: 'cancel' },
  ]);
}

async function sendReport(journal, reason, onRemoved) {
  try {
    await reportJournal(journal.id, reason);
    onRemoved?.();
    showAlert('Thanks for letting us know', 'We\'ll review this story within 24 hours. You won\'t see it in your feed any more.');
  } catch (e) {
    showAlert('Couldn\'t send the report', e?.message || 'Please try again.');
  }
}

/**
 * Block someone, after a confirmation. Also used from a comment.
 *
 * @param {{ id, name }} person
 * @param {(userId) => void} [onBlocked]
 */
export function confirmBlock(person, onBlocked) {
  showAlert(
    `Block ${person.name}?`,
    'You won\'t see their stories or comments. They won\'t be told. You can unblock them any time in Profile → Blocked people.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: async () => {
          try {
            await blockUser(person.id);
            onBlocked?.(person.id);
            showAlert(`${person.name} is blocked`, 'Their stories and comments are hidden from you now.');
          } catch (e) {
            showAlert('Couldn\'t block them', e?.message || 'Please try again.');
          }
        },
      },
    ],
  );
}
