import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ProfileSceneBack, ProfileSceneFront, SCENE_W, SCENE_H } from '../components/ProfileScene';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { SignInPrompt } from '../components';
import { avatarColorFor, initialsFor } from '../utils/avatars';
import useAuth from '../hooks/useAuth';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import {
  getMyProfile,
  getTravellerProfile,
  peekTravellerProfile,
  updateMyName,
  updateMyBio,
  MAX_BIO,
  uploadProfilePhoto,
  removeProfilePhoto,
  useMyPhoto,
  getMyTrips,
  AuthRequiredError,
  peekMyProfile,
  peekMyTrips,
} from '../services';
import { pickNextTrip, formatDateRange, daysUntil } from '../utils/tripDates';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { showAlert } from '../components/AppDialog';
import RefreshSpinner from '../components/RefreshSpinner';
import RankBadge from '../components/RankBadge';
import JourneyCard from '../components/JourneyCard';
import RankSheet from '../components/RankSheet';
import RankCelebration from '../components/RankCelebration';
import useRankUp from '../hooks/useRankUp';
import { rankFromProfile } from '../utils/ranks';
import useHideTabBarOnScroll from '../hooks/useHideTabBarOnScroll';
import { useOnReconnect } from '../hooks/useNetwork';
import { useStoryPlaces, TravelStyle, WhereBeen, StoryGrid, placeOf } from '../components/TravellerSections';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MAX_NAME = 60;
// Stories shown on your profile (the rest are in "Your stories").
const PROFILE_STORIES = 6;
const AVATAR_SIZE = 96;
// How much of the profile drawing shows (scene units, of SCENE_H = 340).
const SCENE_SHOWN = 262;

/** One row in a settings-style group. */
function Row({ icon, label, value, onPress, danger, last }) {
  const content = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Feather name={icon} size={17} color={danger ? COLORS.error : COLORS.primary} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={1}>{label}</Text>
      {!!value && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
      {onPress && !danger && <Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </TouchableOpacity>
  );
}

/**
 * ProfileScreen — opened from the avatar on Home.
 *
 * About you: header with photo/initials, name (editable), email and
 * "exploring since"; travel stats from GET /api/users/me; the next trip; your
 * stuff (my trips, join a trip, favourites, your stories). Account security,
 * privacy, legal pages, log out and delete account are in Settings.
 */
export default function ProfileScreen({ navigation }) {
  // The bottom bar slides away while scrolling down, back on scroll up.
  const onBarScroll = useHideTabBarOnScroll();
  const insets = useSafeAreaInsets();
  const { user: firebaseUser, isAuthenticated, isAuthReady } = useAuth();
  // On both platforms: Android is drawn edge to edge, so its window isn't
  // resized for the keyboard and the sheet has to make room itself.
  const keyboardHeight = useKeyboardHeight();

  // Profile and next trip as last loaded, at once; fresh ones load behind them.
  const [profile, setProfile] = useState(() => peekMyProfile() || null);
  const [nextTrip, setNextTrip] = useState(() => pickNextTrip(peekMyTrips() || []));
  const [loading, setLoading] = useState(() => !peekMyProfile());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState('');

  // Your public stories (what others see on your profile): travel style,
  // where you've been, and the stories grid. The last copy shows at once.
  const [publicMe, setPublicMe] = useState(() => {
    const id = peekMyProfile()?.id;
    return id ? peekTravellerProfile(id) : null;
  });
  const [activePlace, setActivePlace] = useState(null);
  const myStories = useMemo(() => publicMe?.stories || [], [publicMe]);
  const { places, vibes, mapPlaces } = useStoryPlaces(myStories);
  const shownStories = useMemo(
    () => (activePlace ? myStories.filter((x) => placeOf(x).toLowerCase() === activePlace) : myStories).slice(0, PROFILE_STORIES),
    [myStories, activePlace]
  );

  const load = useCallback(async () => {
    setError('');
    try {
      const [me, trips] = await Promise.all([
        getMyProfile(),
        getMyTrips().catch(() => []),
      ]);
      setProfile(me);
      setNextTrip(pickNextTrip(trips));
      if (me?.id) getTravellerProfile(me.id).then((p) => { if (p) setPublicMe(p); }).catch(() => {});
    } catch (e) {
      if (e instanceof AuthRequiredError) setNeedsAuth(true);
      else setError('Couldn\'t load your profile. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  // Back online: reload what may have failed.
  useOnReconnect(load);

  // Reload on focus so stats reflect trips/favourites changed elsewhere.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady) return;
      if (!isAuthenticated) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }
      load();
    }, [isAuthReady, isAuthenticated, load])
  );

  const name = profile?.name || firebaseUser?.displayName || 'Traveller';
  // The header scene is as wide as the screen; its height follows the scene.
  const { width: windowWidth } = useWindowDimensions();
  const sceneHeight = (windowWidth * SCENE_H) / SCENE_W;
  // Only the top of the drawing shows (sky, mountains, windmill, houses); the
  // details sheet then rises over its bottom edge.
  const bannerHeight = (windowWidth * SCENE_SHOWN) / SCENE_W;
  const email = profile?.email || firebaseUser?.email || '';
  const myPhoto = useMyPhoto(firebaseUser?.photoURL);
  const photo = !photoFailed ? myPhoto : null;
  const since = profile?.createdAt ? new Date(profile.createdAt) : null;
  const stats = profile?.stats || {};
  // Traveller rank (points from the server; see utils/ranks).
  const rank = rankFromProfile(profile);
  const [rankSheet, setRankSheet] = useState(null); // a rank's level, 'how', or null
  const [celebrateLevel, dismissCelebration] = useRankUp(profile, firebaseUser?.uid);
  // Scroll to "Your journey" (from the rank chip or the celebration).
  const scrollRef = useRef(null);
  // Compact bar (like the trip and place pages): once the round back button
  // nears the status bar, a white bar with its own back button fades in.
  const scrollY = useRef(new Animated.Value(0)).current;
  const BAR_SHOW_AT = SIZES.spacing_sm + 38; // the round button's bottom edge
  const [barOn, setBarOn] = useState(false);
  // Spread over ~110pt of scrolling, so it eases in rather than snapping on,
  // with a small drop into place.
  const BAR_FADE = [BAR_SHOW_AT - 40, BAR_SHOW_AT + 70];
  const barOpacity = scrollY.interpolate({
    inputRange: BAR_FADE,
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const barShift = scrollY.interpolate({
    inputRange: BAR_FADE,
    outputRange: [-10, 0],
    extrapolate: 'clamp',
  });
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (e) => {
      onBarScroll(e);
      const on = e.nativeEvent.contentOffset.y > BAR_SHOW_AT + 15; // tappable once mostly in
      setBarOn((prev) => (prev === on ? prev : on));
    },
  });
  const sheetY = useRef(0);   // the sheet, in the page
  const journeyY = useRef(0); // the journey card, in the sheet
  const scrollToJourney = () => {
    const y = sheetY.current + journeyY.current - insets.top - SIZES.spacing_base;
    scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
  };

  // ── Profile photo ──
  const pickPhoto = async () => {
    // The system photo picker needs no permission (Android and iOS), so we don't ask for photo access.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, // square crop
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets?.length) return;
    setPhotoBusy(true);
    try {
      await uploadProfilePhoto(result.assets[0]);
      setPhotoFailed(false);
    } catch (e) {
      showAlert('Couldn\'t update your photo', e?.message || 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    try {
      await removeProfilePhoto();
    } catch (e) {
      showAlert('Couldn\'t remove your photo', e?.message || 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const onAvatarPress = () => {
    if (photoBusy) return;
    if (!photo) {
      pickPhoto();
      return;
    }
    showAlert('Profile photo', undefined, [
      { text: 'Choose a new photo', onPress: pickPhoto },
      { text: 'Remove photo', style: 'destructive', onPress: removePhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openNameEditor = () => {
    setNameDraft(name === 'Traveller' ? '' : name);
    setNameError('');
    setEditingName(true);
  };

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError('Please enter your name.');
      return;
    }
    setSavingName(true);
    setNameError('');
    try {
      const updated = await updateMyName(trimmed);
      setProfile((p) => ({ ...(p || {}), name: updated.name }));
      setEditingName(false);
    } catch (e) {
      setNameError(e?.message || 'Could not save. Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  const openBioEditor = () => {
    setBioDraft(profile?.bio || '');
    setBioError('');
    setEditingBio(true);
  };

  const saveBio = async () => {
    setSavingBio(true);
    setBioError('');
    try {
      const saved = await updateMyBio(bioDraft.trim());
      setProfile((p) => ({ ...(p || {}), bio: saved }));
      setEditingBio(false);
    } catch (e) {
      setBioError(e?.message || 'Could not save. Please try again.');
    } finally {
      setSavingBio(false);
    }
  };

  const openTrip = (trip) => navigation.navigate('MyTrips', {
    screen: 'TripDetail',
    params: { tripId: trip.id, tripName: trip.name },
    initial: false, // keep My Trips underneath, so back lands there
  });

  if (needsAuth) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <SignInPrompt
          icon="person-circle-outline"
          title="Your traveller profile"
          subtitle="Sign in to see your trips, stats and account settings."
          onSignIn={() => navigation.navigate('Welcome')}
        />
      </View>
    );
  }

  const statTiles = [
    { key: 'trips', icon: 'map', value: stats.trips, label: stats.trips === 1 ? 'Trip' : 'Trips' },
    { key: 'dest', icon: 'navigation', value: stats.destinations, label: stats.destinations === 1 ? 'Destination' : 'Destinations' },
    { key: 'spots', icon: 'bookmark', value: stats.placesSaved, label: 'Saved spots' },
    { key: 'favs', icon: 'heart', value: stats.favourites, label: stats.favourites === 1 ? 'Favourite' : 'Favourites' },
  ];

  const nextUntil = nextTrip ? daysUntil(nextTrip.startDate) : null;
  const nextLabel = nextTrip
    ? ((nextTrip.status || '').toLowerCase() === 'in_progress' || (nextUntil !== null && nextUntil <= 0)
      ? 'Happening now'
      : nextUntil !== null
        ? `In ${nextUntil} ${nextUntil === 1 ? 'day' : 'days'}`
        : 'Dates not set')
    : null;
  const nextCover = nextTrip
    ? placePhotoUrl(nextTrip.primaryPlaceId, 400) || normalizePhotoUrl(nextTrip.coverPhotoUrl, 400)
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
            progressViewOffset={insets.top}
          />
        )}
      >
        {/* Header: a drawn countryside, as a banner (its bottom is cropped). */}
        <View style={[styles.header, { height: bannerHeight }]}>
          <View style={{ height: sceneHeight }}>
            <ProfileSceneBack width={windowWidth} />
            <ProfileSceneFront width={windowWidth} />
          </View>

          <TouchableOpacity
            style={[styles.backButton, { top: insets.top + SIZES.spacing_sm }]}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-left" size={22} color={COLORS.primary} />
          </TouchableOpacity>


        </View>

        {/* The rest of the page, as a sheet with rounded top corners rising
            over the banner (like the story and trip screens). */}
        <View style={styles.pageSheet} onLayout={(e) => { sheetY.current = e.nativeEvent.layout.y; }}>
        {/* You: your photo, big and centred on the sheet's top edge, and your
            name, rank, email and "exploring since" centred below it. */}
        <View style={styles.meRow}>
          <TouchableOpacity
            style={styles.avatarRing}
            onPress={onAvatarPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={photo ? 'Change or remove your profile photo' : 'Add a profile photo'}
          >
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatar} cachePolicy="memory-disk" onError={() => setPhotoFailed(true)} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarColorFor(name) }]}>
                <Text style={styles.avatarText}>{initialsFor(name)}</Text>
              </View>
            )}
            {photoBusy && (
              <View style={styles.avatarBusy}>
                <ActivityIndicator color={COLORS.white} />
              </View>
            )}
            {/* Camera badge: this is where you change the photo. */}
            <View style={styles.avatarBadge}>
              <Feather name="camera" size={13} color={COLORS.primary} />
            </View>
          </TouchableOpacity>
          <View style={styles.meText}>
            <TouchableOpacity
              style={styles.nameRow}
              onPress={openNameEditor}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${name}. Edit name`}
            >
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Feather name="edit-2" size={13} color={COLORS.textMuted} />
            </TouchableOpacity>
            {/* Your rank: tap to see your journey. */}
            {!!rank && (
              <TouchableOpacity
                style={styles.rankChip}
                onPress={scrollToJourney}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Your rank: ${rank.look.name}. See your journey`}
              >
                <RankBadge level={rank.level} size={22} />
                <Text style={styles.rankChipText}>{rank.look.name}</Text>
              </TouchableOpacity>
            )}
            {!!email && <Text style={styles.email} numberOfLines={1}>{email}</Text>}
            {!!since && (
              <Text style={styles.sinceText} numberOfLines={1}>
                Exploring since {MONTHS[since.getMonth()]} {since.getFullYear()}
              </Text>
            )}
            {/* Bio: shown on your public profile. Tap to write or edit it. */}
            {!!profile && (
              <TouchableOpacity
                style={styles.bioRow}
                onPress={openBioEditor}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={profile.bio ? `Your bio: ${profile.bio}. Edit bio` : 'Add a bio'}
              >
                {profile.bio ? (
                  <Text style={styles.bioText}>{profile.bio}</Text>
                ) : (
                  <Text style={styles.bioAdd}>Add a bio</Text>
                )}
                <Feather name="edit-2" size={12} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.section}>
        <Text style={styles.sectionTitle}>Travel stats</Text>
        <View style={styles.statsCard}>
          {loading ? (
            <ActivityIndicator color={COLORS.accent} style={styles.statsLoader} />
          ) : (
            statTiles.map((t) => (
              <View
                key={t.key}
                style={styles.stat}
                accessible
                accessibilityLabel={`${t.value ?? 0} ${t.label}`}
              >
                <Feather name={t.icon} size={16} color={COLORS.accent} />
                <Text style={styles.statValue}>{t.value ?? 0}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>{t.label}</Text>
              </View>
            ))
          )}
        </View>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        {/* Your journey: rank, progress to the next, the whole ladder */}
        {!!rank && (
          <View style={styles.section} onLayout={(e) => { journeyY.current = e.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>Your journey</Text>
            <JourneyCard rank={rank} onOpenRank={setRankSheet} onOpenHow={() => setRankSheet('how')} />
          </View>
        )}

        {/* Next trip */}
        {nextTrip && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Up next</Text>
            <TouchableOpacity
              style={styles.nextTrip}
              onPress={() => openTrip(nextTrip)}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`${nextTrip.name}, ${nextLabel}`}
            >
              {nextCover ? (
                <Image source={{ uri: nextCover }} style={styles.nextCover} contentFit="cover" />
              ) : (
                <View style={[styles.nextCover, styles.nextCoverEmpty]}>
                  <Feather name="map" size={20} color={COLORS.textMuted} />
                </View>
              )}
              <View style={styles.nextText}>
                <Text style={styles.nextName} numberOfLines={1}>{nextTrip.name}</Text>
                <Text style={styles.nextMeta} numberOfLines={1}>
                  {formatDateRange(nextTrip.startDate, nextTrip.endDate) || nextTrip.primaryDestination || ''}
                </Text>
                <View style={styles.nextPill}>
                  <Text style={styles.nextPillText}>{nextLabel}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* The same as your public profile: travel style, where you've been
            (stamps + map) and your stories. */}
        {vibes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Travel style</Text>
            <View style={styles.sectionBody}>
              <TravelStyle vibes={vibes} />
            </View>
          </View>
        )}

        {places.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Where I've been</Text>
            <View style={styles.sectionBody}>
              <WhereBeen
                places={places}
                mapPlaces={mapPlaces}
                activeKey={activePlace}
                onSelect={setActivePlace}
                bleed={SIZES.spacing_base + SIZES.spacing_xs}
              />
            </View>
          </View>
        )}

        {myStories.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, styles.sectionTitleInline]} numberOfLines={1}>
                {activePlace ? `Stories from ${places.find((p) => p.key === activePlace)?.label || ''}` : 'Stories'}
              </Text>
              <TouchableOpacity
                onPress={() => (activePlace ? setActivePlace(null) : navigation.navigate('MyStories'))}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.sectionLink}>{activePlace ? 'Show all' : 'See all'}</Text>
              </TouchableOpacity>
            </View>
            <StoryGrid
              stories={shownStories}
              width={windowWidth - SIZES.spacing_base * 2}
              onOpen={(item) => navigation.navigate('JournalDetail', { journalId: item.id, title: item.title })}
            />
          </View>
        )}

        {/* Shortcuts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your travels</Text>
          <View style={styles.group}>
            <Row
              icon="briefcase"
              label="My trips"
              value={stats.upcomingTrips ? `${stats.upcomingTrips} upcoming` : undefined}
              onPress={() => navigation.navigate('MyTrips', { screen: 'MyTripsHome' })}
            />
            <Row
              icon="user-plus"
              label="Join a trip with an invite"
              onPress={() => navigation.navigate('MyTrips', { screen: 'JoinTrip', initial: false })}
            />
            <Row
              icon="heart"
              label="Favourites"
              onPress={() => navigation.navigate('Favorites', { screen: 'FavoritesHome' })}
            />
            <Row
              icon="book-open"
              label="Your stories"
              onPress={() => navigation.navigate('MyStories')}
              last
            />
          </View>
        </View>

        {/* Account security, privacy, legal, log out: all in Settings. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.group}>
            <Row icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} last />
          </View>
        </View>
        </View>
      </Animated.ScrollView>

      {/* Compact bar: fades in once the round back button scrolls away. */}
      <Animated.View
        style={[styles.stickyHeader, { opacity: barOpacity, transform: [{ translateY: barShift }], paddingTop: insets.top }]}
        pointerEvents={barOn ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.stickyButton} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.stickyTitle} numberOfLines={1}>Profile</Text>
        <View style={styles.stickyButtonSpacer} />
      </Animated.View>

      <RankSheet
        visible={rankSheet != null}
        rank={rank}
        show={rankSheet}
        onShow={setRankSheet}
        onClose={() => setRankSheet(null)}
      />
      <RankCelebration
        level={celebrateLevel}
        onClose={dismissCelebration}
        onSeeJourney={() => { dismissCelebration(); setTimeout(scrollToJourney, 300); }}
      />

      {/* Edit name */}
      <Modal visible={editingName} transparent animationType="slide" onRequestClose={() => setEditingName(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditingName(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { marginBottom: keyboardHeight, paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_lg }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Your name</Text>
            <Text style={styles.sheetHint}>This is what other travellers see on shared trips.</Text>
            <TextInput
              style={styles.input}
              value={nameDraft}
              onChangeText={(t) => { setNameDraft(t); setNameError(''); }}
              placeholder="Your name"
              placeholderTextColor={COLORS.textMuted}
              maxLength={MAX_NAME}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={saveName}
              accessibilityLabel="Your name"
            />
            {!!nameError && <Text style={styles.nameError}>{nameError}</Text>}
            <TouchableOpacity
              style={[styles.saveButton, (savingName || !nameDraft.trim()) && styles.saveButtonDisabled]}
              onPress={saveName}
              disabled={savingName || !nameDraft.trim()}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              {savingName ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit bio */}
      <Modal visible={editingBio} transparent animationType="slide" onRequestClose={() => setEditingBio(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditingBio(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { marginBottom: keyboardHeight, paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_lg }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Your bio</Text>
            <Text style={styles.sheetHint}>A line or two about you and how you travel. Shown on your profile to other travellers.</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bioDraft}
              onChangeText={(t) => { setBioDraft(t); setBioError(''); }}
              placeholder="e.g. Slow travel, street food and early-morning walks."
              placeholderTextColor={COLORS.textMuted}
              maxLength={MAX_BIO}
              multiline
              autoFocus
              textAlignVertical="top"
              accessibilityLabel="Your bio"
            />
            <Text style={styles.bioCounter}>{bioDraft.length}/{MAX_BIO}</Text>
            {!!bioError && <Text style={styles.nameError}>{bioError}</Text>}
            <TouchableOpacity
              style={[styles.saveButton, savingBio && styles.saveButtonDisabled]}
              onPress={saveBio}
              disabled={savingBio}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              {savingBio ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

  header: {
    overflow: 'hidden',
    backgroundColor: '#D9F0FA',
  },
  // (Not "sheet": that's the edit-name sheet's style, further down.)
  pageSheet: {
    marginTop: -SIZES.radius_xl,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: COLORS.backgroundWarm,
  },
  backButton: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  // Compact bar once scrolled (same as the trip and place pages).
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  stickyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  stickyButtonSpacer: {
    width: 40,
    height: 40,
  },
  stickyTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  // A white ring, so the photo stands clear of the scene behind it.
  avatarRing: {
    padding: 4,
    borderRadius: AVATAR_SIZE,
    backgroundColor: COLORS.white,
    shadowColor: '#2B3F51',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarBusy: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  avatarBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 34,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  // Your first name, big, between the scene's layers.
  // Photo centred on the scene's bottom edge (half over it), details below.
  meRow: {
    alignItems: 'center',
    marginTop: -(AVATAR_SIZE / 2 + 4), // half over the banner
    paddingHorizontal: SIZES.spacing_lg,
  },
  meText: {
    alignItems: 'center',
    marginTop: SIZES.spacing_sm,
    maxWidth: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  name: {
    flexShrink: 1,
    fontSize: 22,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  rankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    marginBottom: 6,
    paddingLeft: 3,
    paddingRight: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: COLORS.white,
  },
  rankChipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  email: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  sinceText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  bioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_lg,
  },
  bioText: {
    flexShrink: 1,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  bioAdd: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accentDeep,
  },
  bioInput: {
    minHeight: 96,
  },
  bioCounter: {
    alignSelf: 'flex-end',
    marginTop: 4,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },

  statsCard: {
    flexDirection: 'row',
    paddingVertical: SIZES.spacing_base,
    borderRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
    shadowColor: '#2B3F51',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
    minHeight: 92,
  },
  statsLoader: {
    flex: 1,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: SIZES.xl,
    lineHeight: 28,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  error: {
    marginTop: SIZES.spacing_md,
    marginHorizontal: SIZES.spacing_lg,
    textAlign: 'center',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: '#D33F2F',
  },

  section: {
    marginTop: SIZES.spacing_lg,
    marginHorizontal: SIZES.spacing_base,
  },
  sectionBody: {
    paddingHorizontal: SIZES.spacing_xs,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.spacing_sm,
  },
  sectionTitleInline: {
    flexShrink: 1,
    marginBottom: 0,
  },
  sectionLink: {
    marginRight: SIZES.spacing_xs,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  sectionTitle: {
    marginLeft: SIZES.spacing_xs,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  nextTrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E9EDF1',
  },
  nextCover: {
    width: 64,
    height: 64,
    borderRadius: SIZES.radius_md,
  },
  nextCoverEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  nextText: {
    flex: 1,
    minWidth: 0,
  },
  nextName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  nextMeta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  nextPill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  nextPillText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },

  group: {
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E9EDF1',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    minHeight: 54,
    paddingHorizontal: SIZES.spacing_base,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: SIZES.radius_sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
  },
  rowIconDanger: {
    backgroundColor: '#FBEEEC',
  },
  rowLabel: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  rowLabelDanger: {
    color: COLORS.error,
    fontFamily: 'Poppins_600SemiBold',
  },
  rowValue: {
    maxWidth: '50%',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  deleteLink: {
    alignSelf: 'center',
    marginTop: SIZES.spacing_lg,
  },
  deleteLinkText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.error,
  },
  deleteIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FBEEEC',
    marginBottom: SIZES.spacing_md,
  },
  deletePoint: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginBottom: 6,
  },
  deleteBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: COLORS.textSecondary,
  },
  deletePointText: {
    flex: 1,
    fontSize: SIZES.sm,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  deleteType: {
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  deleteButton: {
    marginTop: SIZES.spacing_base,
    height: 50,
    borderRadius: SIZES.radius_full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#C4392A',
  },
  cancelButton: {
    alignSelf: 'center',
    paddingVertical: SIZES.spacing_md,
    marginTop: SIZES.spacing_xs,
  },
  cancelText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  version: {
    marginTop: SIZES.spacing_md,
    textAlign: 'center',
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },

  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SIZES.spacing_md,
  },
  sheetTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  sheetHint: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginBottom: SIZES.spacing_md,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  nameError: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: '#D33F2F',
  },
  saveButton: {
    marginTop: SIZES.spacing_base,
    height: 50,
    borderRadius: SIZES.radius_full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
