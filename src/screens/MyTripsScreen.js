import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import { FilterChips, SignInPrompt, ScreenHeader, TripListSkeleton, TripStackCard, TripFan, TripListRow, EditTripSheet, SwipeableCard } from '../components';
import { TRIP_CARD_HEIGHT } from '../components/TripStackCard';
import { tripTiming } from '../components/TripListRow';
import { confirmDeleteTrip, tripRole } from '../utils/tripActions';
import { getMyTrips, getTripById, deleteTrip, getStoredUser, AuthRequiredError } from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { sortTripsForList } from '../utils/tripDates';
import useAuth from '../hooks/useAuth';
import { showAlert } from '../components/AppDialog';
import UnfinishedTripCard from '../components/UnfinishedTripCard';

/**
 * Filter tabs. `match` maps a filter to the backend status values it includes.
 * `all` matches everything.
 */
const FILTERS = [
  { key: 'all', label: 'All', match: null },
  { key: 'planning', label: 'Soon', match: ['planning'] },
  { key: 'in_progress', label: 'Live', match: ['in_progress'] },
  { key: 'completed', label: 'Done', match: ['completed'] },
  { key: 'draft', label: 'Draft', match: ['draft'] },
];

/**
 * Most trips the photo fan shows. Past this the fan gets long and each card
 * only shows a thin strip, so the rest are reached through "See all", which
 * switches to a compact list of every trip.
 */
const FAN_LIMIT = 6;

// Space kept under the fan for the floating tab bar.
const FAN_BOTTOM_INSET = 120;

// Stands in for the "+N more trips" card at the end of the fan.
const MORE_TRIPS_ITEM = { id: '__more-trips__', isMoreCard: true };

/**
 * MyTripsScreen - lists the signed-in user's trips fetched from the backend.
 */
export default function MyTripsScreen({ navigation }) {
  const { isAuthenticated, isAuthReady } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  // Swipe actions: full trip being edited (the sheet needs its stops), the
  // card currently swiped open, and the signed-in user (for owner checks on
  // older backends that don't send myRole).
  const [editingTrip, setEditingTrip] = useState(null);
  const [openSwipeId, setOpenSwipeId] = useState(null);
  const [myUserId, setMyUserId] = useState(null);
  useEffect(() => {
    getStoredUser().then((u) => setMyUserId(u?.id || null)).catch(() => {});
  }, []);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  // true = compact list of every trip instead of the photo fan.
  const [showAll, setShowAll] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  // "Finish planning" card under the header: its height pushes the list down.
  const [draftHeight, setDraftHeight] = useState(0);
  const topInset = headerHeight + (draftHeight ? draftHeight + SIZES.spacing_md : 0);
  const listOpacity = useRef(new Animated.Value(1)).current;

  // Change filter with a quick cross-fade of the list content.
  const changeFilter = (key) => {
    if (key === activeFilter) return;
    Animated.timing(listOpacity, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setActiveFilter(key);
      setShowAll(false);
      Animated.timing(listOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  };

  // Trips visible under the current filter, most relevant first: ongoing,
  // upcoming, drafts, then completed.
  const visibleTrips = (() => {
    const filter = FILTERS.find((f) => f.key === activeFilter);
    const matching = !filter || !filter.match
      ? trips
      : trips.filter((t) => filter.match.includes((t.status || '').toLowerCase()));
    return sortTripsForList(matching);
  })();
  const fanTrips = visibleTrips.slice(0, FAN_LIMIT);
  const hiddenCount = visibleTrips.length - fanTrips.length;
  // The list view only makes sense while there are more trips than the fan shows.
  const listMode = showAll && hiddenCount > 0;

  // Switch between the fan and the full list with the same cross-fade as filters.
  const toggleShowAll = (next) => {
    setOpenSwipeId(null);
    Animated.timing(listOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setShowAll(next);
      Animated.timing(listOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };

  // Resolve fresh cover photos (from placeId) for trips, in parallel,
  // updating state as they arrive. Clears any prior broken flags.
  const loadTrips = useCallback(async () => {
    setError(false);
    setNeedsAuth(false);
    try {
      const data = await getMyTrips();
      setTrips(data);
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        setNeedsAuth(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the tab regains focus (it stays mounted in the tab navigator).
  useFocusEffect(
    useCallback(() => {
      // Wait until Firebase has restored persisted auth before deciding.
      if (!isAuthReady) return;
      if (!isAuthenticated) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }
      loadTrips();
    }, [loadTrips, isAuthReady, isAuthenticated])
  );

  // Swipe-left actions (owners only).
  const editTrip = async (item) => {
    try {
      setEditingTrip(await getTripById(item.id));
    } catch (e) {
      showAlert('Could not open trip', e?.message || 'Please try again.');
    }
  };

  const removeTrip = (item) => confirmDeleteTrip(item.name, async () => {
    try {
      await deleteTrip(item.id);
      const left = trips.filter((t) => t.id !== item.id);
      setTrips(left);
      // That was the only trip: back to Home.
      if (left.length === 0) navigation.getParent()?.navigate('Explore');
    } catch (e) {
      showAlert('Could not delete trip', e?.message || 'Please try again.');
    }
  });

  const onRefresh = () => {
    setRefreshing(true);
    loadTrips();
  };

  // Renders a trip as a fan card or, with `compact`, as a list row. Both get
  // the same swipe actions (owners only) and open the trip on tap.
  const renderTrip = (item, { compact = false } = {}) => {
    // Cover comes straight from the destination's place id (the backend keeps
    // it fresh). Falls back to the first saved place, then the stored cover.
    const coverPlaceId = item.primaryPlaceId || (Array.isArray(item.placeIds) ? item.placeIds[0] : null);
    const photoWidth = compact ? 200 : 800;
    const coverUri = placePhotoUrl(coverPlaceId, photoWidth) || normalizePhotoUrl(item.coverPhotoUrl, photoWidth);
    const isOwner = tripRole(item, myUserId) === 'owner';
    const Card = compact ? TripListRow : TripStackCard;
    return (
      <SwipeableCard
        enabled={isOwner}
        isOpen={openSwipeId === item.id}
        onOpenChange={(open) => setOpenSwipeId(open ? item.id : null)}
        actionsHeight={compact ? 64 : undefined}
        actions={[
          { key: 'edit', label: 'Edit', icon: 'create-outline', color: COLORS.primary, onPress: () => editTrip(item) },
          { key: 'delete', label: 'Delete', icon: 'trash-outline', color: COLORS.error, onPress: () => removeTrip(item) },
        ]}
      >
        <Card
          trip={item}
          imageUri={coverUri}
          onPress={() => navigation.navigate('TripDetail', { tripId: item.id, tripName: item.name })}
          accessibilityActions={isOwner ? [{ name: 'edit', label: 'Edit trip' }, { name: 'delete', label: 'Delete trip' }] : undefined}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'edit') editTrip(item);
            if (e.nativeEvent.actionName === 'delete') removeTrip(item);
          }}
        />
      </SwipeableCard>
    );
  };

  const refreshControlProps = {
    refreshing,
    onRefresh,
    tintColor: COLORS.accent,
    progressViewOffset: headerHeight,
  };

  // List view: trips grouped (Happening now, Upcoming, Drafts, Past), each
  // group keeping the list's sort order.
  const listSections = (() => {
    const groups = [
      { key: 'now', label: 'Happening now', color: '#43A474', match: (t) => tripTiming(t).progress != null || tripTiming(t).label === 'Starts today' },
      { key: 'upcoming', label: 'Upcoming', color: COLORS.accent, match: (t) => /^(In |Tomorrow)/.test(tripTiming(t).label) },
      { key: 'draft', label: 'No dates yet', color: COLORS.primaryLight, match: (t) => tripTiming(t).label === 'No dates yet' },
      { key: 'past', label: 'Past trips', color: '#94A7B8', match: () => true },
    ];
    const used = new Set();
    const out = [];
    groups.forEach((g) => {
      const trips = visibleTrips.filter((t) => !used.has(t) && g.match(t));
      trips.forEach((t) => used.add(t));
      if (!trips.length) return;
      out.push({ isHeader: true, key: g.key, label: g.label, color: g.color, count: trips.length });
      out.push(...trips);
    });
    return out;
  })();

  // The last card of the deck when the fan can't hold every trip: same size
  // and shape as a trip card, so its top strip ("+4 more trips") peeks out
  // under the 6th card like the others. Opens the list of all trips.
  const hiddenTrips = visibleTrips.slice(FAN_LIMIT);
  const moreTripsCard = (
    <TouchableOpacity
      style={styles.moreCard}
      onPress={() => toggleShowAll(true)}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${hiddenCount} more ${hiddenCount === 1 ? 'trip' : 'trips'}. See all ${visibleTrips.length} trips`}
    >
      <View style={styles.moreClip}>
        {/* Collage of the hidden trips' photos, darkened at the top for the text. */}
        <View style={styles.moreCollage}>
          {hiddenTrips.slice(0, 3).map((trip) => {
            const placeId = trip.primaryPlaceId || (Array.isArray(trip.placeIds) ? trip.placeIds[0] : null);
            const uri = placePhotoUrl(placeId, 400) || normalizePhotoUrl(trip.coverPhotoUrl, 400);
            return (
              <View key={trip.id} style={styles.morePhoto}>
                {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
              </View>
            );
          })}
        </View>
        <LinearGradient
          colors={['rgba(16, 24, 32, 0.85)', 'rgba(16, 24, 32, 0.35)', 'rgba(16, 24, 32, 0.15)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.moreTop}>
          <View style={styles.moreText}>
            <Text style={styles.moreTitle}>+{hiddenCount} more {hiddenCount === 1 ? 'trip' : 'trips'}</Text>
            <Text style={styles.moreSub}>See all {visibleTrips.length} trips</Text>
          </View>
          <View style={styles.moreGo}>
            <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Cards / list switch at the top-right of the header, shown whenever the
  // fan can't hold every trip. Two icons side by side, the current view
  // highlighted (no count badge, so it doesn't read as a menu with alerts).
  const viewToggle = hiddenCount > 0 ? (
    <View style={styles.viewToggle} accessibilityRole="tablist">
      {[
        { key: 'cards', icon: 'albums', on: !listMode, label: 'Show trips as cards' },
        { key: 'list', icon: 'list', on: listMode, label: `Show all ${visibleTrips.length} trips as a list` },
      ].map((o) => (
        <TouchableOpacity
          key={o.key}
          style={[styles.viewToggleOption, o.on && styles.viewToggleOptionOn]}
          activeOpacity={0.8}
          onPress={() => { if (!o.on) toggleShowAll(o.key === 'list'); }}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.on }}
          accessibilityLabel={o.label}
          hitSlop={4}
        >
          <Ionicons
            name={o.on ? o.icon : `${o.icon}-outline`}
            size={17}
            color={o.on ? COLORS.accentDeep : COLORS.textMuted}
          />
        </TouchableOpacity>
      ))}
    </View>
  ) : null;
  const renderEmpty = () => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.stateContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Couldn't load your trips</Text>
          <Text style={styles.stateSubtitle}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadTrips}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // No trips at all vs. none matching the active filter.
    if (trips.length === 0) {
      return (
        <View style={styles.stateContainer}>
          <Ionicons name="map-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>No trips yet</Text>
          <Text style={styles.stateSubtitle}>Explore a destination and create your first trip.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.navigate('Explore')}>
            <Text style={styles.retryText}>Start exploring</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.joinLink}
            onPress={() => navigation.navigate('JoinTrip')}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.joinLinkText}>Have an invite? Join a trip</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const filterLabel = FILTERS.find((f) => f.key === activeFilter)?.label?.toLowerCase();
    return (
      <View style={styles.stateContainer}>
        <Ionicons name="funnel-outline" size={44} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>No {filterLabel} trips</Text>
        <Text style={styles.stateSubtitle}>Try a different filter to see more.</Text>
      </View>
    );
  };

  // Guest: show the sign-in gate instead of an empty list + header.
  if (needsAuth) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <SignInPrompt
          icon="map-outline"
          title="Plan your next adventure"
          subtitle="Sign in to create trips and keep your journeys organised."
          onSignIn={() => navigation.navigate('Welcome')}
        />
      </SafeAreaView>
    );
  }

  return (
    // No top safe-area padding here: the floating header already clears the
    // status bar / notch itself, and content is offset by its measured height.
    // Padding the top too would push the cards down twice.
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* A trip you started creating but didn't finish. */}
      {!needsAuth && headerHeight > 0 && (
        <View style={[styles.unfinishedWrap, { top: headerHeight + SIZES.spacing_sm }]} pointerEvents="box-none">
          <UnfinishedTripCard navigation={navigation} onHeight={setDraftHeight} />
        </View>
      )}

      {loading ? (
        // Offset below the floating header, like the real list.
        <View style={{ paddingTop: topInset + SIZES.spacing_sm }}>
          <TripListSkeleton />
        </View>
      ) : (
        <Animated.View style={[styles.listWrap, { opacity: listOpacity }]}>
          {visibleTrips.length === 0 ? (
            <View style={[styles.listEmpty, { paddingTop: topInset }]}>
              {renderEmpty()}
            </View>
          ) : (
            listMode ? (
              <FlatList
                data={listSections}
                keyExtractor={(t, i) => (t.isHeader ? `h-${t.key}` : String(t.id ?? i))}
                renderItem={({ item }) => (item.isHeader ? (
                  <View style={styles.sectionHead}>
                    <View style={[styles.sectionDot, { backgroundColor: item.color }]} />
                    <Text style={styles.sectionTitle}>{item.label}</Text>
                    <View style={styles.sectionCount}>
                      <Text style={styles.sectionCountText}>{item.count}</Text>
                    </View>
                  </View>
                ) : renderTrip(item, { compact: true }))}
                ItemSeparatorComponent={() => <View style={styles.rowGap} />}
                contentContainerStyle={[styles.listContent, { paddingTop: topInset + SIZES.spacing_sm }]}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={() => setOpenSwipeId(null)}
                refreshControl={<RefreshControl {...refreshControlProps} />}
              />
            ) : (
              <TripFan
                // Remount when the set of trips changes so the scroll resets.
                key={`${activeFilter}-${fanTrips.length}-${hiddenCount}`}
                trips={hiddenCount > 0 ? [...fanTrips, MORE_TRIPS_ITEM] : fanTrips}
                renderCard={(trip) => (trip.isMoreCard ? moreTripsCard : renderTrip(trip))}
                topInset={topInset + SIZES.spacing_sm}
                bottomInset={FAN_BOTTOM_INSET}
                onScrollBeginDrag={() => setOpenSwipeId(null)}
                refreshControlProps={refreshControlProps}
              />
            )
          )}
        </Animated.View>
      )}

      {/* Shared floating header panel. List scrolls beneath. */}
      <ScreenHeader
        title="My trips"
        subtitle={
          trips.length > 0
            ? `${trips.length} ${trips.length === 1 ? 'adventure' : 'adventures'} planned`
            : 'Your journeys, all in one place'
        }
        collapsed={false}
        // Join on the left, the cards / list switch on the right, so the
        // centred title has room on both sides.
        left={loading ? null : (
          <TouchableOpacity
            style={styles.joinButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('JoinTrip')}
            accessibilityRole="button"
            accessibilityLabel="Join a trip with an invite link"
            hitSlop={6}
          >
            <Ionicons name="person-add-outline" size={19} color={COLORS.accentDeep} />
          </TouchableOpacity>
        )}
        right={loading ? null : viewToggle}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        {!loading && trips.length > 0 && (
          // The header's children area runs edge to edge; re-apply its side
          // inset so the full-width track lines up with the header content.
          <View style={styles.filterRow}>
            <FilterChips
              filters={FILTERS}
              activeKey={activeFilter}
              onChange={changeFilter}
              variant="pills"
              fullWidth
              tinted={false}
            />
          </View>
        )}
      </ScreenHeader>
      <EditTripSheet
        visible={!!editingTrip}
        trip={editingTrip}
        onClose={() => setEditingTrip(null)}
        onSaved={() => { setEditingTrip(null); loadTrips(); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  unfinishedWrap: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    zIndex: 2,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm, // alpine frost (60%)
  },
  // Main list view: same as container but without the Android status bar
  // padding (the floating header handles that).
  screen: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm, // alpine frost (60%)
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    padding: SIZES.spacing_base,
    paddingBottom: 120,
  },
  listEmpty: {
    flexGrow: 1,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: SIZES.spacing_sm,
    paddingHorizontal: 4,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  sectionCount: {
    paddingHorizontal: 7,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.sand,
  },
  sectionCountText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  rowGap: {
    height: SIZES.spacing_md,
  },

  filterRow: {
    paddingHorizontal: SIZES.spacing_lg,
  },
  // Top-right header buttons: join a shared trip, and the list / cards toggle.
  headerActions: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
  },
  joinButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.sand,
  },
  // "+4 more trips": last card of the fan (same size and shape as a trip card)
  moreCard: {
    height: TRIP_CARD_HEIGHT,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  moreClip: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
  },
  moreCollage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 2,
  },
  morePhoto: {
    flex: 1,
    backgroundColor: COLORS.primaryLight,
  },
  moreTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
  },
  moreText: { flex: 1 },
  moreTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  moreSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: '#F8CABC',
  },
  moreGo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggle: {
    flexDirection: 'row',
    height: 40,
    padding: 3,
    gap: 2,
    borderRadius: 20,
    backgroundColor: COLORS.sand,
  },
  viewToggleOption: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewToggleOptionOn: {
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },

  // Trip card

  // State (loading / empty / error)
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.spacing_xl,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginTop: SIZES.spacing_base,
  },
  stateSubtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.spacing_xs,
  },
  retryButton: {
    marginTop: SIZES.spacing_lg,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
  },
  joinLink: {
    marginTop: SIZES.spacing_base,
  },
  joinLinkText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  retryText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
