import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  Image,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import { API_URL } from '../config';
import { FilterChips, SignInPrompt } from '../components';
import { getMyTrips, AuthRequiredError } from '../services';
import { mapWithConcurrency } from '../utils/async';
import useAuth from '../hooks/useAuth';

/** Build our backend photo-proxy URL for a given Google photo_reference. */
function proxyPhotoUrl(reference) {
  return `${API_URL}/Destinations/photo?reference=${encodeURIComponent(reference)}&maxWidth=600`;
}

/**
 * Resolve a CURRENT cover photo for a trip. Google photo_references expire, so
 * stored coverPhotoUrls (raw keyed Google URLs) eventually 400. placeIds are
 * stable, so we re-resolve a fresh reference via /Destinations/details using
 * the trip's first place. Returns a proxy URL, or null.
 */
async function resolveTripPhotoUrl(trip, attempt = 0) {
  const placeId = Array.isArray(trip?.placeIds) ? trip.placeIds[0] : null;
  if (!placeId) return null;
  try {
    const resp = await fetch(`${API_URL}/Destinations/details?placeId=${encodeURIComponent(placeId)}`);
    if (!resp.ok) throw new Error(`details ${resp.status}`);
    const details = await resp.json();
    const googleUrl = details?.photos?.[0]?.url;
    if (!googleUrl) return null;
    const refMatch = googleUrl.match(/photo_reference=([^&]+)/);
    if (!refMatch) return null;
    return proxyPhotoUrl(decodeURIComponent(refMatch[1]));
  } catch (e) {
    // One retry with a short backoff for transient throttling/timeouts.
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return resolveTripPhotoUrl(trip, attempt + 1);
    }
    console.log('resolveTripPhotoUrl error:', e);
    return null;
  }
}

/** Format a date range like "12 Jun – 18 Jun 2026", tolerating missing dates. */
function formatDateRange(startDate, endDate) {
  const opts = { day: 'numeric', month: 'short' };
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  if (start && end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    const startStr = start.toLocaleDateString('en-GB', opts);
    const endStr = end.toLocaleDateString('en-GB', { ...opts, year: 'numeric' });
    return sameYear ? `${startStr} – ${endStr}` : `${start.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })} – ${endStr}`;
  }
  if (start) return `From ${start.toLocaleDateString('en-GB', { ...opts, year: 'numeric' })}`;
  return 'Dates not set';
}

/**
 * Visual treatment for a trip status.
 * Backend emits: "draft" | "planning" | "in_progress" | "completed".
 */
function statusStyle(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return { label: 'Completed', bg: '#eef1f3', color: COLORS.textSecondary };
    case 'in_progress':
      return { label: 'Ongoing', bg: '#e8f5e9', color: COLORS.success };
    case 'planning':
      return { label: 'Upcoming', bg: '#fff1e8', color: COLORS.accent };
    case 'draft':
    default:
      return { label: 'Draft', bg: '#eef3f7', color: COLORS.primaryLight };
  }
}

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
  const [needsAuth, setNeedsAuth] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [headerHeight, setHeaderHeight] = useState(0);
  // Fresh proxy cover-photo URLs resolved from placeId, keyed by trip id.
  const [freshPhotos, setFreshPhotos] = useState({});
  // Track trip ids whose cover image failed to load, to show the placeholder.
  const [brokenImages, setBrokenImages] = useState({});
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
  const resolveFreshPhotosFor = useCallback(async (items) => {
    setBrokenImages({});
    // Bounded concurrency so we don't flood the backend/Google (which caused
    // only a few covers to resolve per load). Each result updates as it lands.
    await mapWithConcurrency(
      items,
      (t) => resolveTripPhotoUrl(t),
      (t, url) => {
        if (url) setFreshPhotos((prev) => ({ ...prev, [t.id]: url }));
      },
      3
    );
  }, []);

  const loadTrips = useCallback(async () => {
    setError(false);
    setNeedsAuth(false);
    try {
      const data = await getMyTrips();
      setTrips(data);
      // Re-resolve fresh cover photos from placeId (stored references expire).
      resolveFreshPhotosFor(data);
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
  }, [resolveFreshPhotosFor]);

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

  const onRefresh = () => {
    setRefreshing(true);
    loadTrips();
  };

  const renderTrip = ({ item }) => {
    const badge = statusStyle(item.status);
    const destination = item.primaryDestination || item.name;
    const placeCount = Array.isArray(item.placeIds) ? item.placeIds.length : 0;
    // Prefer a freshly-resolved cover photo (from placeId); fall back to the
    // stored coverPhotoUrl. Stored Google references expire, so the fresh one wins.
    const coverUri = freshPhotos[item.id] || item.coverPhotoUrl;
    const showCover = coverUri && !brokenImages[item.id];

    return (
      <TouchableOpacity
        style={styles.tripCard}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('TripDetail', { tripId: item.id, tripName: item.name })}
      >
        <View style={styles.tripImageWrap}>
          {showCover ? (
            <Image
              source={{ uri: coverUri }}
              style={styles.tripImage}
              onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
            />
          ) : (
            <View style={[styles.tripImage, styles.tripImagePlaceholder]}>
              <Ionicons name="image-outline" size={30} color={COLORS.textMuted} />
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.tripContent}>
          <Text style={styles.tripName} numberOfLines={1}>{item.name}</Text>

          <View style={styles.tripMetaRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.tripMetaText} numberOfLines={1}>{destination}</Text>
          </View>

          <View style={styles.tripMetaRow}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.tripMetaText}>{formatDateRange(item.startDate, item.endDate)}</Text>
          </View>

          <View style={styles.tripFooter}>
            {item.travelersCount > 0 && (
              <View style={styles.footerChip}>
                <Ionicons name="people-outline" size={13} color={COLORS.textSecondary} />
                <Text style={styles.footerChipText}>{item.travelersCount}</Text>
              </View>
            )}
            {placeCount > 0 && (
              <View style={styles.footerChip}>
                <Ionicons name="pin-outline" size={13} color={COLORS.textSecondary} />
                <Text style={styles.footerChipText}>{placeCount} {placeCount === 1 ? 'place' : 'places'}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
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
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : (
        <Animated.View style={[styles.listWrap, { opacity: listOpacity }]}>
          <FlatList
            data={visibleTrips}
            renderItem={renderTrip}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              visibleTrips.length === 0 ? styles.listEmpty : styles.listContent,
              { paddingTop: headerHeight + SIZES.spacing_sm },
            ]}
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.accent}
                progressViewOffset={headerHeight}
              />
            }
          />
        </Animated.View>
      )}

      {/* Combined floating glass header: title + filters. List scrolls beneath. */}
      <BlurView
        intensity={50}
        tint="light"
        style={styles.header}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>My Trips</Text>
          <Text style={styles.headerSubtitle}>
            {trips.length > 0
              ? `${trips.length} ${trips.length === 1 ? 'adventure' : 'adventures'} planned`
              : 'Your journeys, all in one place'}
          </Text>
        </View>

        {!loading && trips.length > 0 && (
          <View style={styles.headerFilters}>
            <FilterChips
              filters={FILTERS}
              activeKey={activeFilter}
              onChange={changeFilter}
              variant="text"
              embedded
            />
          </View>
        )}
      </BlurView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  // Combined floating glass header (title + filters); list scrolls beneath.
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_base,
    borderBottomLeftRadius: SIZES.radius_xl,
    borderBottomRightRadius: SIZES.radius_xl,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  headerText: {
    flex: 1,
  },
  headerFilters: {
    marginTop: SIZES.spacing_md,
  },
  headerTitle: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
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
  tripCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_lg,
    marginBottom: SIZES.spacing_base,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  tripImageWrap: {
    position: 'relative',
  },
  tripImage: {
    width: '100%',
    height: 150,
  },
  tripImagePlaceholder: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: SIZES.spacing_md,
    left: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_xs,
    borderRadius: SIZES.radius_full,
  },
  statusText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
  },
  tripContent: {
    padding: SIZES.spacing_base,
  },
  tripName: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_sm,
  },
  tripMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.spacing_xs,
  },
  tripMetaText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginLeft: SIZES.spacing_xs,
    flex: 1,
  },
  tripFooter: {
    flexDirection: 'row',
    marginTop: SIZES.spacing_sm,
  },
  footerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_xs,
    borderRadius: SIZES.radius_full,
    marginRight: SIZES.spacing_sm,
  },
  footerChipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
    marginLeft: SIZES.spacing_xs,
  },

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
