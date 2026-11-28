import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  RefreshControl,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { fallbackGradientFor } from '../components/PlaceTile';
import { avatarColorFor, initialsFor } from '../utils/avatars';
import { timeAgo, tripWhen } from '../components/JournalCard';
import PhotoViewer from '../components/PhotoViewer';
import {
  getJournal,
  toggleLike,
  useLikeState,
  addJournalComment,
  updateJournalComment,
  deleteJournalComment,
  getStoredUser,
  vibeLabel,
  AuthRequiredError,
  REPORT_REASONS,
  reportComment,
} from '../services';
import { showAlert } from '../components/AppDialog';
import { useFocusEffect } from '@react-navigation/native';
import { openStoryMenu, isMyStory, confirmBlock, openTraveller } from '../utils/storyActions';
import { JournalDetailSkeleton } from '../components/skeletons';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';
import RefreshSpinner from '../components/RefreshSpinner';
import useHideTabBarOnScroll from '../hooks/useHideTabBarOnScroll';
import { useOnReconnect, loadFailureKind } from '../hooks/useNetwork';
import { formatMoney } from '../utils/money';

const PHOTO_HEIGHT = 340;
const PLACE_ICONS = { food: 'coffee', stay: 'home', attraction: 'camera', other: 'map-pin' };
const MAX_COMMENT = 1000;
/** A thread with more replies than this starts folded ("View 5 replies"). */
const REPLIES_SHOWN = 2;

const firstNameOf = (name) => (name || '').trim().split(/\s+/)[0] || '';

function Avatar({ name, photoUrl, size = 36 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColorFor(name) }]}>
      {photoUrl
        ? <Image source={{ uri: cloudinarySized(photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} contentFit="cover" />
        : <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initialsFor(name)}</Text>}
    </View>
  );
}

/**
 * One trip journal: photo carousel, the story, trip facts, pro tips, places
 * mentioned, likes and comments. Reading works signed out; liking and
 * commenting ask you to sign in.
 *
 * Comments have one level of replies: replying to a reply adds to the same
 * thread, starting with "@Name". `focusComments` (opened from a like /
 * comment notification) scrolls down to the comments once loaded.
 */
export default function JournalDetailScreen({ navigation, route }) {
  // The bottom bar slides away while scrolling down, back on scroll up.
  const onBarScroll = useHideTabBarOnScroll();
  const { journalId, title: routeTitle, focusComments } = route.params || {};
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [journal, setJournal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [myUserId, setMyUserId] = useState(null);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(null);
  // The heart and count, shared with every other screen (likesStore).
  const likes = useLikeState(journal);
  // Replying: { threadId, name } (the top-level comment it goes under).
  const [replyTo, setReplyTo] = useState(null);
  // Editing one of your comments / replies: { id, original } (the box holds the new text).
  const [editing, setEditing] = useState(null);
  const [openThreads, setOpenThreads] = useState(() => new Set());
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const commentsRef = useRef(null);
  const scrolledToComments = useRef(false);
  const composerRef = useRef(null);
  const scrollY = useRef(0);

  // iPhone: once the keyboard is up, make sure the whole comment box (border
  // and send button, not just the cursor) sits above it, with a small gap.
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const sub = Keyboard.addListener('keyboardDidShow', (e) => {
      if (!inputRef.current?.isFocused?.()) return;
      const keyboardTop = e?.endCoordinates?.screenY;
      if (!keyboardTop) return;
      composerRef.current?.measureInWindow((_x, y, _w, h) => {
        const overlap = y + h + SIZES.spacing_md - keyboardTop;
        if (overlap > 0) scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
      });
    });
    return () => sub.remove();
  }, []);

  // Pull down for new likes and comments.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = () => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  };

  const load = useCallback(async () => {
    setError('');
    try {
      setJournal(await getJournal(journalId));
    } catch (e) {
      // No internet: a clear "offline" state (it reloads when you're back).
      setError(loadFailureKind(e) || e?.message || 'Couldn\'t load this story.');
    } finally {
      setLoading(false);
    }
  }, [journalId]);
  // Back online: reload the story if it couldn't load.
  useOnReconnect(() => { if (!journal) load(); });

  useEffect(() => {
    load();
    getStoredUser().then((u) => setMyUserId(u?.id || null)).catch(() => {});
  }, [load]);

  // Opened from a notification: once it's on screen, go to the comments.
  useEffect(() => {
    if (!focusComments || !journal || scrolledToComments.current) return;
    scrolledToComments.current = true;
    const t = setTimeout(() => {
      try {
        commentsRef.current?.measureLayout(scrollRef.current, (_x, y) => {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - insets.top - SIZES.spacing_xl), animated: true });
        }, () => {});
      } catch { /* layout not ready: stay at the top */ }
    }, 350);
    return () => clearTimeout(t);
  }, [focusComments, journal, insets.top]);

  // Back from editing the story: show the changes.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    load();
  }, [load]));

  const askToSignIn = (what) => showAlert(`Sign in to ${what}`, 'Create an account or sign in to like and comment.', [
    { text: 'Not now', style: 'cancel' },
    { text: 'Sign in', onPress: () => navigation.navigate('Welcome') },
  ]);

  // Shows at once, here and on every other screen (likesStore).
  const handleLike = () => {
    if (!journal) return;
    toggleLike(journal, { onAuthRequired: () => askToSignIn('like stories') });
  };

  const postComment = async () => {
    const body = comment.trim();
    if (!body || posting) return;
    if (editing) {
      saveEdit(body);
      return;
    }
    setPosting(true);
    const threadId = replyTo?.threadId || null;
    try {
      const created = await addJournalComment(journal.id, body, threadId);
      setJournal((j) => ({
        ...j,
        comments: [...(j.comments || []), { parentCommentId: threadId, ...created }],
        commentsCount: (j.commentsCount || 0) + 1,
      }));
      if (threadId) setOpenThreads((open) => new Set(open).add(threadId));
      setComment('');
      setReplyTo(null);
    } catch (e) {
      if (e instanceof AuthRequiredError) askToSignIn('comment');
      else {
        showAlert('Couldn\'t post', e?.message || 'Please try again.');
        // The comment being answered is gone: back to a plain comment, and catch up.
        if (threadId && /deleted/i.test(e?.message || '')) {
          setReplyTo(null);
          load();
        }
      }
    } finally {
      setPosting(false);
    }
  };

  // Save an edit to one of your comments / replies.
  const saveEdit = async (body) => {
    const { id } = editing;
    if (body === editing.original.trim()) {
      cancelEdit();
      return;
    }
    setPosting(true);
    try {
      const saved = await updateJournalComment(journal.id, id, body);
      setJournal((j) => ({
        ...j,
        comments: (j.comments || []).map((x) => (x.id === id
          ? { ...x, body: saved?.body ?? body, updatedAt: saved?.updatedAt ?? new Date().toISOString() }
          : x)),
      }));
      setEditing(null);
      setComment('');
      Keyboard.dismiss();
    } catch (e) {
      if (e instanceof AuthRequiredError) askToSignIn('edit comments');
      else {
        showAlert('Couldn\'t save', e?.message || 'Please try again.');
        if (/deleted/i.test(e?.message || '')) {
          cancelEdit();
          load();
        }
      }
    } finally {
      setPosting(false);
    }
  };

  // "Edit" on your own comment: its text goes into the box below.
  const startEdit = (c) => {
    setReplyTo(null);
    setEditing({ id: c.id, original: c.body || '' });
    setComment(c.body || '');
    if (c.parentCommentId) setOpenThreads((open) => new Set(open).add(c.parentCommentId));
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelEdit = () => {
    setEditing(null);
    setComment('');
  };

  // ⋯ on your own comment: edit or delete it.
  const openMyCommentMenu = (c) => {
    showAlert(c.parentCommentId ? 'Your reply' : 'Your comment', undefined, [
      { text: 'Edit', icon: 'create-outline', onPress: () => startEdit(c) },
      { text: 'Delete', style: 'destructive', icon: 'trash-outline', onPress: () => removeComment(c) },
      { text: 'Cancel', style: 'cancel' },
    ], { sheet: true });
  };

  // "Reply" under a comment. A reply to a reply goes in the same thread and
  // starts with @Name, so it's clear who it answers.
  const startReply = (c) => {
    if (!myUserId) {
      askToSignIn('reply');
      return;
    }
    // Was editing: drop that, the box is for the reply now.
    if (editing) {
      setEditing(null);
      setComment('');
    }
    const name = c.author?.name || 'Traveller';
    const threadId = c.parentCommentId || c.id;
    setReplyTo({ threadId, name });
    setOpenThreads((open) => new Set(open).add(threadId));
    const first = firstNameOf(name);
    const draft = editing ? '' : comment;
    if (c.parentCommentId && c.author?.id !== myUserId && first && !draft.trim()) {
      setComment(`@${first} `);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelReply = () => {
    setReplyTo(null);
    // Drop an @Name we put there that wasn't added to.
    setComment((text) => (/^@\S+\s*$/.test(text) ? '' : text));
  };

  const toggleThread = (id) => setOpenThreads((open) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ⋯ on someone else's comment: block them. Their comments go at once; if
  // they wrote the story, it's closed too.
  // Take comments off screen (with the replies under them), e.g. after a report.
  const dropComments = (shouldDrop) => {
    setJournal((j) => {
      const all = j.comments || [];
      const theirs = all.filter((x) => !shouldDrop(x));
      const kept = new Set(theirs.map((x) => x.id));
      const left = theirs.filter((x) => !x.parentCommentId || kept.has(x.parentCommentId));
      return { ...j, comments: left, commentsCount: Math.max(0, (j.commentsCount || 0) - (all.length - left.length)) };
    });
  };

  const reportFromComment = (c) => {
    showAlert('Why are you reporting this comment?', 'Your report is anonymous.', [
      ...REPORT_REASONS.map((r) => ({
        text: r.label,
        icon: 'flag-outline',
        onPress: async () => {
          try {
            await reportComment(journal.id, c.id, r.key);
            dropComments((x) => x.id === c.id);
            if (replyTo?.threadId === c.id) setReplyTo(null);
            showAlert('Thanks for letting us know', 'We\'ll review this comment within 24 hours. You won\'t see it any more.');
          } catch (e) {
            if (e instanceof AuthRequiredError) navigation.navigate('Welcome');
            else showAlert('Couldn\'t send the report', e?.message || 'Please try again.');
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ], { sheet: true });
  };

  const blockFromComment = (c) => {
    const name = c.author?.name || 'this traveller';
    showAlert(name, undefined, [
      {
        text: 'Report comment',
        icon: 'flag-outline',
        onPress: () => reportFromComment(c),
      },
      {
        text: `Block ${name}`,
        style: 'destructive',
        icon: 'ban-outline',
        onPress: () => confirmBlock({ id: c.author.id, name }, (userId) => {
          if (journal.author?.id === userId) {
            navigation.goBack();
            return;
          }
          setJournal((j) => {
            const all = j.comments || [];
            const theirs = all.filter((x) => x.author?.id !== userId);
            // Replies under their comments go with them.
            const kept = new Set(theirs.map((x) => x.id));
            const left = theirs.filter((x) => !x.parentCommentId || kept.has(x.parentCommentId));
            return { ...j, comments: left, commentsCount: Math.max(0, (j.commentsCount || 0) - (all.length - left.length)) };
          });
          if (replyTo && !(journal.comments || []).some((x) => x.id === replyTo.threadId && x.author?.id !== userId)) {
            setReplyTo(null);
          }
        }),
      },
      { text: 'Cancel', style: 'cancel' },
    ], { sheet: true });
  };

  const removeComment = (c) => {
    const replies = c.parentCommentId ? 0 : (journal.comments || []).filter((x) => x.parentCommentId === c.id).length;
    const note = replies > 0 ? `Its ${replies === 1 ? 'reply' : `${replies} replies`} will be deleted too.` : undefined;
    showAlert('Delete comment?', note, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(c.id);
          try {
            const res = await deleteJournalComment(journal.id, c.id);
            setJournal((j) => {
              const left = (j.comments || []).filter((x) => x.id !== c.id && x.parentCommentId !== c.id);
              const removed = (j.comments || []).length - left.length;
              return {
                ...j,
                comments: left,
                commentsCount: res?.commentsCount ?? Math.max(0, (j.commentsCount || removed) - removed),
              };
            });
            if (replyTo?.threadId === c.id) setReplyTo(null);
            // Was editing it (or a reply under it): nothing left to edit.
            if (editing) {
              const edited = (journal.comments || []).find((x) => x.id === editing.id);
              if (edited && (edited.id === c.id || edited.parentCommentId === c.id)) cancelEdit();
            }
          } catch (e) {
            showAlert('Couldn\'t delete', e?.message || 'Please try again.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const backButton = (
    <TouchableOpacity
      style={[styles.roundButton, { top: insets.top + SIZES.spacing_sm, left: SIZES.spacing_base }]}
      onPress={() => navigation.goBack()}
      accessibilityLabel="Go back"
      hitSlop={8}
    >
      <Feather name="chevron-left" size={22} color={COLORS.white} />
    </TouchableOpacity>
  );

  // Loading: placeholders shaped like the story (cover, title, author, text).
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <JournalDetailSkeleton />
        <TouchableOpacity
          style={[styles.roundButton, styles.roundButtonDark, { top: insets.top + SIZES.spacing_sm, left: SIZES.spacing_base }]}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    );
  }

  if (error || !journal) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="dark-content" />
        {error === 'offline' ? (
          <>
            <Ionicons name="cloud-offline-outline" size={44} color={COLORS.textMuted} />
            <Text style={styles.stateTitle}>You're offline</Text>
            <Text style={styles.stateText}>Connect to the internet to read this story.</Text>
          </>
        ) : error === 'server' ? (
          <>
            <Ionicons name="cloud-offline-outline" size={44} color={COLORS.textMuted} />
            <Text style={styles.stateTitle}>Wayraa isn't responding</Text>
            <Text style={styles.stateText}>Our server is having trouble right now. Try again in a moment.</Text>
          </>
        ) : (
          <>
            <Feather name="book-open" size={40} color={COLORS.textMuted} />
            <Text style={styles.stateTitle}>{error || 'Story not found'}</Text>
          </>
        )}
        <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.roundButton, styles.roundButtonDark, { top: insets.top + SIZES.spacing_sm, left: SIZES.spacing_base }]}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    );
  }

  const photos = journal.photos || [];
  const author = journal.author?.name || 'Traveller';
  const when = tripWhen(journal);
  const facts = [
    when && { icon: 'calendar', text: when },
    journal.travelersCount && { icon: 'users', text: `${journal.travelersCount} ${journal.travelersCount === 1 ? 'traveller' : 'travellers'}` },
    journal.budget && { icon: 'credit-card', text: formatMoney(journal.budget, journal.currency) },
  ].filter(Boolean);
  const paragraphs = (journal.body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // Threads: top-level comments, oldest first, each with its replies. A reply
  // whose comment isn't here (deleted, or by someone you blocked) isn't shown.
  const allComments = journal.comments || [];
  const topLevel = allComments.filter((c) => !c.parentCommentId);
  const repliesOf = new Map();
  for (const c of allComments) {
    if (!c.parentCommentId) continue;
    if (!repliesOf.has(c.parentCommentId)) repliesOf.set(c.parentCommentId, []);
    repliesOf.get(c.parentCommentId).push(c);
  }

  const renderComment = (c, isReply = false) => {
    const mine = myUserId && c.author?.id === myUserId;
    const name = c.author?.name || 'Traveller';
    return (
      <View key={c.id} style={[styles.comment, isReply && styles.commentReply]}>
        <TouchableOpacity
          onPress={() => openTraveller(navigation, c.author)}
          disabled={!c.author?.id}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel={`${name}'s profile`}
        >
          <Avatar name={c.author?.name} photoUrl={c.author?.photoUrl} size={isReply ? 26 : 32} />
        </TouchableOpacity>
        <View style={styles.commentMain}>
          <View style={styles.commentBubble}>
            <View style={styles.commentHead}>
              <Text
                style={styles.commentAuthor}
                numberOfLines={1}
                onPress={c.author?.id ? () => openTraveller(navigation, c.author) : undefined}
                suppressHighlighting
              >
                {name}
              </Text>
              <Text style={styles.commentTime} numberOfLines={1}>
                {timeAgo(c.createdAt)}{c.updatedAt ? ' · edited' : ''}
              </Text>
              {mine && (
                deletingId === c.id ? (
                  <ActivityIndicator size="small" color={COLORS.error} />
                ) : (
                  <TouchableOpacity
                    onPress={() => openMyCommentMenu(c)}
                    hitSlop={8}
                    accessibilityLabel={c.parentCommentId ? 'Edit or delete your reply' : 'Edit or delete your comment'}
                  >
                    <Feather name="more-horizontal" size={15} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )
              )}
              {/* Someone else's comment: block them from here too. */}
              {!mine && !!myUserId && !!c.author?.id && (
                <TouchableOpacity
                  onPress={() => blockFromComment(c)}
                  hitSlop={8}
                  accessibilityLabel={`More options for ${c.author?.name || 'this'} comment`}
                >
                  <Feather name="more-horizontal" size={15} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.commentBody}>{c.body}</Text>
          </View>
          <TouchableOpacity
            style={styles.replyButton}
            onPress={() => startReply(c)}
            hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Reply to ${name}`}
          >
            <Text style={styles.replyButtonText}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, styles.storyContainer]}>
      <StatusBar barStyle="light-content" />
      {/* Keyboard: on iPhone the scroll view makes room itself and scrolls the
          comment box into view (the wrapper would only shrink the screen and
          leave the box under the keyboard); Android keeps the wrapper. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding" enabled={Platform.OS === 'android'}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
          onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; onBarScroll(e); }}
          scrollEventThrottle={16}
          contentContainerStyle={styles.scrollContent}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
              progressViewOffset={insets.top}
            />
          )}
        >
          {/* Photos */}
          <View style={{ height: PHOTO_HEIGHT }}>
            {photos.length > 0 ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              >
                {photos.map((p, i) => (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.95}
                    onPress={() => setViewerIndex(i)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={p.caption || `Photo ${i + 1} from ${journal.destination}`}
                  >
                    <Image
                      source={{ uri: cloudinarySized(p.url, IMAGE_WIDTH.PHOTO) }}
                      style={{ width, height: PHOTO_HEIGHT }}
                      contentFit="cover"
                      transition={200}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <LinearGradient
                colors={fallbackGradientFor(journal.destination)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <LinearGradient
              colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']}
              style={styles.topShade}
              pointerEvents="none"
            />
            {photos.length > 1 && (
              <View style={styles.dots} pointerEvents="none">
                {photos.map((p, i) => <View key={p.id} style={[styles.dot, i === page && styles.dotOn]} />)}
              </View>
            )}
          </View>

          {/* Story */}
          <View style={styles.sheet}>
            <View style={styles.destPill}>
              <Ionicons name="location" size={13} color={COLORS.accent} />
              <Text style={styles.destText} numberOfLines={1}>{journal.destination}</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">{journal.title || routeTitle}</Text>
            {journal.visibility === 'private' && (
              <View style={styles.hiddenNote}>
                <Feather name="eye-off" size={13} color={COLORS.textSecondary} />
                <Text style={styles.hiddenNoteText}>Hidden from Community · only you can see it</Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.authorRow}
              onPress={() => openTraveller(navigation, journal.author)}
              disabled={!journal.author?.id}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel={`${author}'s profile`}
            >
              <Avatar name={author} photoUrl={journal.author?.photoUrl} />
              <View style={styles.flex}>
                <Text style={styles.authorName}>{author}</Text>
                <Text style={styles.posted}>Shared {timeAgo(journal.publishedAt || journal.createdAt)}</Text>
              </View>
              {!!journal.author?.id && <Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
            </TouchableOpacity>

            {facts.length > 0 && (
              <View style={styles.facts}>
                {facts.map((f) => (
                  <View key={f.icon} style={styles.fact}>
                    <Feather name={f.icon} size={14} color={COLORS.primary} />
                    <Text style={styles.factText}>{f.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {journal.vibes?.length > 0 && (
              <View style={styles.vibes}>
                {journal.vibes.map((v) => (
                  <View key={v} style={styles.vibe}><Text style={styles.vibeText}>{vibeLabel(v)}</Text></View>
                ))}
              </View>
            )}

            {paragraphs.map((p, i) => <Text key={i} style={styles.paragraph}>{p}</Text>)}

            {!!journal.proTips && (
              <View style={styles.tips}>
                <View style={styles.tipsHead}>
                  <Feather name="zap" size={16} color="#B7421F" />
                  <Text style={styles.tipsTitle}>Pro tips</Text>
                </View>
                <Text style={styles.tipsText}>{journal.proTips}</Text>
              </View>
            )}

            {journal.places?.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Places mentioned</Text>
                <View style={styles.places}>
                  {journal.places.map((p) => {
                    const tappable = !!p.googlePlaceId;
                    const Wrapper = tappable ? TouchableOpacity : View;
                    return (
                      <Wrapper
                        key={p.id}
                        style={styles.place}
                        {...(tappable ? {
                          onPress: () => navigation.navigate('PlaceDetail', { placeId: p.googlePlaceId, name: p.placeName }),
                          activeOpacity: 0.8,
                          accessibilityRole: 'button',
                        } : {})}
                      >
                        <Feather name={PLACE_ICONS[p.category] || 'map-pin'} size={14} color={COLORS.accentDeep} />
                        <Text style={styles.placeText} numberOfLines={1}>{p.placeName}</Text>
                        {tappable && <Feather name="chevron-right" size={14} color={COLORS.textMuted} />}
                      </Wrapper>
                    );
                  })}
                </View>
              </>
            )}

            {/* Like / comment bar */}
            <View style={styles.actions}>
              {/* Just a heart: outline, red when liked, with the count beside it. */}
              <TouchableOpacity
                style={styles.likeButton}
                onPress={handleLike}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityState={{ selected: !!likes.isLiked }}
                accessibilityLabel={`${likes.isLiked ? 'Unlike' : 'Like'}, ${likes.likesCount || 0} likes`}
              >
                <Ionicons
                  name={likes.isLiked ? 'heart' : 'heart-outline'}
                  size={24}
                  color={likes.isLiked ? '#E05024' : COLORS.textPrimary}
                />
                <Text style={styles.likeText}>{likes.likesCount || 0}</Text>
              </TouchableOpacity>
              <View style={styles.commentCount}>
                <Feather name="message-circle" size={22} color={COLORS.textPrimary} />
                <Text style={styles.commentCountText}>{journal.commentsCount || 0}</Text>
              </View>
            </View>

            {/* Comments, each with its replies underneath (one level). */}
            <View ref={commentsRef} collapsable={false}>
              <Text style={styles.sectionTitle}>Comments</Text>
            </View>
            {topLevel.length === 0 && (
              <Text style={styles.noComments}>No comments yet. Be the first to say something.</Text>
            )}
            {topLevel.map((c) => {
              const replies = repliesOf.get(c.id) || [];
              const folded = replies.length > REPLIES_SHOWN && !openThreads.has(c.id);
              return (
                <View key={c.id}>
                  {renderComment(c)}
                  {replies.length > 0 && (
                    <View style={styles.replies}>
                      {!folded && replies.map((r) => renderComment(r, true))}
                      {replies.length > REPLIES_SHOWN && (
                        <TouchableOpacity
                          style={styles.threadToggle}
                          onPress={() => toggleThread(c.id)}
                          hitSlop={6}
                          accessibilityRole="button"
                        >
                          <View style={styles.threadLine} />
                          <Text style={styles.threadToggleText}>
                            {folded ? `View ${replies.length} replies` : 'Hide replies'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {editing && (
              <View style={styles.replyingBar}>
                <Feather name="edit-2" size={14} color={COLORS.textSecondary} />
                <Text style={styles.replyingText} numberOfLines={1}>
                  <Text style={styles.replyingName}>Editing</Text> your comment
                </Text>
                <TouchableOpacity onPress={cancelEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel editing">
                  <Feather name="x" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            {replyTo && !editing && (
              <View style={styles.replyingBar}>
                <Feather name="corner-down-right" size={14} color={COLORS.textSecondary} />
                <Text style={styles.replyingText} numberOfLines={1}>
                  Replying to <Text style={styles.replyingName}>{replyTo.name}</Text>
                </Text>
                <TouchableOpacity onPress={cancelReply} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel reply">
                  <Feather name="x" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            <View ref={composerRef} style={styles.composer}>
              <TextInput
                ref={inputRef}
                style={styles.composerInput}
                value={comment}
                onChangeText={setComment}
                placeholder={editing ? 'Edit your comment…' : replyTo ? `Reply to ${firstNameOf(replyTo.name) || 'them'}…` : 'Add a comment…'}
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxLength={MAX_COMMENT}
                accessibilityLabel={editing ? 'Edit your comment' : replyTo ? `Reply to ${replyTo.name}` : 'Add a comment'}
              />
              <TouchableOpacity
                style={[styles.send, (!comment.trim() || posting) && styles.sendOff]}
                onPress={postComment}
                disabled={!comment.trim() || posting}
                accessibilityRole="button"
                accessibilityLabel={editing ? 'Save comment' : replyTo ? 'Post reply' : 'Post comment'}
              >
                {posting
                  ? <ActivityIndicator size="small" color={COLORS.white} />
                  : <Feather name={editing ? 'check' : 'send'} size={16} color={COLORS.white} />}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {backButton}
      <TouchableOpacity
        style={[styles.roundButton, { top: insets.top + SIZES.spacing_sm, right: SIZES.spacing_base }]}
        onPress={() => openStoryMenu({
          journal,
          isMine: isMyStory(journal, myUserId),
          signedIn: !!myUserId,
          navigation,
          onChanged: (j) => setJournal((prev) => ({ ...prev, ...j })),
          onDeleted: () => navigation.goBack(),
          onRemoved: () => navigation.goBack(),
          onBlocked: () => navigation.goBack(),
        })}
        accessibilityRole="button"
        accessibilityLabel="More options for this story"
        hitSlop={8}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.white} />
      </TouchableOpacity>
      <PhotoViewer
        visible={viewerIndex !== null}
        photos={photos.map((p) => cloudinarySized(p.url, IMAGE_WIDTH.FULL))}
        initialIndex={viewerIndex || 0}
        onClose={() => setViewerIndex(null)}
      />
      {/* iPhone: the refresh spinner, below the status bar (see RefreshSpinner). */}
      <RefreshSpinner refreshing={refreshing} top={insets.top} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm, // alpine frost (60%)
  },
  flex: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_xl,
  },
  roundButton: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  hiddenNote: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#EEF1F4',
  },
  hiddenNoteText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  roundButtonDark: {
    backgroundColor: COLORS.primary,
  },
  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  dots: {
    position: 'absolute',
    bottom: SIZES.spacing_xl + 4,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotOn: {
    width: 16,
    backgroundColor: COLORS.white,
  },

  // The white sheet runs to the bottom of the screen (and past it when
  // bouncing, see storyContainer): no band of background under the comments.
  scrollContent: {
    flexGrow: 1,
  },
  storyContainer: {
    backgroundColor: COLORS.white,
  },
  sheet: {
    flexGrow: 1,
    paddingBottom: 140,
    marginTop: -SIZES.spacing_lg,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
  },
  destPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  destText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  title: {
    marginTop: SIZES.spacing_sm,
    fontSize: 26,
    lineHeight: 34,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_md,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  authorName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  posted: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_base,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#ECF1F5',
  },
  factText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.primary,
  },
  vibes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: SIZES.spacing_md,
  },
  vibe: {
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: '#F9D3C8',
  },
  vibeText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  paragraph: {
    marginTop: SIZES.spacing_base,
    fontSize: SIZES.base,
    lineHeight: 26,
    fontFamily: 'Poppins_400Regular',
    color: '#2F3437',
  },
  tips: {
    marginTop: SIZES.spacing_lg,
    padding: SIZES.spacing_base,
    borderRadius: SIZES.radius_lg,
    backgroundColor: '#FCEDE8',
    borderLeftWidth: 3,
    borderLeftColor: '#E85C31',
  },
  tipsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tipsTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: '#7C280E',
  },
  tipsText: {
    fontSize: SIZES.md,
    lineHeight: 22,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  sectionTitle: {
    marginTop: SIZES.spacing_xl,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  places: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: '#E9EDF1',
  },
  placeText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_lg,
    marginTop: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Like and comment counts share one plain style.
  likeText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  commentCountText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  noComments: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  comment: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
  },
  commentReply: {
    marginBottom: SIZES.spacing_xs,
  },
  commentMain: {
    flex: 1,
  },
  // Replies sit under their comment, lined up with its bubble.
  replies: {
    marginLeft: 32 + SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
  },
  replyButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: SIZES.spacing_md,
    paddingTop: 4,
    paddingBottom: 2,
  },
  replyButtonText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  threadToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: SIZES.spacing_xs,
  },
  threadLine: {
    width: 22,
    height: 1,
    backgroundColor: COLORS.textMuted,
  },
  threadToggleText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  replyingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_sm,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.cardBackground,
  },
  replyingText: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  replyingName: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  commentBubble: {
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    borderTopLeftRadius: 4,
    backgroundColor: COLORS.cardBackground,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  commentAuthor: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  commentTime: {
    flex: 1,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  commentBody: {
    marginTop: 2,
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_sm,
    padding: 6,
    paddingLeft: SIZES.spacing_base,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    paddingVertical: 8,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accentDeep,
  },
  sendOff: {
    opacity: 0.4,
  },
  stateTitle: {
    marginTop: SIZES.spacing_md,
    textAlign: 'center',
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  stateText: {
    marginTop: SIZES.spacing_xs,
    textAlign: 'center',
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  retry: {
    marginTop: SIZES.spacing_lg,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  retryText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
