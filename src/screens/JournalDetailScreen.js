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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { fallbackGradientFor } from '../components/PlaceTile';
import { avatarColorFor, initialsFor } from '../components/TripStackCard';
import { timeAgo, tripWhen } from '../components/JournalCard';
import PhotoViewer from '../components/PhotoViewer';
import {
  getJournal,
  toggleJournalLike,
  addJournalComment,
  deleteJournalComment,
  getStoredUser,
  vibeLabel,
  AuthRequiredError,
} from '../services';
import { showAlert } from '../components/AppDialog';
import { useFocusEffect } from '@react-navigation/native';
import { openStoryMenu, isMyStory, confirmBlock } from '../utils/storyActions';
import WayraaLoader from '../components/WayraaLoader';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

const PHOTO_HEIGHT = 340;
const PLACE_ICONS = { food: 'coffee', stay: 'home', attraction: 'camera', other: 'map-pin' };
const MAX_COMMENT = 1000;

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
 */
export default function JournalDetailScreen({ navigation, route }) {
  const { journalId, title: routeTitle } = route.params || {};
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
  const likeBusy = useRef(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setJournal(await getJournal(journalId));
    } catch (e) {
      setError(e?.message || 'Couldn\'t load this story.');
    } finally {
      setLoading(false);
    }
  }, [journalId]);

  useEffect(() => {
    load();
    getStoredUser().then((u) => setMyUserId(u?.id || null)).catch(() => {});
  }, [load]);

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

  const handleLike = async () => {
    if (!journal || likeBusy.current) return;
    likeBusy.current = true;
    const was = journal;
    setJournal({ ...journal, isLiked: !journal.isLiked, likesCount: Math.max(0, journal.likesCount + (journal.isLiked ? -1 : 1)) });
    try {
      const res = await toggleJournalLike(journal.id);
      setJournal((j) => ({ ...j, isLiked: res.liked, likesCount: res.likesCount }));
    } catch (e) {
      setJournal(was);
      if (e instanceof AuthRequiredError) askToSignIn('like stories');
    } finally {
      likeBusy.current = false;
    }
  };

  const postComment = async () => {
    const body = comment.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const created = await addJournalComment(journal.id, body);
      setJournal((j) => ({
        ...j,
        comments: [...(j.comments || []), created],
        commentsCount: (j.commentsCount || 0) + 1,
      }));
      setComment('');
    } catch (e) {
      if (e instanceof AuthRequiredError) askToSignIn('comment');
      else showAlert('Couldn\'t post', e?.message || 'Please try again.');
    } finally {
      setPosting(false);
    }
  };

  // ⋯ on someone else's comment: block them. Their comments go at once; if
  // they wrote the story, it's closed too.
  const blockFromComment = (c) => {
    const name = c.author?.name || 'this traveller';
    showAlert(name, undefined, [
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
            const left = (j.comments || []).filter((x) => x.author?.id !== userId);
            return { ...j, comments: left, commentsCount: Math.max(0, (j.commentsCount || 0) - ((j.comments || []).length - left.length)) };
          });
        }),
      },
      { text: 'Cancel', style: 'cancel' },
    ], { sheet: true });
  };

  const removeComment = (c) => {
    showAlert('Delete comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(c.id);
          try {
            await deleteJournalComment(journal.id, c.id);
            setJournal((j) => ({
              ...j,
              comments: (j.comments || []).filter((x) => x.id !== c.id),
              commentsCount: Math.max(0, (j.commentsCount || 1) - 1),
            }));
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

  if (loading || error || !journal) {
    return (
      <View style={[styles.container, styles.center]}>
        <StatusBar barStyle="dark-content" />
        {loading ? (
          <WayraaLoader size={88} />
        ) : (
          <>
            <Feather name="book-open" size={40} color={COLORS.textMuted} />
            <Text style={styles.stateTitle}>{error || 'Story not found'}</Text>
            <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </>
        )}
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
    journal.budget && { icon: 'credit-card', text: `${journal.currency ? `${journal.currency} ` : ''}${Math.round(journal.budget).toLocaleString()}` },
  ].filter(Boolean);
  const paragraphs = (journal.body || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 140 }}>
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

            <View style={styles.authorRow}>
              <Avatar name={author} photoUrl={journal.author?.photoUrl} />
              <View style={styles.flex}>
                <Text style={styles.authorName}>{author}</Text>
                <Text style={styles.posted}>Shared {timeAgo(journal.publishedAt || journal.createdAt)}</Text>
              </View>
            </View>

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
                  <Feather name="zap" size={16} color="#b7791f" />
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
                accessibilityState={{ selected: !!journal.isLiked }}
                accessibilityLabel={`${journal.isLiked ? 'Unlike' : 'Like'}, ${journal.likesCount || 0} likes`}
              >
                <Ionicons
                  name={journal.isLiked ? 'heart' : 'heart-outline'}
                  size={24}
                  color={journal.isLiked ? '#e0245e' : COLORS.textPrimary}
                />
                <Text style={styles.likeText}>{journal.likesCount || 0}</Text>
              </TouchableOpacity>
              <View style={styles.commentCount}>
                <Feather name="message-circle" size={22} color={COLORS.textPrimary} />
                <Text style={styles.commentCountText}>{journal.commentsCount || 0}</Text>
              </View>
            </View>

            {/* Comments */}
            <Text style={styles.sectionTitle}>Comments</Text>
            {(journal.comments || []).length === 0 && (
              <Text style={styles.noComments}>No comments yet. Be the first to say something.</Text>
            )}
            {(journal.comments || []).map((c) => {
              const mine = myUserId && c.author?.id === myUserId;
              return (
                <View key={c.id} style={styles.comment}>
                  <Avatar name={c.author?.name} photoUrl={c.author?.photoUrl} size={32} />
                  <View style={styles.commentBubble}>
                    <View style={styles.commentHead}>
                      <Text style={styles.commentAuthor} numberOfLines={1}>{c.author?.name || 'Traveller'}</Text>
                      <Text style={styles.commentTime}>{timeAgo(c.createdAt)}</Text>
                      {mine && (
                        deletingId === c.id ? (
                          <ActivityIndicator size="small" color={COLORS.error} />
                        ) : (
                          <TouchableOpacity onPress={() => removeComment(c)} hitSlop={8} accessibilityLabel="Delete your comment">
                            <Feather name="trash-2" size={14} color={COLORS.textMuted} />
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
                </View>
              );
            })}

            <View style={styles.composer}>
              <TextInput
                style={styles.composerInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Add a comment…"
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxLength={MAX_COMMENT}
                accessibilityLabel="Add a comment"
              />
              <TouchableOpacity
                style={[styles.send, (!comment.trim() || posting) && styles.sendOff]}
                onPress={postComment}
                disabled={!comment.trim() || posting}
                accessibilityRole="button"
                accessibilityLabel="Post comment"
              >
                {posting ? <ActivityIndicator size="small" color={COLORS.white} /> : <Feather name="send" size={16} color={COLORS.white} />}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
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
    backgroundColor: '#eef1f4',
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

  sheet: {
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
    backgroundColor: '#fff1e8',
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
    backgroundColor: '#e6f4fb',
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
    borderColor: '#ffd9c2',
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
    color: '#333',
  },
  tips: {
    marginTop: SIZES.spacing_lg,
    padding: SIZES.spacing_base,
    borderRadius: SIZES.radius_lg,
    backgroundColor: '#fff8e6',
    borderLeftWidth: 3,
    borderLeftColor: '#f0b429',
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
    color: '#8a5a00',
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
    borderColor: '#e9edf1',
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
    marginBottom: SIZES.spacing_md,
  },
  commentBubble: {
    flex: 1,
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
