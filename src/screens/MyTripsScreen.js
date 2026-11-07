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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import { FilterChips, SignInPrompt, ScreenHeader, TripListSkeleton, TripStackCard, TripFan, EditTripSheet, SwipeableCard } from '../components';
import { confirmDeleteTrip, tripRole } from '../utils/tripActions';
import { getMyTrips, getTripById, deleteTrip, getStoredUser, AuthRequiredError } from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
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
      Animated.timing(listOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  };

  // Trips visible under the current filter.
  const visibleTrips = (() => {
    const filter = FILTERS.find((f) => f.key === activeFilter);
    if (!filter || !filter.match) return trips;
    return trips.filter((t) => filter.match.includes((t.status || '').toLowerCase()));
  })();

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

  // Collapse the header title on scroll down, expand it back near the top.
  // Hysteresis band avoids flip-flopping right at the threshold.
  const renderTrip = (item) => {
    // Cover comes straight from the destination's place id (the backend keeps
    // it fresh). Falls back to the first saved place, then the stored cover.
    const coverPlaceId = item.primaryPlaceId || (Array.isArray(item.placeIds) ? item.placeIds[0] : null);
    const coverUri = placePhotoUrl(coverPlaceId, 800) || normalizePhotoUrl(item.coverPhotoUrl, 800);
    const isOwner = tripRole(item, myUserId) === 'owner';
    return (
      <SwipeableCard
        enabled={isOwner}
        isOpen={openSwipeId === item.id}
        onOpenChange={(open) => setOpenSwipeId(open ? item.id : null)}
        actions={[
          { key: 'edit', label: 'Edit', icon: 'create-outline', color: COLORS.primary, onPress: () => editTrip(item) },
          { key: 'delete', label: 'Delete', icon: 'trash-outline', color: COLORS.error, onPress: () => removeTrip(item) },
        ]}
      >
        <TripStackCard
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
    <SafeAreaView style={styles.container}>
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
            <TripFan
              trips={visibleTrips}
              renderCard={(trip) => renderTrip(trip)}
              topInset={headerHeight + SIZES.spacing_sm}
              bottomInset={120}
              onScrollBeginDrag={() => setOpenSwipeId(null)}
              refreshControlProps={{
                refreshing,
                onRefresh,
                tintColor: COLORS.accent,
                progressViewOffset: headerHeight,
              }}
            />
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
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        {!loading && trips.length > 0 && (
          <FilterChips
            filters={FILTERS}
            activeKey={activeFilter}
            onChange={changeFilter}
            variant="pills"
          />
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
  retryText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
