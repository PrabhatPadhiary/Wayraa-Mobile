import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { SignInPrompt } from '../components';
import useAuth from '../hooks/useAuth';
import { getTripById, getPlaceDetails, AuthRequiredError } from '../services';

const HERO_HEIGHT = 280;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Sections for saved places, in display order. */
const PLACE_SECTIONS = [
  { key: 'stays', label: 'Stays', icon: 'bed-outline' },
  { key: 'food', label: 'Food', icon: 'restaurant-outline' },
  { key: 'activities', label: 'Activities', icon: 'walk-outline' },
  { key: 'other', label: 'Other', icon: 'location-outline' },
];

/** Map the many category spellings the app/backend use onto a section key. */
function sectionKeyFor(category) {
  const c = (category || '').toLowerCase();
  if (c === 'stay' || c === 'stays') return 'stays';
  if (c === 'food' || c === 'restaurant' || c === 'restaurants') return 'food';
  if (c === 'activity' || c === 'activities' || c === 'attraction' || c === 'attractions') {
    return 'activities';
  }
  return 'other';
}

// Backend stores dates as UTC midnight, so read them in UTC. Local-time
// formatting would show the previous day in time zones behind UTC.
function formatDay(date, withYear) {
  const base = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return withYear ? `${base} ${date.getUTCFullYear()}` : base;
}

function formatDateRange(startDate, endDate) {
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (start && end) {
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    return `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`;
  }
  if (start) return `From ${formatDay(start, true)}`;
  return null;
}

/** Inclusive number of days between two dates, or null if either is missing. */
function dayCount(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
    - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) / DAY_MS) + 1;
  return days > 0 ? days : null;
}

/** Same status labels and colors as the My Trips list. */
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

function formatBudget(amount, currency) {
  if (amount == null) return null;
  const rounded = Math.round(amount).toLocaleString();
  return currency ? `${currency} ${rounded}` : rounded;
}

/**
 * TripDetailScreen - overview of one trip: hero, summary and saved places.
 *
 * Route params: { tripId, tripName }
 */
export default function TripDetailScreen({ navigation, route }) {
  const { tripId, tripName } = route.params || {};
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isAuthReady } = useAuth();

  const [trip, setTrip] = useState(null);
  const [freshPhoto, setFreshPhoto] = useState(null);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null); // null | 'load' | 'notFound'

  const loadTrip = useCallback(async () => {
    setError(null);
    try {
      const data = await getTripById(tripId);
      setTrip(data);

      // Stored Google photo references expire, so re-resolve a fresh cover
      // from the destination's place id. Falls back to the stored cover.
      const placeId = data?.destinations?.[0]?.googlePlaceId;
      if (placeId) {
        getPlaceDetails(placeId)
          .then((details) => {
            if (details?.photoUrl) {
              setFreshPhoto(details.photoUrl);
              setPhotoBroken(false);
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        // Handled by the signed-out gate below once auth state updates.
      } else if (e?.status === 404) {
        setError('notFound');
      } else {
        setError('load');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tripId]);

  // Reload on focus so places added elsewhere show up when returning here.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady) return;
      if (!isAuthenticated) {
        setLoading(false);
        return;
      }
      loadTrip();
    }, [loadTrip, isAuthReady, isAuthenticated])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadTrip();
  };

  const destinations = trip?.destinations || [];
  const primaryDestination = destinations[0];
  const allPlaces = destinations.flatMap((d) => d.places || []);
  const heroUri = !photoBroken ? (freshPhoto || trip?.coverPhotoUrl || primaryDestination?.photoUrl) : null;

  const placesBySection = PLACE_SECTIONS
    .map((section) => ({
      ...section,
      items: allPlaces.filter((p) => sectionKeyFor(p.category) === section.key),
    }))
    .filter((section) => section.items.length > 0);

  const openPlace = (place) => {
    navigation.navigate('PlaceDetail', {
      placeId: place.placeId,
      name: place.placeName,
      vicinity: place.vicinity,
      photoUrl: place.photoUrl,
      rating: place.rating,
      category: place.category,
    });
  };

  // Jump to the Explore tab's destination page to find places to add.
  const exploreDestination = () => {
    if (!primaryDestination?.googlePlaceId) return;
    navigation.getParent()?.navigate('Explore', {
      screen: 'DestinationDetail',
      params: { placeId: primaryDestination.googlePlaceId, name: primaryDestination.name },
      initial: false,
    });
  };

  const backButton = (
    <TouchableOpacity
      style={[styles.backButton, { top: insets.top + SIZES.spacing_sm }]}
      onPress={() => navigation.goBack()}
      accessibilityLabel="Go back"
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
    </TouchableOpacity>
  );

  // Simple full-screen states (signed out, loading, error) with a back button.
  const renderState = (content) => (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      {backButton}
      <View style={styles.stateContainer}>{content}</View>
    </View>
  );

  if (isAuthReady && !isAuthenticated) {
    return renderState(
      <SignInPrompt
        icon="map-outline"
        title="Sign in to view this trip"
        subtitle="Your trips are saved to your account."
        onSignIn={() => navigation.navigate('Welcome')}
      />
    );
  }

  if (loading && !trip) {
    return renderState(
      <>
        {!!tripName && <Text style={styles.stateTitle}>{tripName}</Text>}
        <ActivityIndicator size="large" color={COLORS.accent} style={styles.stateSpinner} />
      </>
    );
  }

  if (error && !trip) {
    return renderState(
      <>
        <Ionicons
          name={error === 'notFound' ? 'map-outline' : 'cloud-offline-outline'}
          size={44}
          color={COLORS.textMuted}
        />
        <Text style={styles.stateTitle}>
          {error === 'notFound' ? 'Trip not found' : "Couldn't load this trip"}
        </Text>
        {error === 'notFound' ? (
          <Text style={styles.stateSubtitle}>It may have been deleted.</Text>
        ) : (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => { setLoading(true); loadTrip(); }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </>
    );
  }

  if (!trip) return renderState(null);

  const badge = statusStyle(trip.status);
  const dateRange = formatDateRange(trip.startDate, trip.endDate);
  const days = dayCount(trip.startDate, trip.endDate);
  const budget = formatBudget(trip.totalBudget, trip.currency);

  const stats = [
    { key: 'days', icon: 'calendar-outline', value: days ? String(days) : '–', label: days === 1 ? 'Day' : 'Days' },
    {
      key: 'travelers',
      icon: 'people-outline',
      value: String(trip.travelersCount || 1),
      label: (trip.travelersCount || 1) === 1 ? 'Traveler' : 'Travelers',
    },
    { key: 'places', icon: 'bookmark-outline', value: String(allPlaces.length), label: allPlaces.length === 1 ? 'Place' : 'Places' },
  ];
  if (budget) stats.push({ key: 'budget', icon: 'wallet-outline', value: budget, label: 'Budget' });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.white} />
        }
      >
        {/* Hero */}
        <View style={styles.hero}>
          {heroUri ? (
            <Image
              source={{ uri: heroUri }}
              style={styles.heroImage}
              onError={() => setPhotoBroken(true)}
            />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="image-outline" size={40} color={COLORS.textMuted} />
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
            style={styles.heroTopShade}
            pointerEvents="none"
          />
        </View>

        {/* Sheet overlapping the hero */}
        <View style={styles.sheet}>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
          </View>

          <Text style={styles.tripName}>{trip.name}</Text>

          {!!(trip.primaryDestination || primaryDestination?.name) && (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.metaText} numberOfLines={1}>
                {trip.primaryDestination || primaryDestination?.name}
              </Text>
            </View>
          )}
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{dateRange || 'Dates not set'}</Text>
          </View>

          {!!trip.description && <Text style={styles.description}>{trip.description}</Text>}

          {/* Summary */}
          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <View key={stat.key} style={styles.statTile}>
                <Ionicons name={stat.icon} size={18} color={COLORS.accent} />
                <Text style={styles.statValue} numberOfLines={1}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Saved places */}
          <Text style={styles.sectionTitle}>Saved places</Text>

          {placesBySection.length === 0 ? (
            <View style={styles.emptyPlaces}>
              <Ionicons name="bookmark-outline" size={36} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No places yet</Text>
              <Text style={styles.emptySubtitle}>
                Find stays, food and activities for this trip.
              </Text>
              {!!primaryDestination?.googlePlaceId && (
                <TouchableOpacity style={styles.emptyButton} onPress={exploreDestination} activeOpacity={0.9}>
                  <Text style={styles.emptyButtonText}>
                    Explore {primaryDestination.name}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            placesBySection.map((section) => (
              <View key={section.key} style={styles.placeSection}>
                <View style={styles.placeSectionHeader}>
                  <Ionicons name={section.icon} size={18} color={COLORS.textPrimary} />
                  <Text style={styles.placeSectionTitle}>{section.label}</Text>
                  <Text style={styles.placeSectionCount}>{section.items.length}</Text>
                </View>
                {section.items.map((place) => (
                  <TouchableOpacity
                    key={place.id}
                    style={styles.placeCard}
                    onPress={() => openPlace(place)}
                    activeOpacity={0.9}
                  >
                    {place.photoUrl ? (
                      <Image source={{ uri: place.photoUrl }} style={styles.placeImage} />
                    ) : (
                      <View style={[styles.placeImage, styles.placeImagePlaceholder]}>
                        <Ionicons name="image-outline" size={22} color={COLORS.textMuted} />
                      </View>
                    )}
                    <View style={styles.placeText}>
                      <Text style={styles.placeName} numberOfLines={1}>{place.placeName}</Text>
                      {!!place.vicinity && (
                        <Text style={styles.placeVicinity} numberOfLines={1}>{place.vicinity}</Text>
                      )}
                      {place.rating > 0 && (
                        <View style={styles.placeRating}>
                          <Ionicons name="star" size={12} color="#FFC107" />
                          <Text style={styles.placeRatingText}>{place.rating}</Text>
                        </View>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {backButton}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  // Clears the floating tab bar at the bottom.
  scrollContent: {
    paddingBottom: 150,
  },

  backButton: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 2,
  },

  // Hero
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: COLORS.cardBackground,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.borderLight,
  },
  heroTopShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },

  // Sheet that overlaps the bottom of the hero
  sheet: {
    marginTop: -SIZES.spacing_lg,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    marginBottom: SIZES.spacing_sm,
  },
  statusText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
  },
  tripName: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  metaText: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  description: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },

  // Summary tiles
  statsRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_lg,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_xs,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
  },
  statValue: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },

  // Saved places
  sectionTitle: {
    marginTop: SIZES.spacing_xl,
    marginBottom: SIZES.spacing_md,
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  placeSection: {
    marginBottom: SIZES.spacing_lg,
  },
  placeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SIZES.spacing_sm,
  },
  placeSectionTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  placeSectionCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  placeImage: {
    width: 64,
    height: 64,
    borderRadius: SIZES.radius_sm,
  },
  placeImagePlaceholder: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeText: {
    flex: 1,
  },
  placeName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  placeVicinity: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  placeRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  placeRatingText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },

  // Empty places
  emptyPlaces: {
    alignItems: 'center',
    paddingVertical: SIZES.spacing_xl,
    paddingHorizontal: SIZES.spacing_lg,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.cardBackground,
  },
  emptyTitle: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    marginTop: 2,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: SIZES.spacing_lg,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
  },
  emptyButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },

  // Loading / error states
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.spacing_xl,
  },
  stateSpinner: {
    marginTop: SIZES.spacing_base,
  },
  stateTitle: {
    marginTop: SIZES.spacing_base,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stateSubtitle: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
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
