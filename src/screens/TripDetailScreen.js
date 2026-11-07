import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  RefreshControl,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { COLORS, SIZES, TRIP_HERO_HEIGHT } from '../constants';
import { SignInPrompt, TripDetailSkeleton, FilterChips, TripMap, DestinationSheet, ChecklistTab, BudgetTab, ItineraryTab, ScreenHeader, EditTripSheet } from '../components';
import { showTripActionMenu, confirmDeleteTrip } from '../utils/tripActions';
import { useBottomBar } from '../context/BottomBarContext';
import useAuth from '../hooks/useAuth';
import {
  getTripById,
  getExpenses,
  getItinerary,
  getStoredUser,
  deleteTrip,
  addTripDestination,
  removeTripPlace,
  removeTripDestination,
  updateDestinationDates,
  AuthRequiredError,
} from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { formatDateRange, dayCount, daysUntil, formatDay } from '../utils/tripDates';
import { tripDays, isoToDay as itinDay, todayDay as itinToday, dayLabel as itinDayLabel, compareByTime } from '../utils/itinerary';

const HERO_HEIGHT = TRIP_HERO_HEIGHT;
const SHEET_BG = '#f3f5f7';
/** Trip sections, shown in the bottom bar beside the Home circle. */
const TRIP_TABS = [
  { key: 'overview', label: 'Overview', icon: 'compass' },
  { key: 'itinerary', label: 'Itinerary', icon: 'calendar' },
  { key: 'budget', label: 'Budget', icon: 'wallet' },
  { key: 'checklist', label: 'Checklist', icon: 'checkbox' },
];
// Bands of the progressive hero blur, as % of the blur area measured from its
// bottom. They stack, so the blur builds up toward the sheet.
const HERO_BLUR_BANDS = [
  { height: 100, intensity: 8 },
  { height: 75, intensity: 12 },
  { height: 50, intensity: 16 },
  { height: 30, intensity: 22 },
  { height: 15, intensity: 30 },
];
const HEADER_CONTENT_HEIGHT = 56;

/** Sections for saved places, in display order. */
const PLACE_SECTIONS = [
  { key: 'stays', label: 'Stays', icon: 'bed-outline' },
  { key: 'food', label: 'Restaurants', icon: 'restaurant-outline' },
  { key: 'activities', label: 'Activities', icon: 'walk-outline' },
];

/** Map the many category spellings the app/backend use onto a section key. */
function sectionKeyFor(category) {
  const c = (category || '').toLowerCase();
  if (c === 'stay' || c === 'stays') return 'stays';
  if (c === 'food' || c === 'restaurant' || c === 'restaurants') return 'food';
  // Anything that isn't a stay or a restaurant is treated as an activity.
  return 'activities';
}

/** Fades and slides a card up on mount, staggered by its position in the list. */
function FadeInCard({ index, children, style }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index, 8) * 70,
      useNativeDriver: true,
    }).start();
  }, [progress, index]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Section heading with a tinted icon bubble, used at the top of each card. */
function SectionTitle({ icon, tint, color, title }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={[styles.sectionIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
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

/** Tints for the countdown card's icon bubble, matching the section icons. */
const COUNTDOWN_TONES = {
  soon: { tint: '#fff1e8', color: COLORS.accent },
  later: { tint: '#e6f4fb', color: COLORS.primaryLight },
  done: { tint: '#e8f5e9', color: '#2e7d32' },
};

/**
 * Countdown copy for the trip, or null when there are no dates.
 * `progress` (0..1) is set while the trip is under way.
 */
function countdownInfo(trip) {
  const status = (trip.status || '').toLowerCase();
  const until = daysUntil(trip.startDate);
  const left = trip.endDate ? daysUntil(trip.endDate) : null;
  const startLabel = trip.startDate ? formatDay(new Date(trip.startDate), true) : null;
  const endLabel = trip.endDate ? formatDay(new Date(trip.endDate), true) : null;

  if (status === 'completed' || (left !== null && left < 0)) {
    return {
      icon: 'checkmark-circle', tone: 'done', value: 'Trip complete', label: '',
      sub: endLabel ? `Ended ${endLabel}` : 'Hope it was a good one',
    };
  }
  if (until === null) return null;
  if (until > 0) {
    return {
      icon: 'time', tone: until <= 7 ? 'soon' : 'later',
      value: String(until), label: until === 1 ? 'day to go' : 'days to go',
      sub: `Starts ${startLabel}`,
    };
  }
  if (until === 0) {
    return { icon: 'airplane', tone: 'soon', value: 'Today', label: 'your trip starts', sub: endLabel ? `Until ${endLabel}` : '' };
  }
  // Under way.
  const total = dayCount(trip.startDate, trip.endDate);
  const dayNo = 1 - until;
  return {
    icon: 'airplane', tone: 'soon',
    value: `Day ${dayNo}`, label: total ? `of ${total}` : 'of your trip',
    sub: endLabel ? `Ends ${endLabel}` : '',
    progress: total ? Math.min(1, dayNo / total) : null,
  };
}

/** Straight-line distance in km between two coordinates (haversine). */
function distanceKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km == null) return null;
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m from center`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km from center`;
}

/**
 * Best-effort neighborhood from Google's `vicinity` ("street, area, city"):
 * the last part that isn't the city itself or a street number.
 */
function neighborhoodOf(vicinity, cityName) {
  if (!vicinity) return null;
  const city = (cityName || '').split(',')[0].trim().toLowerCase();
  const parts = vicinity.split(',').map((p) => p.trim()).filter(Boolean);
  const useful = parts.filter((p) => {
    const lower = p.toLowerCase();
    if (city && (lower === city || lower.includes(city))) return false;
    // Skip street numbers / postcodes such as "570-8" or "1-2-3".
    return !/^[\d\s\-−‐,.#/]+$/.test(p) && (p.match(/\d/g) || []).length < 3;
  });
  return useful[useful.length - 1] || parts[0] || null;
}

function memberInitial(name) {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
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
  const { tripId } = route.params || {};
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isAuthReady } = useAuth();

  const [trip, setTrip] = useState(null);
  // Vertical scroll offset, drives the frosted header bar's fade-in.
  const scrollY = useRef(new Animated.Value(0)).current;

  // ── Section tabs in the bottom bar ─────────────────────────────────────
  const [activeTab, setActiveTab] = useState('overview');
  const isFocused = useIsFocused();
  const { setTabs, clearTabs } = useBottomBar();
  const tabsOwner = useRef(`trip-${tripId}-${Math.random().toString(36).slice(2)}`).current;

  // Overview and the other tabs use different layouts (cover photo vs plain
  // header), so each switch starts at the top with the header bar reset.
  const selectTab = useCallback((key) => {
    setActiveTab(key);
    scrollY.setValue(0);
  }, [scrollY]);
  // Bumped by pull-to-refresh on the work tabs so they reload their data.
  const [tabRefreshKey, setTabRefreshKey] = useState(0);
  const [tabHeaderHeight, setTabHeaderHeight] = useState(120);
  const [photoBroken, setPhotoBroken] = useState(false);
  // Which destination "Add place" targets (matters only for multi-stop trips).
  // Selected stop: its places are listed and "Add place" adds to it.
  const [addDestId, setAddDestId] = useState('');
  // Active tab of the saved-places switcher.
  const [placeTab, setPlaceTab] = useState('stays');
  // Destination sheet: null (closed) | { mode: 'add' } | { mode: 'edit', dest }
  const [destSheet, setDestSheet] = useState(null);
  // Destination id currently being removed (shows a spinner on its row).
  const [removingDestId, setRemovingDestId] = useState('');
  // Saved-place id currently being removed (shows a spinner on its row).
  const [removingPlaceId, setRemovingPlaceId] = useState('');
  // Saved-place ids whose thumbnail failed to load (shows the placeholder).
  const [brokenPlaceImages, setBrokenPlaceImages] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null); // null | 'load' | 'notFound'

  const loadTrip = useCallback(async () => {
    setError(null);
    try {
      const data = await getTripById(tripId);
      // Older backends don't send `myRole`; work it out from the member list
      // (each member has a userId and role) using the signed-in user's id.
      if (data && !data.myRole) {
        const me = await getStoredUser().catch(() => null);
        const mine = (data.members || []).find((m) => me?.id && m.userId === me.id);
        if (mine?.role) data.myRole = mine.role;
      }
      setTrip(data);
      setPhotoBroken(false);
      setBrokenPlaceImages({});
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

  const tripLoaded = !!trip;

  // Total spent, for the Overview budget card. Refreshed whenever Overview is
  // shown, so expenses added on the Budget tab are reflected.
  const [spentTotal, setSpentTotal] = useState(null);
  const [openBudgetSheet, setOpenBudgetSheet] = useState(false);
  // Owner trip actions (⋯ menu): edit sheet + delete.
  const [editOpen, setEditOpen] = useState(false);
  const [deletingTrip, setDeletingTrip] = useState(false);
  // Itinerary items, for the Overview "Next up" card.
  const [planItems, setPlanItems] = useState(null);
  useEffect(() => {
    if (!tripLoaded || activeTab !== 'overview' || !isFocused) return undefined;
    let cancelled = false;
    getExpenses(tripId)
      .then((list) => {
        if (!cancelled) setSpentTotal(list.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
      })
      .catch(() => { if (!cancelled) setSpentTotal(null); });
    getItinerary(tripId)
      .then((list) => { if (!cancelled) setPlanItems(list); })
      .catch(() => { if (!cancelled) setPlanItems(null); });
    return () => { cancelled = true; };
  }, [tripLoaded, activeTab, isFocused, tripId]);
  useEffect(() => {
    if (!isFocused || !tripLoaded) return;
    setTabs({ owner: tabsOwner, items: TRIP_TABS, activeKey: activeTab, onChange: selectTab });
  }, [isFocused, tripLoaded, activeTab, selectTab, setTabs, tabsOwner]);
  useEffect(() => {
    if (!isFocused) clearTabs(tabsOwner);
  }, [isFocused, clearTabs, tabsOwner]);
  useEffect(() => () => clearTabs(tabsOwner), [clearTabs, tabsOwner]);

  const onRefresh = () => {
    setRefreshing(true);
    loadTrip();
  };

  const destinations = trip?.destinations || [];
  const sortedDestinations = [...destinations].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const primaryDestination = sortedDestinations[0];
  // Viewers can look but not change anything. If the server didn't say (older
  // backend), assume editable: the server rejects viewers' edits anyway.
  const canEdit = (trip?.myRole || '').toLowerCase() !== 'viewer';
  const isOwner = (trip?.myRole || '').toLowerCase() === 'owner';

  const removeTrip = async () => {
    setDeletingTrip(true);
    try {
      await deleteTrip(trip.id);
      // Back to wherever the trip was opened from (My Trips reloads on focus).
      navigation.goBack();
    } catch (e) {
      setDeletingTrip(false);
      Alert.alert('Could not delete trip', e?.message || 'Please try again.');
    }
  };

  const openTripMenu = () => {
    if (!trip) return;
    showTripActionMenu({
      tripName: trip.name,
      onEdit: () => setEditOpen(true),
      onDelete: () => confirmDeleteTrip(trip.name, removeTrip),
    });
  };
  const addTarget = sortedDestinations.find((d) => d.id === addDestId) || primaryDestination;
  const allPlaces = destinations.flatMap((d) => d.places || []);
  // Multi-stop trips show one stop's places at a time (the selected stop).
  const multiStop = sortedDestinations.length > 1;
  const shownPlaces = multiStop ? (addTarget?.places || []) : allPlaces;
  const members = trip?.members || [];
  // The trip's traveller count can exceed the joined members (people who
  // haven't signed up), so draw one circle per traveller, not per member.
  const travellerCount = Math.max(members.length, trip?.travelersCount || 1);
  // Cover comes straight from the destination's place id (the backend keeps
  // it fresh), falling back to the stored cover photo.
  const heroUri = !photoBroken
    ? placePhotoUrl(primaryDestination?.googlePlaceId, 1200)
      || normalizePhotoUrl(trip?.coverPhotoUrl || primaryDestination?.photoUrl, 1200)
    : null;
  const placeThumbFor = (place) => (brokenPlaceImages[place.id]
    ? null
    : placePhotoUrl(place.placeId, 300) || normalizePhotoUrl(place.photoUrl, 300));

  // Every saved place (all tabs, respecting the destination filter) for the map.
  const mapPlaces = shownPlaces.map((p) => ({
    id: p.id,
    placeId: p.placeId,
    name: p.placeName,
    latitude: p.latitude,
    longitude: p.longitude,
    rating: p.rating,
    kind: sectionKeyFor(p.category),
    raw: p,
  }));
  // Each saved place's stop, for "N km from center".
  const destByPlaceId = {};
  destinations.forEach((d) => (d.places || []).forEach((p) => { destByPlaceId[p.id] = d; }));

  const tabPlaces = shownPlaces.filter((p) => sectionKeyFor(p.category) === placeTab);
  const activeSection = PLACE_SECTIONS.find((s) => s.key === placeTab) || PLACE_SECTIONS[0];

  // ── Destinations: add / edit dates / remove ────────────────────────────
  // The backend recalculates the trip's dates from destinations that have
  // dates. Trips created on mobile store dates on the trip only, so when no
  // stop has dates yet, the first stop is given the trip's dates in the same
  // request; otherwise the trip would shrink to just the edited stop.
  const backfillPrimary = (excludeId) => {
    if (!trip?.startDate && !trip?.endDate) return [];
    const anyDated = sortedDestinations.some(
      (d) => d.id !== excludeId && (d.startDate || d.endDate)
    );
    if (anyDated || !primaryDestination || primaryDestination.id === excludeId) return [];
    return [{
      destinationId: primaryDestination.id,
      startDate: trip.startDate || null,
      endDate: trip.endDate || null,
    }];
  };

  const handleAddDestination = async ({ destination, startDate, endDate }) => {
    const nextOrder = sortedDestinations.reduce((max, d) => Math.max(max, d.order ?? 0), -1) + 1;
    const created = await addTripDestination(trip.id, {
      ...destination,
      order: nextOrder,
      startDate,
      endDate,
    });
    if (created?.id && (startDate || endDate)) {
      await updateDestinationDates(trip.id, [
        ...backfillPrimary(created.id),
        { destinationId: created.id, startDate, endDate },
      ]);
    }
    setDestSheet(null);
    if (created?.id) setAddDestId(created.id);
    await loadTrip();
  };

  // From the Itinerary tab when the trip has no dates: date the first stop,
  // which makes the backend set the trip's dates too.
  const handleSetTripDates = async ({ startDate, endDate }) => {
    if (!primaryDestination) return;
    await updateDestinationDates(trip.id, [
      { destinationId: primaryDestination.id, startDate, endDate },
    ]);
    await loadTrip();
  };

  const handleEditDates = async ({ startDate, endDate }) => {
    const dest = destSheet?.dest;
    if (!dest) return;
    await updateDestinationDates(trip.id, [
      ...backfillPrimary(dest.id),
      { destinationId: dest.id, startDate, endDate },
    ]);
    setDestSheet(null);
    await loadTrip();
  };

  const confirmRemoveDestination = (dest) => {
    const count = (dest.places || []).length;
    Alert.alert(
      `Remove ${dest.name}?`,
      count > 0
        ? `Its ${count} saved ${count === 1 ? 'place' : 'places'} will be removed too.`
        : 'This stop will be removed from the trip.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingDestId(dest.id);
            try {
              await removeTripDestination(trip.id, dest.id);
              if (addDestId === dest.id) setAddDestId('');
              await loadTrip();
            } catch (e) {
              Alert.alert('Could not remove', e?.message || 'Please try again.');
            } finally {
              setRemovingDestId('');
            }
          },
        },
      ]
    );
  };

  // Remove a saved place: DELETE /api/trip-places/{id}, then drop it locally.
  const confirmRemovePlace = (place) => {
    Alert.alert(
      'Remove place?',
      `${place.placeName} will be removed from this trip.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingPlaceId(place.id);
            try {
              await removeTripPlace(place.id);
              setTrip((prev) => prev && ({
                ...prev,
                destinations: (prev.destinations || []).map((d) => ({
                  ...d,
                  places: (d.places || []).filter((p) => p.id !== place.id),
                })),
              }));
            } catch (e) {
              const message = e instanceof AuthRequiredError
                ? 'Sign in to edit this trip.'
                : (e?.message || 'Please try again.');
              Alert.alert('Could not remove place', message);
            } finally {
              setRemovingPlaceId('');
            }
          },
        },
      ]
    );
  };

  const openDestinationMenu = (dest, isPrimary) => {
    const buttons = [
      { text: 'Edit dates', onPress: () => setDestSheet({ mode: 'edit', dest }) },
    ];
    // The first stop is the trip's main destination and stays (same as the website).
    if (!isPrimary) {
      buttons.push({ text: 'Remove', style: 'destructive', onPress: () => confirmRemoveDestination(dest) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(dest.name, undefined, buttons);
  };

  const openPlace = (place) => {
    navigation.navigate('PlaceDetail', {
      placeId: place.placeId,
      name: place.placeName,
      vicinity: place.vicinity,
      photoUrl: placePhotoUrl(place.placeId, 800) || normalizePhotoUrl(place.photoUrl, 800),
      rating: place.rating,
      category: place.category,
    });
  };

  // Open the chosen destination in picking mode: its cards get an add/remove
  // toggle for this trip, and back returns here (the trip reloads on focus).
  const openAddPlaces = () => {
    if (!trip || !addTarget?.googlePlaceId) return;
    navigation.navigate('DestinationDetail', {
      placeId: addTarget.googlePlaceId,
      name: addTarget.name,
      secondary: '',
      pickForTrip: {
        tripId: trip.id,
        destinationId: addTarget.id,
        tripName: trip.name,
        // Already-saved places, so the picker can show its ticks immediately.
        saved: (addTarget.places || []).map((p) => [p.placeId, p.id]),
      },
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
      <Ionicons name="chevron-back" size={22} color={COLORS.white} />
    </TouchableOpacity>
  );

  // Owner-only ⋯ button, top right (opposite the back button).
  const renderMenuButton = (onHeader) => (isOwner ? (
    <TouchableOpacity
      style={[
        styles.backButton,
        styles.menuButton,
        onHeader && styles.backButtonOnHeader,
        { top: insets.top + (onHeader ? SIZES.spacing_base : SIZES.spacing_sm) },
      ]}
      onPress={openTripMenu}
      disabled={deletingTrip}
      accessibilityLabel="Trip options"
      accessibilityHint="Edit or delete this trip"
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {deletingTrip ? (
        <ActivityIndicator size="small" color={COLORS.white} />
      ) : (
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.white} />
      )}
    </TouchableOpacity>
  ) : null);

  const editSheet = (
    <EditTripSheet
      visible={editOpen}
      trip={trip}
      onClose={() => setEditOpen(false)}
      onSaved={() => { setEditOpen(false); loadTrip(); }}
    />
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
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <TripDetailSkeleton />
        {backButton}
      </View>
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

  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;
  // Fully visible just as the sheet's top edge reaches the bottom of the bar.
  const fadeEnd = HERO_HEIGHT - headerHeight - 12;
  const headerOpacity = scrollY.interpolate({
    inputRange: [fadeEnd - 60, fadeEnd],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Blur fades in over the first stretch of scrolling...
  const heroBlurOpacity = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT * 0.45],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // ...and its bottom stays on the sheet's top edge as the sheet rises.
  const heroBlurShift = scrollY.interpolate({
    inputRange: [0, HERO_HEIGHT],
    outputRange: [0, -HERO_HEIGHT],
    extrapolate: 'clamp',
  });

  const badge = statusStyle(trip.status);
  const dateRange = formatDateRange(trip.startDate, trip.endDate);
  const days = dayCount(trip.startDate, trip.endDate);
  const budget = formatBudget(trip.totalBudget, trip.currency);
  const countdown = countdownInfo(trip);
  const createdOn = trip.createdAt ? formatDay(new Date(trip.createdAt), true) : null;

  const stats = [
    { key: 'days', icon: 'calendar-outline', tint: '#fff1e8', color: COLORS.accent, value: days ? String(days) : '–', label: days === 1 ? 'Day' : 'Days' },
    {
      key: 'travelers',
      icon: 'people-outline',
      tint: '#e6f4fb',
      color: COLORS.primaryLight,
      value: String(trip.travelersCount || 1),
      label: (trip.travelersCount || 1) === 1 ? 'Traveler' : 'Travelers',
    },
    { key: 'places', icon: 'bookmark-outline', tint: '#e8f5e9', color: '#2e7d32', value: String(allPlaces.length), label: allPlaces.length === 1 ? 'Place' : 'Places' },
  ];
  if (budget) stats.push({ key: 'budget', icon: 'wallet-outline', tint: '#fff6e0', color: '#b7791f', value: budget, label: 'Budget' });

  // ── Itinerary / Budget / Checklist: plain header like My Trips, no photo ──
  if (activeTab !== 'overview') {
    const tabMeta = TRIP_TABS.find((t) => t.key === activeTab);
    return (
      <View style={[styles.container, { backgroundColor: SHEET_BG }]}>
        <StatusBar barStyle="dark-content" />
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.tabScroll, { paddingTop: tabHeaderHeight + SIZES.spacing_md }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setTabRefreshKey((k) => k + 1); onRefresh(); }}
              progressViewOffset={tabHeaderHeight}
            />
          }
        >
          <View key={`${activeTab}-${tabRefreshKey}`}>
              {activeTab === 'checklist' && <ChecklistTab tripId={trip.id} canEdit={canEdit} />}

              {activeTab === 'budget' && (
                <BudgetTab
                  trip={trip}
                  canEdit={canEdit}
                  openBudgetSheet={openBudgetSheet}
                  onBudgetSheetOpened={() => setOpenBudgetSheet(false)}
                  onBudgetSaved={({ totalBudget, currency }) =>
                    setTrip((prev) => prev && ({ ...prev, totalBudget, currency }))}
                />
              )}

              {activeTab === 'itinerary' && (
                <ItineraryTab
                  trip={trip}
                  sortedDests={sortedDestinations}
                  canEdit={canEdit}
                  onSetTripDates={handleSetTripDates}
                />
              )}
          </View>
        </ScrollView>

        <ScreenHeader
          title={tabMeta?.label || ''}
          subtitle={trip.name}
          onLayout={(e) => setTabHeaderHeight(e.nativeEvent.layout.height)}
        />

        {/* Back button sits on the white header, beside the title. */}
        <TouchableOpacity
          style={[styles.backButton, styles.backButtonOnHeader, { top: insets.top + SIZES.spacing_base }]}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        {renderMenuButton(true)}
        {editSheet}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

    {/* Hero stays fixed behind the scrolling sheet */}
      <View style={styles.hero}>
        {heroUri ? (
          <Image
            source={{ uri: heroUri }}
            style={styles.heroImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
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

        {/* Progressive blur: stacked blur bands, strongest at the bottom, that ride
            up with the sheet's top edge and fade in as you scroll. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.heroBlur,
            { opacity: heroBlurOpacity, transform: [{ translateY: heroBlurShift }] },
          ]}
        >
          {HERO_BLUR_BANDS.map((band) => (
            <BlurView
              key={band.height}
              intensity={band.intensity}
              tint="light"
              style={[styles.heroBlurBand, { height: `${band.height}%` }]}
            />
          ))}
          <LinearGradient
            colors={['rgba(243,245,247,0)', 'rgba(243,245,247,0.6)']}
            style={styles.heroBlurFade}
          />
        </Animated.View>
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.white} />
        }
      >
        {/* Transparent spacer: the fixed hero shows through it, and the sheet scrolls over the hero. */}
        <View style={styles.heroSpacer} pointerEvents="none" />

        {/* Sheet overlapping the hero */}
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {activeTab === 'overview' && (
          <>
          {/* Summary card */}
          <View style={styles.card}>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: badge.color }]} />
            <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
          </View>

          <Text style={styles.tripName}>{trip.name}</Text>

          <View style={styles.metaChips}>
            {!!(trip.primaryDestination || primaryDestination?.name) && (
              <View style={[styles.metaChip, { backgroundColor: '#e6f4fb' }]}>
                <Ionicons name="location" size={14} color={COLORS.primaryLight} />
                <Text style={[styles.metaChipText, { color: COLORS.primary }]} numberOfLines={1}>
                  {trip.primaryDestination || primaryDestination?.name}
                </Text>
              </View>
            )}
            <View style={[styles.metaChip, { backgroundColor: '#fff1e8' }]}>
              <Ionicons name="calendar" size={14} color={COLORS.accent} />
              <Text style={[styles.metaChipText, { color: COLORS.accentDeep }]}>
                {dateRange || 'Dates not set'}
              </Text>
            </View>
          </View>
          {!!trip.description && <Text style={styles.description}>{trip.description}</Text>}

          {/* Summary */}
          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <View key={stat.key} style={[styles.statTile, { backgroundColor: stat.tint }]}>
                <View style={styles.statIcon}>
                  <Ionicons name={stat.icon} size={16} color={stat.color} />
                </View>
                <Text style={styles.statValue} numberOfLines={1}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* Travellers */}
          <View
            style={styles.membersRow}
            accessible
            accessibilityLabel={`${travellerCount} ${travellerCount === 1 ? 'traveller' : 'travellers'}`}
          >
            {/* Overlapping circles: first shows initials, the rest a default profile icon. */}
            <View style={styles.avatarStack}>
              {Array.from({ length: Math.min(travellerCount, 5) }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.avatar,
                    i > 0 && styles.avatarOverlap,
                    i > 0 && styles.avatarDefault,
                    { zIndex: 10 - i },
                  ]}
                >
                  {i === 0 && members[0]?.name ? (
                    <Text style={styles.avatarText}>{memberInitial(members[0].name)}</Text>
                  ) : (
                    <Ionicons name="person" size={18} color={i === 0 ? COLORS.white : COLORS.textMuted} />
                  )}
                </View>
              ))}
              {travellerCount > 5 && (
                <View style={[styles.avatar, styles.avatarOverlap, styles.avatarDefault]}>
                  <Text style={styles.avatarMoreText}>+{travellerCount - 5}</Text>
                </View>
              )}
            </View>
            <Text style={styles.membersLabel}>
              {travellerCount} {travellerCount === 1 ? 'traveller' : 'travellers'}
            </Text>
          </View>
          </View>

          {/* Countdown card */}
          {countdown && (
            <View style={[styles.card, styles.countdownCard]}>
              <View style={styles.countdownRow}>
                <View style={[styles.countdownIcon, { backgroundColor: COUNTDOWN_TONES[countdown.tone].tint }]}>
                  <Ionicons name={countdown.icon} size={22} color={COUNTDOWN_TONES[countdown.tone].color} />
                </View>
                <View style={styles.countdownText}>
                  <Text style={styles.countdownLine} numberOfLines={1}>
                    <Text style={[styles.countdownValue, { color: COUNTDOWN_TONES[countdown.tone].color }]}>
                      {countdown.value}
                    </Text>
                    {!!countdown.label && <Text style={styles.countdownLabel}>{`  ${countdown.label}`}</Text>}
                  </Text>
                  {!!countdown.sub && <Text style={styles.countdownSub}>{countdown.sub}</Text>}
                </View>
              </View>
              {countdown.progress != null && (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(countdown.progress * 100)}%`, backgroundColor: COUNTDOWN_TONES[countdown.tone].color },
                    ]}
                  />
                </View>
              )}
            </View>
          )}

          {/* Budget card: tap to open the Budget tab */}
          {(trip.totalBudget > 0 || isOwner || spentTotal > 0) && (() => {
            const total = trip.totalBudget || 0;
            const spent = spentTotal || 0;
            const ratio = total > 0 ? spent / total : 0;
            const barColor = ratio >= 1 ? COLORS.error : ratio >= 0.8 ? '#d97706' : '#2e7d32';
            const setUp = !total && isOwner;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => {
                  if (setUp) setOpenBudgetSheet(true);
                  selectTab('budget');
                }}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={setUp ? 'Set a budget for this trip' : 'Open budget'}
              >
                <View style={styles.sectionHeaderRow}>
                  <SectionTitle icon="wallet" tint="#fff6e0" color="#b7791f" title="Budget" />
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </View>
                {setUp ? (
                  <View style={styles.budgetSetup}>
                    <Text style={styles.budgetSetupText}>
                      Set a budget to track spending and see how much is left.
                    </Text>
                    <View style={styles.addStopButton}>
                      <Ionicons name="add" size={16} color={COLORS.primary} />
                      <Text style={styles.addStopText}>Set budget</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.budgetLine}>
                      <Text style={styles.budgetSpent}>{formatBudget(spent, trip.currency) || '0'}</Text>
                      <Text style={styles.budgetOf}>
                        {total ? `  spent of ${formatBudget(total, trip.currency)}` : '  spent'}
                      </Text>
                    </Text>
                    {total > 0 && (
                      <>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${Math.min(100, Math.round(ratio * 100))}%`, backgroundColor: barColor },
                            ]}
                          />
                        </View>
                        <Text style={[styles.budgetLeft, spent > total && { color: COLORS.error }]}>
                          {spent <= total
                            ? `${formatBudget(total - spent, trip.currency)} left`
                            : `${formatBudget(spent - total, trip.currency)} over budget`}
                        </Text>
                      </>
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })()}

          {/* Itinerary card: next planned item; tap to open the Itinerary tab */}
          {(() => {
            const planDays = tripDays(trip, sortedDestinations);
            if (!planDays.length) return null;
            const list = planItems || [];
            const firstDay = planDays[0].day;
            const lastDay = planDays[planDays.length - 1].day;
            const today = itinToday();
            const inTrip = list.filter((i) => {
              const d = itinDay(i.scheduledDate);
              return d >= firstDay && d <= lastDay;
            });
            const fromDay = Math.max(today, firstDay);
            const next = inTrip
              .filter((i) => itinDay(i.scheduledDate) >= fromDay)
              .sort((a, b) => itinDay(a.scheduledDate) - itinDay(b.scheduledDate) || compareByTime(a, b))[0];
            const plannedDays = new Set(inTrip.map((i) => itinDay(i.scheduledDate))).size;
            const nextDayNo = next ? itinDay(next.scheduledDate) - firstDay + 1 : null;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => selectTab('itinerary')}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel="Open itinerary"
              >
                <View style={styles.sectionHeaderRow}>
                  <SectionTitle icon="calendar" tint="#e6f4fb" color={COLORS.primaryLight} title="Itinerary" />
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
                </View>
                {next ? (
                  <>
                    <Text style={styles.planLabel}>
                      Next up · Day {nextDayNo}, {itinDayLabel(itinDay(next.scheduledDate))}
                    </Text>
                    <Text style={styles.planTitle} numberOfLines={1}>
                      {next.title}
                      {next.startTime ? <Text style={styles.planTime}>{`  ${next.startTime}`}</Text> : null}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.budgetSetupText}>
                    {inTrip.length ? 'All planned days are behind you.' : 'Nothing planned yet. Map out each day of the trip.'}
                  </Text>
                )}
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round((plannedDays / planDays.length) * 100)}%`,
                        backgroundColor: COLORS.primaryLight,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.budgetLeft}>{plannedDays} of {planDays.length} days planned</Text>
              </TouchableOpacity>
            );
          })()}

          {/* Destinations card */}
          <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <SectionTitle icon="navigate" tint="#e6f4fb" color={COLORS.primaryLight} title="Destinations" />
            {canEdit && (
              <TouchableOpacity
                style={styles.addStopButton}
                onPress={() => setDestSheet({ mode: 'add' })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add a destination"
              >
                <Ionicons name="add" size={16} color={COLORS.primary} />
                <Text style={styles.addStopText}>Add stop</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.timeline}>
            {sortedDestinations.map((d, i) => {
              const range = formatDateRange(d.startDate, d.endDate);
              const count = (d.places || []).length;
              const multi = sortedDestinations.length > 1;
              const active = multi && addTarget?.id === d.id;
              const isPrimary = i === 0;
              return (
                <TouchableOpacity
                  key={d.id}
                  style={styles.timelineRow}
                  onPress={() => {
                    if (!multi) return;
                    setAddDestId(d.id);
                  }}
                  activeOpacity={multi ? 0.85 : 1}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityHint={multi ? 'Shows this stop\'s saved places' : undefined}
                >
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, (active || !multi) && styles.timelineDotActive]}>
                      <Text style={styles.timelineDotText}>{i + 1}</Text>
                    </View>
                    {i < sortedDestinations.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={[styles.timelineBody, active && styles.timelineBodyActive]}>
                    <View style={styles.timelineText}>
                      <Text style={styles.timelineName} numberOfLines={1}>{d.name}</Text>
                      <Text style={styles.timelineMeta} numberOfLines={1}>
                        {range || 'Dates not set'} · {count} {count === 1 ? 'place' : 'places'}
                      </Text>
                    </View>
                    {removingDestId === d.id ? (
                      <ActivityIndicator size="small" color={COLORS.accent} />
                    ) : canEdit && (
                      <TouchableOpacity
                        style={styles.timelineMore}
                        onPress={() => openDestinationMenu(d, isPrimary)}
                        accessibilityRole="button"
                        accessibilityLabel={`Options for ${d.name}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          </View>

          {/* Saved places card */}
          <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <SectionTitle icon="bookmark" tint="#fff1e8" color={COLORS.accent} title="Saved places" />
            {canEdit && !!addTarget?.googlePlaceId && (
              <TouchableOpacity
                style={styles.addStopButton}
                onPress={openAddPlaces}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Add a place to ${addTarget.name}`}
              >
                <Ionicons name="add" size={16} color={COLORS.primary} />
                <Text style={styles.addStopText}>Add place</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Stop switcher: picks whose places are listed below (and where "Add place" adds). */}
          {multiStop && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.destPillsScroll}
              contentContainerStyle={styles.destPills}
            >
              {sortedDestinations.map((d) => {
                const active = d.id === addTarget?.id;
                const count = (d.places || []).length;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.destPill, active && styles.destPillActive]}
                    onPress={() => setAddDestId(d.id)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${d.name}, ${count} ${count === 1 ? 'place' : 'places'}`}
                  >
                    <Ionicons name="location" size={13} color={active ? COLORS.white : COLORS.textMuted} />
                    <Text style={[styles.destPillText, active && styles.destPillTextActive]} numberOfLines={1}>
                      {d.name}
                    </Text>
                    <View style={[styles.destPillCount, active && styles.destPillCountActive]}>
                      <Text style={[styles.destPillCountText, active && styles.destPillTextActive]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <FilterChips
            filters={PLACE_SECTIONS}
            activeKey={placeTab}
            onChange={setPlaceTab}
            variant="pills"
            compact
            fullWidth
          />
          <View style={styles.placeList} key={`${placeTab}-${addTarget?.id || ''}`}>
            {tabPlaces.length === 0 ? (
              <View style={styles.emptyPlaces}>
                <Ionicons name={activeSection.icon} size={36} color={COLORS.textMuted} />
                <Text style={styles.emptyTitle}>No {activeSection.label.toLowerCase()} yet</Text>
                <Text style={styles.emptySubtitle}>
                  {canEdit
                    ? `Find ${activeSection.label.toLowerCase()} for this trip.`
                    : 'Nothing has been saved here yet.'}
                </Text>
                {canEdit && !!addTarget?.googlePlaceId && (
                  <TouchableOpacity style={styles.emptyButton} onPress={openAddPlaces} activeOpacity={0.9}>
                    <Text style={styles.emptyButtonText}>
                      Add places in {addTarget.name}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.placeRows}>
                {tabPlaces.map((place, index) => {
                  const dest = destByPlaceId[place.id];
                  const area = neighborhoodOf(place.vicinity, dest?.name);
                  const distance = formatDistance(
                    distanceKm(place.latitude, place.longitude, dest?.latitude, dest?.longitude)
                  );
                  const locationLine = [area, distance].filter(Boolean).join(' · ');
                  return (
                    <FadeInCard key={place.id} index={index}>
                      <TouchableOpacity
                        style={styles.placeRow}
                        onPress={() => openPlace(place)}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={[
                          place.placeName,
                          locationLine,
                          place.rating > 0 ? `rated ${place.rating}` : null,
                        ].filter(Boolean).join(', ')}
                      >
                        {placeThumbFor(place) ? (
                          <Image
                            source={{ uri: placeThumbFor(place) }}
                            style={styles.placeThumb}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={200}
                            onError={() => setBrokenPlaceImages((prev) => ({ ...prev, [place.id]: true }))}
                          />
                        ) : (
                          <View style={[styles.placeThumb, styles.placeImagePlaceholder]}>
                            <Ionicons name={activeSection.icon} size={20} color={COLORS.textMuted} />
                          </View>
                        )}
                        <View style={styles.placeRowBody}>
                          <Text style={styles.placeRowName} numberOfLines={1}>{place.placeName}</Text>
                          {!!locationLine && (
                            <Text style={styles.placeRowArea} numberOfLines={1}>{locationLine}</Text>
                          )}
                          {place.rating > 0 && (
                            <View style={styles.ratingPill}>
                              <Ionicons name="star" size={11} color="#f59e0b" />
                              <Text style={styles.ratingPillText}>
                                {place.rating}
                                {place.userRatingsTotal > 0 ? ` · ${place.userRatingsTotal.toLocaleString()}` : ''}
                              </Text>
                            </View>
                          )}
                        </View>
                        {canEdit && (
                          removingPlaceId === place.id ? (
                            <View style={styles.removePlaceButton}>
                              <ActivityIndicator size="small" color={COLORS.error} />
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={styles.removePlaceButton}
                              onPress={() => confirmRemovePlace(place)}
                              disabled={!!removingPlaceId}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${place.placeName} from this trip`}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="trash-outline" size={17} color={COLORS.error} />
                            </TouchableOpacity>
                          )
                        )}
                      </TouchableOpacity>
                    </FadeInCard>
                  );
                })}
              </View>
            )}
          </View>

          </View>

          {/* Map card */}
          {mapPlaces.some((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) && (
            <View style={styles.card}>
              <View style={styles.sectionHeaderRow}>
                <SectionTitle icon="map" tint="#e8f5e9" color="#2e7d32" title="On the map" />
              </View>
              <TripMap places={mapPlaces} onPressPlace={(p) => openPlace(p.raw)} />
            </View>
          )}

          {!!createdOn && <Text style={styles.createdText}>Created {createdOn}</Text>}
          </>
          )}
        </View>
      </Animated.ScrollView>

      {/* Frosted header bar: fades in once the sheet reaches the top, so the back button sits on it. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.headerBar,
          { height: headerHeight, opacity: headerOpacity },
        ]}
      >
        <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[styles.headerBarContent, { paddingTop: insets.top }]}>
          <Text style={styles.headerBarTitle} numberOfLines={1}>{trip.name}</Text>
        </View>
      </Animated.View>

      <DestinationSheet
        visible={!!destSheet}
        editing={destSheet?.mode === 'edit' ? destSheet.dest : null}
        existingPlaceIds={sortedDestinations.map((d) => d.googlePlaceId)}
        suggestedStart={sortedDestinations[sortedDestinations.length - 1]?.endDate || null}
        onClose={() => setDestSheet(null)}
        onSubmit={destSheet?.mode === 'edit' ? handleEditDates : handleAddDestination}
      />

      {backButton}
      {renderMenuButton(false)}
      {editSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    flexGrow: 1,
  },

  backButton: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(4,50,71,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 2,
  },

  // Frosted header bar
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(4,50,71,0.15)',
  },
  headerBarContent: {
    flex: 1,
    justifyContent: 'center',
    // Leaves room for the back button on the left, mirrored on the right.
    paddingHorizontal: SIZES.spacing_lg + 38 + SIZES.spacing_sm,
  },
  headerBarTitle: {
    textAlign: 'center',
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },

  // Hero
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
  },
  heroBlur: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Bottom edge sits where the sheet's top edge starts.
    bottom: SIZES.spacing_lg,
    height: '60%',
  },
  heroBlurBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroBlurFade: {
    ...StyleSheet.absoluteFillObject,
  },
  heroSpacer: {
    height: HERO_HEIGHT,
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
    // Soft grey canvas so each white section card stands apart.
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_md,
    // Clears the floating tab bar; padding (not scroll padding) keeps the grey canvas to the bottom.
    paddingBottom: 150,
    flexGrow: 1,
  },
  // One white card per section.
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
    borderWidth: 1,
    borderColor: '#e9edf1',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  planLabel: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  planTitle: {
    marginTop: 2,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  planTime: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primaryLight,
  },
  budgetSetup: {
    gap: SIZES.spacing_md,
    alignItems: 'flex-start',
  },
  budgetSetupText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  budgetLine: {
    flexShrink: 1,
  },
  budgetSpent: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  budgetOf: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  budgetLeft: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  // Work tabs (no cover photo)
  tabScroll: {
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: 150,
  },
  menuButton: {
    left: undefined,
    right: SIZES.spacing_lg,
    paddingRight: 0,
  },
  // Above the floating ScreenHeader (zIndex 20).
  backButtonOnHeader: {
    zIndex: 30,
    elevation: 9,
  },
  comingSoon: {
    alignItems: 'center',
    paddingVertical: SIZES.spacing_xl,
    gap: SIZES.spacing_xs,
  },
  comingSoonTitle: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  comingSoonText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    flexShrink: 1,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: SIZES.spacing_md,
    backgroundColor: COLORS.border,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  metaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_xs,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
  },
  metaChipText: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    color: COLORS.primary,
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
    borderRadius: SIZES.radius_lg,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginBottom: 2,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
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

  // Countdown
  countdownCard: {
    paddingVertical: SIZES.spacing_md,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  countdownIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countdownText: {
    flex: 1,
  },
  countdownLine: {
    flexShrink: 1,
  },
  countdownValue: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
  },
  countdownLabel: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  countdownSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  progressTrack: {
    height: 6,
    marginTop: SIZES.spacing_md,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: COLORS.borderLight,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Members
  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_md,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  avatarText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  avatarDefault: {
    backgroundColor: COLORS.borderLight,
  },
  avatarMoreText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  membersLabel: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },

  // Destination timeline
  timeline: {
    marginBottom: SIZES.spacing_xs,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timelineRail: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 22,
    height: 22,
    marginTop: 14,
    borderRadius: 11,
    backgroundColor: COLORS.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  timelineText: {
    flex: 1,
  },
  timelineMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  addStopText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  timelineDotActive: {
    backgroundColor: COLORS.accent,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: COLORS.borderLight,
  },
  timelineBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginLeft: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  timelineBodyActive: {
    borderColor: COLORS.accent,
    backgroundColor: '#fff8f3',
  },
  timelineName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  timelineMeta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  createdText: {
    marginTop: SIZES.spacing_xs,
    textAlign: 'center',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },

  // Saved places
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_md,
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  destPillsScroll: {
    flexGrow: 0,
    marginBottom: SIZES.spacing_md,
  },
  destPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  destPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: SIZES.spacing_md,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  destPillCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 11,
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  destPillCountActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  destPillCountText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  destPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  destPillText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  destPillTextActive: {
    color: COLORS.white,
  },
  placeList: {
    marginTop: SIZES.spacing_md,
  },
  // Full-width place rows: thumbnail left, details right.
  placeRows: {
    gap: SIZES.spacing_sm,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: 6,
    paddingRight: SIZES.spacing_md,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#eef1f4',
    backgroundColor: COLORS.white,
  },
  placeThumb: {
    width: 62,
    height: 62,
    borderRadius: 20,
  },
  placeImagePlaceholder: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePlaceButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeRowBody: {
    flex: 1,
    gap: 1,
  },
  placeRowName: {
    fontSize: SIZES.md,
    lineHeight: 18,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  placeRowArea: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  ratingPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#fff7e6',
  },
  ratingPillText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: '#8a5a00',
  },

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
