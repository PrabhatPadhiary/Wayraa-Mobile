import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
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
import { ProfileSceneBack, ProfileSceneFront, SCENE_W, SCENE_H, sceneY } from '../components/ProfileScene';
import { Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { SignInPrompt } from '../components';
import { avatarColorFor, initialsFor } from '../components/TripStackCard';
import useAuth from '../hooks/useAuth';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import {
  getMyProfile,
  updateMyName,
  uploadProfilePhoto,
  removeProfilePhoto,
  useMyPhoto,
  getMyTrips,
  AuthRequiredError,
} from '../services';
import { pickNextTrip, formatDateRange, daysUntil } from '../utils/tripDates';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { showAlert } from '../components/AppDialog';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MAX_NAME = 60;

// Traveller titles, earned by the number of trips (shown big in the header).
const LEVELS = [
  { title: 'Wanderer', from: 0 },
  { title: 'Explorer', from: 2 },
  { title: 'Voyager', from: 6 },
  { title: 'Globetrotter', from: 11 },
];
function levelFor(trips = 0) {
  let i = 0;
  LEVELS.forEach((l, idx) => { if (trips >= l.from) i = idx; });
  return { ...LEVELS[i], next: LEVELS[i + 1] || null };
}

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
  const insets = useSafeAreaInsets();
  const { user: firebaseUser, isAuthenticated, isAuthReady } = useAuth();
  // On both platforms: Android is drawn edge to edge, so its window isn't
  // resized for the keyboard and the sheet has to make room itself.
  const keyboardHeight = useKeyboardHeight();

  const [profile, setProfile] = useState(null);
  const [nextTrip, setNextTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [me, trips] = await Promise.all([
        getMyProfile(),
        getMyTrips().catch(() => []),
      ]);
      setProfile(me);
      setNextTrip(pickNextTrip(trips));
    } catch (e) {
      if (e instanceof AuthRequiredError) setNeedsAuth(true);
      else setError('Couldn\'t load your profile. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
  const email = profile?.email || firebaseUser?.email || '';
  const myPhoto = useMyPhoto(firebaseUser?.photoURL);
  const photo = !photoFailed ? myPhoto : null;
  const since = profile?.createdAt ? new Date(profile.createdAt) : null;
  const stats = profile?.stats || {};
  const level = levelFor(stats.trips || 0);
  const showLevel = () => {
    const n = stats.trips || 0;
    const ladder = LEVELS.map((l, i) => {
      const to = LEVELS[i + 1] ? `${l.from}–${LEVELS[i + 1].from - 1}` : `${l.from}+`;
      return `${l.title === level.title ? '▸ ' : ''}${l.title}: ${to} trips`;
    }).join('\n');
    const left = level.next ? level.next.from - n : 0;
    showAlert(
      level.title,
      `${level.next
        ? `${left} more ${left === 1 ? 'trip' : 'trips'} to become a ${level.next.title}.`
        : 'The top title. Safe travels!'}\n\n${ladder}`,
    );
  };

  // ── Profile photo ──
  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Photos access needed', 'Allow access to your photos in Settings to choose a profile photo.');
      return;
    }
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.primary}
          />
        )}
      >
        {/* Header: a drawn countryside with your first name big INSIDE it,
            like the iPhone Lock Screen's depth effect: the sky and mountains
            are behind the name, the hills and the windmill in front of it.
            Your photo, full name, email and "exploring since" sit on the
            front hills. */}
        <View style={[styles.header, { height: sceneHeight }]}>
          <ProfileSceneBack width={windowWidth} />
          {/* Your traveller title, big (your name is just below). Tap: what
              the titles are and how far the next one is. */}
          {!loading && (
            <TouchableOpacity
              style={[styles.bigNameWrap, { top: sceneY(100, windowWidth) }]}
              onPress={showLevel}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Your traveller title: ${level.title}. What it means`}
            >
              <Text
                style={[styles.bigName, { fontSize: sceneY(66, windowWidth), lineHeight: sceneY(80, windowWidth) }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {level.title}
              </Text>
            </TouchableOpacity>
          )}
          <ProfileSceneFront width={windowWidth} />

          <TouchableOpacity
            style={[styles.backButton, { top: insets.top + SIZES.spacing_sm }]}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-left" size={22} color={COLORS.primary} />
          </TouchableOpacity>

          {/* You, on the front hills */}
          <View style={[styles.meRow, { top: sceneY(222, windowWidth) }]}>
            <TouchableOpacity
              style={styles.avatarRing}
              onPress={onAvatarPress}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={photo ? 'Change or remove your profile photo' : 'Add a profile photo'}
            >
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatar} onError={() => setPhotoFailed(true)} />
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
                <Feather name="camera" size={11} color={COLORS.primary} />
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
                <Feather name="edit-2" size={13} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
              {!!email && <Text style={styles.email} numberOfLines={1}>{email}</Text>}
              {!!since && (
                <Text style={styles.sinceText} numberOfLines={1}>
                  Exploring since {MONTHS[since.getMonth()]} {since.getFullYear()}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Stats: overlaps the header */}
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

        {!!error && <Text style={styles.error}>{error}</Text>}

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
          <View style={styles.group}>
            <Row icon="settings" label="Settings" onPress={() => navigation.navigate('Settings')} last />
          </View>
        </View>
      </ScrollView>

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
    borderBottomLeftRadius: SIZES.radius_xl,
    borderBottomRightRadius: SIZES.radius_xl,
    backgroundColor: '#D9F0FA',
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
  avatarRing: {
    padding: 3,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.9)',
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
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  // Your first name, big, between the scene's layers.
  bigNameWrap: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    right: SIZES.spacing_lg,
    alignItems: 'center',
  },
  // Deep slate on the light sky (white got lost there), with a soft white
  // glow so it also holds up where it crosses the mountains.
  bigName: {
    fontFamily: 'PlayfairDisplay_800ExtraBold',
    color: '#1E3346',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(255,255,255,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 12,
  },
  meRow: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    right: SIZES.spacing_lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  meText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  name: {
    flexShrink: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  email: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.9)',
  },
  sincePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  sinceText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },

  statsCard: {
    flexDirection: 'row',
    marginTop: -28,
    marginHorizontal: SIZES.spacing_base,
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
