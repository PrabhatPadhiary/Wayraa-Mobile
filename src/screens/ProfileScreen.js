import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
  Platform,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { SignInPrompt } from '../components';
import { avatarColorFor, initialsFor } from '../components/TripStackCard';
import useAuth from '../hooks/useAuth';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import {
  getMyProfile,
  updateMyName,
  signInMethods,
  sendPasswordReset,
  deleteMyAccount,
  getMyTrips,
  logoutUser,
  AuthRequiredError,
} from '../services';
import { pickNextTrip, formatDateRange, daysUntil } from '../utils/tripDates';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import appConfig from '../../app.json';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MAX_NAME = 60;

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
 * Header with photo/initials, name (editable), email and "exploring since";
 * travel stats from GET /api/users/me; the next trip; account actions
 * (name, password reset for email accounts, sign-in method); shortcuts
 * (join a trip, favourites); app version; log out.
 */
export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user: firebaseUser, isAuthenticated, isAuthReady } = useAuth();
  const iosKeyboard = useKeyboardHeight();
  const keyboardHeight = Platform.OS === 'ios' ? iosKeyboard : 0;

  const [profile, setProfile] = useState(null);
  const [nextTrip, setNextTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  // Delete account: typed confirmation sheet.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
  const email = profile?.email || firebaseUser?.email || '';
  const photo = !photoFailed ? firebaseUser?.photoURL : null;
  const since = profile?.createdAt ? new Date(profile.createdAt) : null;
  const methods = signInMethods();
  const stats = profile?.stats || {};

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

  const resetPassword = () => {
    Alert.alert(
      'Change password',
      `We'll email a link to ${email} to set a new password.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send link',
          onPress: async () => {
            try {
              const to = await sendPasswordReset();
              Alert.alert('Check your email', `A reset link is on its way to ${to}.`);
            } catch (e) {
              Alert.alert('Could not send the link', e?.message || 'Please try again later.');
            }
          },
        },
      ]
    );
  };

  const logOut = () => {
    Alert.alert('Log out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logoutUser();
          resetToWelcome();
        },
      },
    ]);
  };

  const resetToWelcome = () => {
    let root = navigation;
    while (root.getParent && root.getParent()) root = root.getParent();
    root.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  const openDelete = () => {
    setDeleteText('');
    setDeleteError('');
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteText.trim().toUpperCase() !== 'DELETE' || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteMyAccount();
      setDeleteOpen(false);
      resetToWelcome();
      Alert.alert('Account deleted', 'Your account and data have been removed. Safe travels!');
    } catch (e) {
      setDeleteError(e?.message || 'Could not delete your account. Please try again.');
      setDeleting(false);
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
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.white}
          />
        )}
      >
        {/* Header */}
        <LinearGradient
          colors={[COLORS.primary, '#0a5274']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + SIZES.spacing_sm }]}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-left" size={22} color={COLORS.white} />
          </TouchableOpacity>

          <View style={styles.avatarRing}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatar} onError={() => setPhotoFailed(true)} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarColorFor(name) }]}>
                <Text style={styles.avatarText}>{initialsFor(name)}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.nameRow}
            onPress={openNameEditor}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${name}. Edit name`}
          >
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Feather name="edit-2" size={15} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          {!!email && <Text style={styles.email} numberOfLines={1}>{email}</Text>}
          {!!since && (
            <View style={styles.sincePill}>
              <Feather name="globe" size={12} color={COLORS.white} />
              <Text style={styles.sinceText}>
                Exploring since {MONTHS[since.getMonth()]} {since.getFullYear()}
              </Text>
            </View>
          )}
        </LinearGradient>

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

        {/* Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.group}>
            <Row icon="user" label="Name" value={name} onPress={openNameEditor} />
            <Row icon="mail" label="Email" value={email} />
            <Row
              icon="log-in"
              label="Signed in with"
              value={methods.google && methods.password ? 'Google & email' : methods.google ? 'Google' : 'Email'}
              last={!methods.password}
            />
            {methods.password && (
              <Row icon="lock" label="Change password" onPress={resetPassword} last />
            )}
          </View>
        </View>

        {/* Shortcuts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trips</Text>
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
              last
            />
          </View>
        </View>

        {/* Log out */}
        <View style={styles.section}>
          <View style={styles.group}>
            {loggingOut ? (
              <ActivityIndicator style={styles.row} color={COLORS.error} />
            ) : (
              <Row icon="log-out" label="Log out" onPress={logOut} danger last />
            )}
          </View>
          <TouchableOpacity
            style={styles.deleteLink}
            onPress={openDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            hitSlop={8}
          >
            <Text style={styles.deleteLinkText}>Delete account</Text>
          </TouchableOpacity>
          <Text style={styles.version}>Wayraa {appConfig?.expo?.version ? `v${appConfig.expo.version}` : ''}</Text>
        </View>
      </ScrollView>

      {/* Delete account: explains what happens, then needs "DELETE" typed. */}
      <Modal visible={deleteOpen} transparent animationType="slide" onRequestClose={() => !deleting && setDeleteOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !deleting && setDeleteOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { marginBottom: keyboardHeight, paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_lg }]}>
            <View style={styles.grabber} />
            <View style={styles.deleteIcon}>
              <Feather name="alert-triangle" size={22} color={COLORS.error} />
            </View>
            <Text style={styles.sheetTitle}>Delete your account?</Text>
            <Text style={styles.sheetHint}>This can't be undone. Here's what happens:</Text>
            {[
              'Your profile, sign-in, favourites and journals are deleted.',
              'Trips only you are on are deleted.',
              'Trips shared with friends stay with them; the longest-standing editor becomes the owner.',
              'Expenses you paid on shared trips stay, shown as "Former traveller".',
            ].map((line) => (
              <View key={line} style={styles.deletePoint}>
                <View style={styles.deleteBullet} />
                <Text style={styles.deletePointText}>{line}</Text>
              </View>
            ))}
            <Text style={styles.deleteType}>Type DELETE to confirm</Text>
            <TextInput
              style={styles.input}
              value={deleteText}
              onChangeText={(t) => { setDeleteText(t); setDeleteError(''); }}
              placeholder="DELETE"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              accessibilityLabel="Type DELETE to confirm"
            />
            {!!deleteError && <Text style={styles.nameError}>{deleteError}</Text>}
            <TouchableOpacity
              style={[styles.deleteButton, (deleting || deleteText.trim().toUpperCase() !== 'DELETE') && styles.saveButtonDisabled]}
              onPress={confirmDelete}
              disabled={deleting || deleteText.trim().toUpperCase() !== 'DELETE'}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              {deleting ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveText}>Delete my account</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setDeleteOpen(false)}
              disabled={deleting}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Keep my account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    backgroundColor: '#f3f5f7',
  },

  header: {
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: 56,
    borderBottomLeftRadius: SIZES.radius_xl,
    borderBottomRightRadius: SIZES.radius_xl,
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: SIZES.spacing_sm,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_md,
    maxWidth: '100%',
  },
  name: {
    flexShrink: 1,
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  email: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.8)',
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
    marginTop: -36,
    marginHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_base,
    borderRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
    shadowColor: '#043247',
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
    color: '#d32f2f',
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
    borderColor: '#e9edf1',
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
    backgroundColor: '#fff1e8',
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
    borderColor: '#e9edf1',
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
    backgroundColor: '#e6f4fb',
  },
  rowIconDanger: {
    backgroundColor: '#fdecea',
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
    backgroundColor: '#fdecea',
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
    backgroundColor: '#c62828',
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
    color: '#d32f2f',
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
