import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { EmptyState } from '../components';
import { useStoryPlaces, TravelStyle, WhereBeen, StoryGrid, placeOf } from '../components/TravellerSections';
import RankBadge from '../components/RankBadge';
import { avatarColorFor, initialsFor } from '../utils/avatars';
import { showAlert } from '../components/AppDialog';
import { GridSkeleton } from '../components/skeletons';
import RefreshSpinner from '../components/RefreshSpinner';
import { getTravellerProfile, peekTravellerProfile, getStoredUser, unblockUser } from '../services';
import { openStoryMenu, confirmBlock, reportProfile } from '../utils/storyActions';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';
import useHideTabBarOnScroll from '../hooks/useHideTabBarOnScroll';
import { loadFailureKind } from '../hooks/useNetwork';

const AVATAR = 88;
// The cover photo's height under the status bar.
const COVER_HEIGHT = 190;
const PAD = SIZES.spacing_base;
const GAP = SIZES.spacing_md;

// Why it failed, in words (no internet vs our server down vs anything else).
function failureText(e, fallback) {
  const kind = loadFailureKind(e);
  if (kind === 'offline') return 'You\'re offline. Connect to the internet and try again.';
  if (kind === 'server') return 'Wayraa isn\'t responding right now. Try again in a moment.';
  return e?.message || fallback;
}

/** "Joined Nov 2026" */
function joinedLabel(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `Joined ${d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

/** "Kyoto", "Kyoto and Bali", "Kyoto, Bali and Goa", "Kyoto, Bali and 3 more". */
function listPlaces(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/**
 * Another traveller's public profile, opened by tapping a story's author
 * (Community cards, the story page, comments). Shows only what they chose to
 * publish: name, photo, when they joined, where their stories are from,
 * their traveller rank (level and name) and their public stories as a photo
 * grid. Never trips, email or hidden stories.
 *
 * Params: { userId, name?, photoUrl? } (name / photo show at once while loading).
 * Tapping yourself opens your own Profile instead (see openTraveller).
 * Someone you blocked shows a note with Unblock instead of their stories.
 */
export default function UserProfileScreen({ navigation, route }) {
  const onBarScroll = useHideTabBarOnScroll();
  const { userId, name: initialName, photoUrl: initialPhoto } = route?.params || {};
  // Shown at once: the last copy, or their stories from the Community feed.
  const [profile, setProfile] = useState(() => (userId ? peekTravellerProfile(userId) : null));
  const [loading, setLoading] = useState(() => !profile);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const insets = useSafeAreaInsets();
  const [myUserId, setMyUserId] = useState(null);
  const [activePlace, setActivePlace] = useState(null);

  useEffect(() => {
    getStoredUser().then((u) => setMyUserId(u?.id || null)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      setError('');
      const p = await getTravellerProfile(userId);
      if (!p) setMissing(true);
      else { setMissing(false); setProfile(p); }
    } catch (e) {
      setError(failureText(e, 'Couldn\'t load this profile.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const author = profile?.author;
  const name = author?.name || initialName || 'Traveller';
  const photoUrl = author?.photoUrl ?? initialPhoto;
  const isMe = !!myUserId && myUserId === userId;
  const signedIn = !!myUserId;
  const isBlocked = !!profile?.isBlocked;
  const stories = useMemo(() => (isBlocked ? [] : profile?.stories || []), [profile, isBlocked]);

  // Where they've been, travel style, map points (shared with your own Profile).
  const { places, vibes, mapPlaces } = useStoryPlaces(stories);

  // Behind the header: their latest story photo.
  const coverUrl = useMemo(() => {
    const withPhoto = stories.find((s) => s.photos?.[0]?.url);
    return withPhoto ? cloudinarySized(withPhoto.photos[0].url, IMAGE_WIDTH.COVER) : null;
  }, [stories]);

  const shown = useMemo(
    () => (activePlace ? stories.filter((s) => placeOf(s).toLowerCase() === activePlace) : stories),
    [stories, activePlace]
  );

  const block = () => confirmBlock({ id: userId, name }, () => load());
  const unblock = async () => {
    try {
      await unblockUser(userId);
      setLoading(true);
      load();
    } catch (e) {
      showAlert('Couldn\'t unblock them', e?.message || 'Please try again.');
    }
  };

  const openMenu = () => showAlert(name, undefined, [
    { text: `Report ${name}`, icon: 'flag-outline', onPress: () => reportProfile({ id: userId, name }) },
    isBlocked
      ? { text: `Unblock ${name}`, icon: 'person-add-outline', onPress: unblock }
      : { text: `Block ${name}`, style: 'destructive', icon: 'ban-outline', onPress: block },
    { text: 'Cancel', style: 'cancel' },
  ]);

  const dropStory = (id) => setProfile((p) => (p ? { ...p, storyCount: Math.max(0, (p.storyCount || 1) - 1), stories: p.stories.filter((x) => x.id !== id) } : p));
  const storyMenu = (item) => openStoryMenu({
    journal: item,
    isMine: isMe,
    signedIn,
    navigation,
    onChanged: (j) => {
      // Hidden from Community: it's no longer on the public profile.
      if (j.visibility === 'private') dropStory(j.id);
    },
    onDeleted: () => dropStory(item.id),
    onRemoved: () => dropStory(item.id),
    onBlocked: () => load(),
  });

  const renderTop = () => {
    const stats = [
      { label: (profile?.storyCount ?? 0) === 1 ? 'story' : 'stories', value: profile?.storyCount },
      { label: places.length === 1 ? 'destination' : 'destinations', value: places.length },
      { label: (profile?.photosCount ?? 0) === 1 ? 'photo' : 'photos', value: profile?.photosCount },
    ];
    const meta = [joinedLabel(author?.joinedAt)].filter(Boolean);
    return (
      <>
        {/* Edge to edge behind the status bar: their latest story photo, or
            a plain band when they have none. */}
        <View style={[styles.cover, { height: insets.top + COVER_HEIGHT }]}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.fill} contentFit="cover" cachePolicy="memory-disk" transition={200} />
          ) : (
            <LinearGradient colors={[COLORS.primaryLight, COLORS.primary]} style={styles.fill} />
          )}
          {/* Darker at the top so the status bar and buttons stay readable. */}
          <LinearGradient colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']} style={styles.coverShade} pointerEvents="none" />
        </View>
      <View style={styles.top}>
        <View style={[styles.avatar, styles.avatarOnCover, { backgroundColor: avatarColorFor(name) }]}>
          {photoUrl
            ? (
              <Image
                source={{ uri: cloudinarySized(photoUrl, 300) }}
                // The small one the feed already loaded, until the sharp one is in.
                placeholder={{ uri: cloudinarySized(photoUrl, IMAGE_WIDTH.AVATAR) }}
                placeholderContentFit="cover"
                style={styles.fill}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            )
            : <Text style={styles.avatarText}>{initialsFor(name)}</Text>}
        </View>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        {/* One line: rank badge and name (level only), then when they joined. */}
        {(!!profile?.rank || meta.length > 0) && (
          <View style={styles.metaRow} accessible accessibilityLabel={[profile?.rank?.name, ...meta].filter(Boolean).join(', ')}>
            {!!profile?.rank && (
              <>
                <RankBadge level={profile.rank.level} size={18} />
                <Text style={styles.metaRank}>{profile.rank.name}</Text>
                {meta.length > 0 && <Text style={styles.metaDot}>·</Text>}
              </>
            )}
            {meta.length > 0 && <Text style={styles.metaText}>{meta.join(' · ')}</Text>}
          </View>
        )}
        {!!author?.bio && !isBlocked && <Text style={styles.bio}>{author.bio}</Text>}

        {/* Counts in one quiet line (small numbers don't look empty). */}
        {!!profile && !isBlocked && !profile.partial && (
          <Text style={styles.statsLine} accessibilityLabel={stats.map((x) => `${x.value ?? 0} ${x.label}`).join(', ')}>
            {stats.map((x, i) => (
              <Text key={x.label}>
                {i > 0 && <Text style={styles.statsDot}>  ·  </Text>}
                <Text style={styles.statsValue}>{x.value ?? 0}</Text> {x.label}
              </Text>
            ))}
          </Text>
        )}

        {/* You and them: trips you're both on, places you've both been. */}
        {(profile?.tripsTogether > 0 || profile?.sharedPlaces?.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>You and {name.split(' ')[0]}</Text>
            {profile.tripsTogether > 0 && (
              <View style={styles.commonRow}>
                <Ionicons name="people-outline" size={22} color={COLORS.textPrimary} />
                <Text style={styles.commonText}>
                  {profile.tripsTogether} {profile.tripsTogether === 1 ? 'trip' : 'trips'} together
                </Text>
              </View>
            )}
            {profile.sharedPlaces?.length > 0 && (
              <View style={styles.commonRow}>
                <Ionicons name="location-outline" size={22} color={COLORS.textPrimary} />
                <Text style={styles.commonText}>You've both been to {listPlaces(profile.sharedPlaces)}</Text>
              </View>
            )}
          </View>
        )}

        {vibes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>Travel style</Text>
            <TravelStyle vibes={vibes} />
          </View>
        )}

        {places.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>{isMe ? 'Where I\'ve been' : 'Where they\'ve been'}</Text>
            <WhereBeen places={places} mapPlaces={mapPlaces} activeKey={activePlace} onSelect={setActivePlace} />
          </View>
        )}

      </View>
      </>
    );
  };

  const renderBody = () => {
    if (loading) return <GridSkeleton label="Loading stories" />;
    if (error) {
      return (
        <View style={styles.state}>
          <Feather name="cloud-off" size={36} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (isBlocked) {
      return (
        <View style={styles.state}>
          <Ionicons name="ban-outline" size={36} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>You blocked {name}</Text>
          <Text style={styles.stateText}>Their stories and comments are hidden from you.</Text>
          <TouchableOpacity style={styles.button} onPress={unblock} accessibilityRole="button">
            <Text style={styles.buttonText}>Unblock</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (stories.length === 0) {
      return (
        <EmptyState
          style={styles.emptyState}
          icon="book-outline"
          title="No stories yet"
          text={isMe ? 'Stories you share in Community show up here.' : `${name} hasn't shared a story yet.`}
        />
      );
    }
    return (
      <>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {activePlace ? `Stories from ${places.find((p) => p.key === activePlace)?.label}` : 'Stories'}
          </Text>
          {activePlace ? (
            <TouchableOpacity onPress={() => setActivePlace(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Show all stories">
              <Text style={styles.showAll}>Show all</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.sectionCount}>{shown.length}</Text>
          )}
        </View>
        <View style={styles.gridWrap}>
          <StoryGrid
            stories={shown}
            onOpen={(item) => navigation.navigate('JournalDetail', { journalId: item.id, title: item.title })}
            onLongPress={storyMenu}
          />
        </View>
      </>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        onScroll={onBarScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.white}
            progressViewOffset={insets.top}
          />
        )}
      >
        {missing ? (
          <View style={[styles.state, { paddingTop: insets.top + 80 }]}>
            <Feather name="user-x" size={36} color={COLORS.textMuted} />
            <Text style={styles.stateTitle}>This traveller isn't on Wayraa any more</Text>
          </View>
        ) : (
          <>
            {renderTop()}
            {renderBody()}
          </>
        )}
      </ScrollView>

      <RefreshSpinner refreshing={refreshing} top={insets.top} />
      {/* Back and ⋯ float over the cover photo. */}
      <TouchableOpacity
        style={[styles.roundButton, { top: insets.top + SIZES.spacing_sm, left: SIZES.spacing_base }]}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={22} color={COLORS.white} />
      </TouchableOpacity>
      {signedIn && !isMe && !!profile && (
        <TouchableOpacity
          style={[styles.roundButton, { top: insets.top + SIZES.spacing_sm, right: SIZES.spacing_base }]}
          onPress={openMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`More options for ${name}`}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
  },
  content: {
    paddingBottom: 120,
    flexGrow: 1,
  },
  // RN 0.88: spreading absoluteFillObject does nothing, so spelled out.
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  top: {
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: SIZES.spacing_base,
    paddingHorizontal: PAD,
  },
  // Half over the cover, with a ring so it stands off the photo.
  cover: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: COLORS.primary,
  },
  coverShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  roundButton: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  metaRank: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  metaDot: {
    fontSize: SIZES.md,
    color: COLORS.textMuted,
  },
  metaText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  statsLine: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  statsValue: {
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  statsDot: {
    color: COLORS.textMuted,
  },
  // Travel style: icon + label pairs, left-aligned, wrapping.
  avatarOnCover: {
    marginTop: -(AVATAR / 2),
    borderWidth: 4,
    borderColor: COLORS.backgroundWarm,
  },
  bio: {
    marginTop: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_base,
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  commonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: 6,
  },
  commonText: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 32,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  name: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  // Counts: plain numbers over labels, no box (like a profile header).
  // Left-aligned blocks under the centred header, split by a hairline.
  section: {
    alignSelf: 'stretch',
    marginTop: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  sectionHeading: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
    marginBottom: SIZES.spacing_md,
  },
  // Travel style: one row, an icon over each label.
  // Stamps run to the screen edges while the rest keeps its padding.
  showAll: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  gridWrap: {
    paddingHorizontal: PAD,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
    marginTop: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_md,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  sectionCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  state: {
    alignItems: 'center',
    paddingTop: SIZES.spacing_lg,
    paddingHorizontal: SIZES.spacing_xl,
    gap: SIZES.spacing_sm,
  },
  emptyState: {
    paddingTop: SIZES.spacing_lg,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stateText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  button: {
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_lg,
    paddingVertical: SIZES.spacing_sm,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  buttonText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
