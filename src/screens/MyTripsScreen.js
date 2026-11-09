import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
  Alert,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import { FilterChips, SignInPrompt, ScreenHeader, TripListSkeleton, TripStackCard, TripFan, TripListRow, EditTripSheet, SwipeableCard } from '../components';
import { confirmDeleteTrip, tripRole } from '../utils/tripActions';
import { getMyTrips, getTripById, deleteTrip, getStoredUser, AuthRequiredError } from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { sortTripsForList } from '../utils/tripDates';
import useAuth from '../hooks/useAuth';

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
      Alert.alert('Could not open trip', e?.message || 'Please try again.');
    }
  };

  const removeTrip = (item) => confirmDeleteTrip(item.name, async () => {
    try {
      await deleteTrip(item.id);
      setTrips((prev) => prev.filter((t) => t.id !== item.id));
    } catch (e) {
      Alert.alert('Could not delete trip', e?.message || 'Please try again.');
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

  // Round button at the top-right of the header (always on screen), shown
  // whenever the fan can't hold every trip: switches between cards and list.
  const viewToggle = hiddenCount > 0 ? (
    <TouchableOpacity
      style={styles.viewToggle}
      activeOpacity={0.8}
      onPress={() => toggleShowAll(!listMode)}
      accessibilityRole="button"
      accessibilityLabel={listMode ? 'Show trips as cards' : `See all ${visibleTrips.length} trips as a list`}
      hitSlop={6}
    >
      <Ionicons
        name={listMode ? 'albums-outline' : 'list-outline'}
        size={20}
        color={COLORS.accentDeep}
      />
      {!listMode && (
        // Count badge: how many trips the list holds.
        <View style={styles.viewToggleBadge}>
          <Text style={styles.viewToggleBadgeText}>{visibleTrips.length}</Text>
        </View>
      )}
    </TouchableOpacity>
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
          subtitle="Sign in to create trips and keep your journeys organized."
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

      {loading ? (
        // Offset below the floating header, like the real list.
        <View style={{ paddingTop: headerHeight + SIZES.spacing_sm }}>
          <TripListSkeleton />
        </View>
      ) : (
        <Animated.View style={[styles.listWrap, { opacity: listOpacity }]}>
          {visibleTrips.length === 0 ? (
            <View style={[styles.listEmpty, { paddingTop: headerHeight }]}>
              {renderEmpty()}
            </View>
          ) : (
            listMode ? (
              <FlatList
                data={visibleTrips}
                keyExtractor={(t, i) => String(t.id ?? i)}
                renderItem={({ item }) => renderTrip(item, { compact: true })}
                ItemSeparatorComponent={() => <View style={styles.rowGap} />}
                contentContainerStyle={[styles.listContent, { paddingTop: headerHeight + SIZES.spacing_sm }]}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={() => setOpenSwipeId(null)}
                refreshControl={<RefreshControl {...refreshControlProps} />}
              />
            ) : (
              <TripFan
                // Remount when the set of trips changes so the scroll resets.
                key={`${activeFilter}-${fanTrips.length}`}
                trips={fanTrips}
                renderCard={(trip) => renderTrip(trip)}
                topInset={headerHeight + SIZES.spacing_sm}
                bottomInset={120}
                onScrollBeginDrag={() => setOpenSwipeId(null)}
                refreshControlProps={refreshControlProps}
              />
            )
          )}
        </Animated.View>
      )}

      {/* Shared floating header panel. List scrolls beneath. */}
      <ScreenHeader
        title="My Trips"
        subtitle={
          trips.length > 0
            ? `${trips.length} ${trips.length === 1 ? 'adventure' : 'adventures'} planned`
            : 'Your journeys, all in one place'
        }
        collapsed={false}
        right={loading ? null : (
          <View style={styles.headerActions}>
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
            {viewToggle}
          </View>
        )}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  // Main list view: same as container but without the Android status bar
  // padding (the floating header handles that).
  screen: {
    flex: 1,
    backgroundColor: COLORS.white,
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
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.sand,
  },
  viewToggleBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    // Deeper orange keeps the small white number readable (theme note).
    backgroundColor: COLORS.accentDeep,
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  viewToggleBadgeText: {
    fontSize: SIZES.xs,
    lineHeight: 13,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
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
