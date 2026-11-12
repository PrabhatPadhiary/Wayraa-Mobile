import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  RefreshControl,
  Animated,
  ActivityIndicator,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import RatingRow from '../components/RatingRow';
import { COLORS, SIZES, TRIP_HERO_HEIGHT } from '../constants';
import { SignInPrompt, TripDetailSkeleton, TripMap, DestinationSheet, ChecklistTab, BudgetTab, ItineraryTab, ScreenHeader, EditTripSheet, TravellersSheet } from '../components';
import { avatarColorFor, initialsFor } from '../components/TripStackCard';
import TripHero from '../components/TripHero';
import { showTripActionMenu, confirmDeleteTrip } from '../utils/tripActions';
import { useBottomBar } from '../context/BottomBarContext';
import useAuth from '../hooks/useAuth';
import {
  getTripById,
  getExpenses,
  getItinerary,
  getStoredUser,
  deleteTrip,
  getMyTrips,
  addTripDestination,
  removeTripPlace,
  removeTripDestination,
  updateDestinationDates,
  setPrimaryDestination,
  AuthRequiredError,
} from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { formatDateRange, dayCount, daysUntil, formatDay } from '../utils/tripDates';
import { tripDays, isoToDay as itinDay, todayDay as itinToday, dayLabel as itinDayLabel, compareByTime } from '../utils/itinerary';
import { showAlert } from '../components/AppDialog';
import { LoaderOverlay } from '../components/WayraaLoader';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

const HERO_HEIGHT = TRIP_HERO_HEIGHT;
// Scroll offset where the compact top bar is fully in (same as the place page).
const HEADER_SHOW_AT = 60;
const SHEET_BG = '#f3f5f7';
/** Trip sections, shown in the bottom bar beside the Home circle. */
// Feather line icons: one even stroke weight, so they stay crisp and calm
// (the active tab is shown by color and the capsule, not a filled glyph).
const TRIP_TABS = [
  { key: 'overview', label: 'Overview', icon: 'compass', iconFamily: 'feather' },
  { key: 'itinerary', label: 'Itinerary', icon: 'calendar', iconFamily: 'feather' },
  { key: 'budget', label: 'Budget', icon: 'credit-card', iconFamily: 'feather' },
  { key: 'checklist', label: 'Checklist', icon: 'check-square', iconFamily: 'feather' },
];
// Progressive hero blur: one blur layer, masked by a vertical gradient so it
// goes smoothly from sharp (top) to fully blurred (bottom, at the sheet edge).
// A single masked layer avoids the visible steps that stacked bands produce.

/** Sections for saved places, in display order. */
/** Place type filters on the overview. `noun` is used in empty-state copy. */
const PLACE_FILTERS = [
  { key: 'all', label: 'All', icon: 'bookmark-outline', noun: 'places' },
  { key: 'stays', label: 'Stays', icon: 'bed-outline', noun: 'stays' },
  { key: 'food', label: 'Food', icon: 'restaurant-outline', noun: 'restaurants' },
  { key: 'activities', label: 'Activities', icon: 'walk-outline', noun: 'activities' },
];
// Saved spots in the list layout: past this many, the list scrolls inside
// its card, tall enough for about this many rows (62 px photo rows + gaps).
const SPOTS_LIST_PREVIEW = 5;
const SPOTS_LIST_MAX_HEIGHT = SPOTS_LIST_PREVIEW * 76 + (SPOTS_LIST_PREVIEW - 1) * SIZES.spacing_sm + 20;

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

/** Icon colors for the countdown pill on the hero, by tone. */
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
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m from centre`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km from centre`;
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
  // Dark status bar text once the frosted (light) header covers the photo.
  const [darkStatusBar, setDarkStatusBar] = useState(false);
  const darkStatusBarRef = useRef(false);

  // ── Section tabs in the bottom bar ─────────────────────────────────────
  const [activeTab, setActiveTab] = useState('overview');
  // Itinerary drag and drop: a layer above the page (drag card, drop bar,
  // undo toast) and the page frozen while dragging.
  const [tabOverlay, setTabOverlay] = useState(null);
  const [tabScrollLocked, setTabScrollLocked] = useState(false);
  // The tab page's scroll, so a drag near the screen edge can move the page
  // (programmatic scrolling still works while the user's scrolling is locked).
  const tabScrollRef = useRef(null);
  const tabScrollPos = useRef({ y: 0, max: 0, viewH: 0 });
  const scrollTabPageBy = useCallback((dy) => {
    const p = tabScrollPos.current;
    const next = Math.max(0, Math.min(p.max, p.y + dy));
    if (next === p.y) return false;
    p.y = next;
    tabScrollRef.current?.scrollTo({ y: next, animated: false });
    return true;
  }, []);
  const isFocused = useIsFocused();
  const { setTabs, clearTabs } = useBottomBar();
  const tabsOwner = useRef(`trip-${tripId}-${Math.random().toString(36).slice(2)}`).current;

  // Overview and the other tabs use different layouts (cover photo vs plain
  // header), so each switch starts at the top with the header bar reset.
  const selectTab = useCallback((key) => {
    setActiveTab(key);
    scrollY.setValue(0);
    // Overview reopens at the top, under the photo: light status bar again.
    darkStatusBarRef.current = false;
    setDarkStatusBar(false);
  }, [scrollY]);

  // Budget / Itinerary / Checklist are sections of this screen, not screens of
  // their own, so "back" from one returns to Overview instead of leaving the
  // trip. Android: the hardware back button / gesture.
  useFocusEffect(
    useCallback(() => {
      if (activeTab === 'overview') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        selectTab('overview');
        return true; // handled: don't leave the trip
      });
      return () => sub.remove();
    }, [activeTab, selectTab])
  );
  // iOS: the edge-swipe would leave the trip, so it's off while in a section
  // (the header back button returns to Overview instead).
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: activeTab === 'overview' });
  }, [navigation, activeTab]);
  // Bumped by pull-to-refresh on the work tabs so they reload their data.
  const [tabRefreshKey, setTabRefreshKey] = useState(0);
  const [tabHeaderHeight, setTabHeaderHeight] = useState(120);
  // Which destination "Add place" targets (matters only for multi-stop trips).
  // Selected stop: its places are listed and "Add place" adds to it.
  const [addDestId, setAddDestId] = useState('');
  // Active tab of the saved-places switcher.
  const [placeTab, setPlaceTab] = useState('all');
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
  // Travellers sheet: who's on the trip, and inviting friends.
  const [travellersOpen, setTravellersOpen] = useState(false);
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

  // Memoised: tabs (e.g. the itinerary) depend on this list staying the same
  // object between renders.
  const sortedDestinations = useMemo(
    () => [...(trip?.destinations || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [trip?.destinations]
  );
  const destinations = trip?.destinations || [];
  // The primary destination (name on cards, cover photo) is chosen separately
  // from the route order; older trips without one use the first stop.
  const primaryDestination = sortedDestinations.find((d) => d.id === trip?.primaryDestinationId)
    || sortedDestinations[0];
  // Viewers can look but not change anything. If the server didn't say (older
  // backend), assume editable: the server rejects viewers' edits anyway.
  const canEdit = (trip?.myRole || '').toLowerCase() !== 'viewer';
  const isOwner = (trip?.myRole || '').toLowerCase() === 'owner';
  // Owners and editors can invite people (same rule as the backend).
  const canInvite = ['owner', 'member'].includes((trip?.myRole || '').toLowerCase());

  const removeTrip = async () => {
    setDeletingTrip(true);
    try {
      await deleteTrip(trip.id);
      // Other trips left: back to the My Trips list. That was the only one:
      // Home (My Trips is reset underneath, showing its empty state next time).
      let left = 1;
      try {
        left = (await getMyTrips()).length;
      } catch {
        // Couldn't check: My Trips is a safe place to land.
      }
      navigation.popToTop();
      if (left === 0) navigation.getParent()?.navigate('Explore');
    } catch (e) {
      setDeletingTrip(false);
      showAlert('Could not delete trip', e?.message || 'Please try again.');
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
  // Hero photos: one per stop, the primary destination first, then the rest in
  // route order. Each comes straight from the stop's place id (the backend keeps
  // it fresh), falling back to its stored photo (and the trip cover for the
  // primary). TripHero shows a gradient for any stop whose photo is missing.
  const heroStops = primaryDestination
    ? [primaryDestination, ...sortedDestinations.filter((d) => d.id !== primaryDestination.id)]
    : sortedDestinations;
  const heroPhotos = heroStops.length
    ? heroStops.map((d, i) => ({
      key: String(d.id),
      name: d.name,
      uri: placePhotoUrl(d.googlePlaceId, 1200)
        || normalizePhotoUrl(i === 0 ? (trip?.coverPhotoUrl || d.photoUrl) : d.photoUrl, 1200),
    }))
    : [{
      key: 'cover',
      name: trip?.primaryDestination || trip?.name || '',
      uri: normalizePhotoUrl(trip?.coverPhotoUrl, 1200),
    }];
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

  const tabPlaces = placeTab === 'all'
    ? shownPlaces
    : shownPlaces.filter((p) => sectionKeyFor(p.category) === placeTab);
  const activeSection = PLACE_FILTERS.find((s) => s.key === placeTab) || PLACE_FILTERS[0];

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

  // Stops are kept in date order by the backend (the primary destination
  // never changes when they move), so a reload shows the new order.
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
    showAlert(
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
              showAlert('Could not remove', e?.message || 'Please try again.');
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
    showAlert(
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
              showAlert('Could not remove place', message);
            } finally {
              setRemovingPlaceId('');
            }
          },
        },
      ]
    );
  };

  const makePrimary = async (dest) => {
    try {
      await setPrimaryDestination(trip.id, dest.id);
      await loadTrip();
    } catch (e) {
      showAlert('Could not change it', e?.message || 'Please try again.');
    }
  };

  const openDestinationMenu = (dest, isPrimary) => {
    const buttons = [];
    if (!isPrimary) {
      buttons.push({ text: 'Make primary destination', onPress: () => makePrimary(dest) });
    }
    buttons.push({ text: 'Edit dates', onPress: () => setDestSheet({ mode: 'edit', dest }) });
    // The primary destination stays; make another stop primary to remove it.
    if (!isPrimary) {
      buttons.push({ text: 'Remove', style: 'destructive', onPress: () => confirmRemoveDestination(dest) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    showAlert(dest.name, isPrimary ? 'Primary destination' : undefined, buttons);
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
        // What was on the stop when adding started, so "Done · 3 added"
        // counts only this visit (kept as it's passed from screen to screen).
        initial: (addTarget.places || []).map((p) => p.placeId),
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

  // Round button on the overview photo (same look as the place page).
  const heroRoundButton = (icon, onPress, label, busy = false) => (
    <TouchableOpacity
      style={styles.roundButton}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {busy
        ? <ActivityIndicator size="small" color={COLORS.white} />
        : <Ionicons name={icon} size={20} color={COLORS.white} />}
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

  // Compact bar (same as the place page): takes over as soon as the photo
  // starts moving up, about when the round hero buttons reach the status bar.
  const headerOpacity = scrollY.interpolate({
    inputRange: [HEADER_SHOW_AT - 40, HEADER_SHOW_AT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // Flip the status bar to dark text once the light header is mostly in.
  const onOverviewScroll = (e) => {
    const dark = e.nativeEvent.contentOffset.y > HEADER_SHOW_AT - 20;
    if (dark !== darkStatusBarRef.current) {
      darkStatusBarRef.current = dark;
      setDarkStatusBar(dark);
    }
  };

  const badge = statusStyle(trip.status);
  const dateRange = formatDateRange(trip.startDate, trip.endDate);
  const days = dayCount(trip.startDate, trip.endDate);
  // Countdown pill on the hero ("9 days to go", "Day 3 of 8", ...), with its
  // icon color picked by tone.
  const countdownBase = countdownInfo(trip);
  const countdown = countdownBase
    ? { ...countdownBase, color: COUNTDOWN_TONES[countdownBase.tone]?.color }
    : null;
  const createdOn = trip.createdAt ? formatDay(new Date(trip.createdAt), true) : null;

  // Shared by the Saved spots card and list layouts.
  const spotInfo = (place) => {
    const dest = destByPlaceId[place.id];
    const area = neighborhoodOf(place.vicinity, dest?.name);
    const distance = formatDistance(
      distanceKm(place.latitude, place.longitude, dest?.latitude, dest?.longitude)
    );
    return {
      locationLine: [area, distance].filter(Boolean).join(' · '),
      section: PLACE_FILTERS.find((f) => f.key === sectionKeyFor(place.category)),
      thumb: placeThumbFor(place),
    };
  };
  const spotLabel = (place, locationLine) => [
    place.placeName,
    locationLine,
    place.rating > 0 ? `rated ${place.rating}` : null,
  ].filter(Boolean).join(', ');
  const renderRemoveSpot = (place, style, iconSize) => {
    if (!canEdit) return null;
    if (removingPlaceId === place.id) {
      return (
        <View style={style}>
          <ActivityIndicator size="small" color={COLORS.error} />
        </View>
      );
    }
    return (
      <TouchableOpacity
        style={style}
        onPress={() => confirmRemovePlace(place)}
        disabled={!!removingPlaceId}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${place.placeName} from this trip`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={iconSize} color={COLORS.error} />
      </TouchableOpacity>
    );
  };

  // ── Itinerary: the day's map fills the screen; the plan sits in a bottom
  // sheet you drag between peek, half and full, so the map is always there. ──
  if (activeTab === 'itinerary') {
    return (
      <View style={[styles.container, { backgroundColor: SHEET_BG }]}>
        <StatusBar barStyle="dark-content" />
        <ItineraryTab
          key={`itinerary-${tabRefreshKey}`}
          trip={trip}
          sortedDests={sortedDestinations}
          canEdit={canEdit}
          onSetTripDates={handleSetTripDates}
          renderOverlay={setTabOverlay}
          sheet
          heroControls={(
            <View style={[styles.heroControls, { top: insets.top + SIZES.spacing_sm }]} pointerEvents="box-none">
              {heroRoundButton('chevron-back', () => selectTab('overview'), 'Back to overview')}
              {isOwner && heroRoundButton('ellipsis-horizontal', openTripMenu, 'Trip options', deletingTrip)}
            </View>
          )}
        />
        {tabOverlay}
        {editSheet}
      </View>
    );
  }

  // ── Budget / Checklist: plain header like My Trips, no photo ──
  if (activeTab !== 'overview') {
    const tabMeta = TRIP_TABS.find((t) => t.key === activeTab);
    return (
      <View style={[styles.container, { backgroundColor: SHEET_BG }]}>
        <StatusBar barStyle="dark-content" />
        <ScrollView
          ref={tabScrollRef}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!tabScrollLocked}
          scrollEventThrottle={16}
          onScroll={(e) => { tabScrollPos.current.y = e.nativeEvent.contentOffset.y; }}
          onLayout={(e) => {
            const p = tabScrollPos.current;
            p.viewH = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, h) => {
            const p = tabScrollPos.current;
            p.max = Math.max(0, h - p.viewH);
          }}
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
          onPress={() => selectTab('overview')}
          accessibilityLabel="Back to overview"
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
      <StatusBar barStyle={darkStatusBar ? 'dark-content' : 'light-content'} animated />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: onOverviewScroll,
        })}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.white} />
        }
      >
        {/* Hero: stop photos (swipe), title and countdown; scrolls with the page. */}
        <TripHero
          title={trip.name}
          countdown={countdown}
          photos={heroPhotos}
          height={HERO_HEIGHT}
          bottomInset={SIZES.spacing_lg}
        >
          {/* Round buttons on the photo, like the place page. */}
          <View style={[styles.heroControls, { top: insets.top + SIZES.spacing_sm }]} pointerEvents="box-none">
            {heroRoundButton('chevron-back', () => navigation.goBack(), 'Go back')}
            {isOwner && heroRoundButton('ellipsis-horizontal', openTripMenu, 'Trip options', deletingTrip)}
          </View>
        </TripHero>

        {/* Sheet overlapping the hero */}
        <View style={styles.sheet}>

          {activeTab === 'overview' && (
          <>
          {/* Summary: status + dates, three key numbers, and who's going
              (opens the Travellers sheet to see everyone and invite friends). */}
          <View style={[styles.card, styles.summaryCard]}>
            <View style={styles.summaryTop}>
              <View style={styles.summaryDateIcon}>
                <Ionicons name="calendar" size={18} color={COLORS.accent} />
              </View>
              <View style={styles.summaryDateText}>
                <Text style={styles.summaryDates} numberOfLines={1}>{dateRange || 'Dates not set'}</Text>
                <Text style={styles.summaryDatesSub} numberOfLines={1}>
                  {days ? `${days} ${days === 1 ? 'day' : 'days'}` : 'Add dates to plan each day'}
                </Text>
              </View>
              <View style={[styles.statusBadge, styles.statusBadgeInline, { backgroundColor: badge.bg }]}>
                <View style={[styles.statusDot, { backgroundColor: badge.color }]} />
                <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            </View>

            {!!trip.description && <Text style={styles.description}>{trip.description}</Text>}

            <View style={styles.summaryStats}>
              {[
                { key: 'days', value: days || '–', label: days === 1 ? 'Day' : 'Days' },
                { key: 'stops', value: sortedDestinations.length || 1, label: sortedDestinations.length === 1 ? 'Stop' : 'Stops' },
                { key: 'spots', value: allPlaces.length, label: allPlaces.length === 1 ? 'Spot' : 'Spots' },
              ].map((stat, i) => (
                <View
                  key={stat.key}
                  style={[styles.summaryStat, i > 0 && styles.summaryStatDivider]}
                  accessible
                  accessibilityLabel={`${stat.value} ${stat.label}`}
                >
                  <Text style={styles.summaryStatValue}>{stat.value}</Text>
                  <Text style={styles.summaryStatLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.travellersRow}
              onPress={() => setTravellersOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`${travellerCount} ${travellerCount === 1 ? 'traveller' : 'travellers'}${canInvite ? ', invite friends' : ''}`}
            >
              <View style={styles.avatarStack}>
                {Array.from({ length: Math.min(travellerCount, 4) }, (_, i) => {
                  const m = members[i];
                  return (
                    <View
                      key={m?.userId || `t${i}`}
                      style={[
                        styles.avatar,
                        styles.avatarSmall,
                        i > 0 && styles.avatarOverlap,
                        { zIndex: 10 - i, backgroundColor: m ? avatarColorFor(m.name) : COLORS.borderLight },
                      ]}
                    >
                      {m?.photoUrl ? (
                        <Image source={{ uri: cloudinarySized(m.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} contentFit="cover" />
                      ) : m ? (
                        <Text style={styles.avatarTextSmall}>{initialsFor(m.name)}</Text>
                      ) : (
                        <Ionicons name="person" size={13} color={COLORS.textMuted} />
                      )}
                    </View>
                  );
                })}
                {travellerCount > 4 && (
                  <View style={[styles.avatar, styles.avatarSmall, styles.avatarOverlap, styles.avatarDefault]}>
                    <Text style={styles.avatarMoreText}>+{travellerCount - 4}</Text>
                  </View>
                )}
              </View>
              <View style={styles.travellersText}>
                <Text style={styles.travellersTitle} numberOfLines={1}>
                  {travellerCount} {travellerCount === 1 ? 'traveller' : 'travellers'}
                </Text>
                {members.length > 0 && (
                  <Text style={styles.travellersNames} numberOfLines={1}>
                    {members.map((m) => (m.name || '').split(' ')[0]).filter(Boolean).join(', ')}
                  </Text>
                )}
              </View>
              {canInvite ? (
                <View style={styles.inviteButton}>
                  <Ionicons name="person-add" size={14} color={COLORS.white} />
                  <Text style={styles.inviteButtonText}>Invite</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              )}
            </TouchableOpacity>
          </View>

          {/* Destinations card: the trip's stops. On multi-stop trips, tapping a stop
              picks whose places the Places card below shows. */}
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
              const isPrimary = d.id === primaryDestination?.id;
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
                      <View style={styles.timelineNameRow}>
                        <Text style={styles.timelineName} numberOfLines={1}>{d.name}</Text>
                        {isPrimary && multi && (
                          <View style={styles.primaryBadge}>
                            <Text style={styles.primaryBadgeText}>Primary</Text>
                          </View>
                        )}
                      </View>
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

          {/* Saved spots: a simple header with one Add button (Explore, which
              has its own search), light type filters, and the list. */}
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.flexShrink}>
                <View style={styles.placesTitleRow}>
                  <SectionTitle icon="bookmark" tint="#fff1e8" color={COLORS.accent} title="Saved spots" />
                  <Text style={styles.sectionCount}>{allPlaces.length}</Text>
                </View>
                {!!addTarget && (
                  <Text style={styles.spotsWhere} numberOfLines={1}>In {addTarget.name}</Text>
                )}
              </View>
              {canEdit && !!addTarget?.googlePlaceId && (
                <TouchableOpacity
                  style={styles.addStopButton}
                  onPress={openAddPlaces}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Add spots in ${addTarget.name}`}
                >
                  <Ionicons name="add" size={16} color={COLORS.primary} />
                  <Text style={styles.addStopText}>Add</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Type filters: plain text chips with counts. */}
            {allPlaces.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spotFilters}>
                {PLACE_FILTERS.map((f) => {
                  const on = f.key === placeTab;
                  const n = f.key === 'all'
                    ? shownPlaces.length
                    : shownPlaces.filter((p) => sectionKeyFor(p.category) === f.key).length;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.spotFilter, on && styles.spotFilterOn]}
                      onPress={() => setPlaceTab(f.key)}
                      activeOpacity={0.8}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${f.label}, ${n}`}
                    >
                      <Text style={[styles.spotFilterText, on && styles.spotFilterTextOn]}>{f.label}</Text>
                      <Text style={[styles.spotFilterCount, on && styles.spotFilterCountOn]}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <View style={styles.placeList} key={`${placeTab}-${addTarget?.id || ''}`}>
              {tabPlaces.length === 0 ? (
                <View style={styles.emptyPlaces}>
                  <Ionicons name={activeSection.icon} size={36} color={COLORS.textMuted} />
                  <Text style={styles.emptyTitle}>No {activeSection.noun} yet</Text>
                  <Text style={styles.emptySubtitle}>
                    {canEdit
                      ? `Tap Add to find ${activeSection.noun} for this trip.`
                      : 'Nothing has been saved here yet.'}
                  </Text>
                  {canEdit && !!addTarget?.googlePlaceId && (
                    <TouchableOpacity style={styles.emptyButton} onPress={openAddPlaces} activeOpacity={0.9}>
                      <Text style={styles.emptyButtonText}>Add places in {addTarget.name}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                // Past 5 spots the list scrolls inside the card (about 5 rows show).
                <ScrollView
                  style={tabPlaces.length > SPOTS_LIST_PREVIEW ? { maxHeight: SPOTS_LIST_MAX_HEIGHT } : null}
                  contentContainerStyle={styles.placeRows}
                  nestedScrollEnabled
                  scrollEnabled={tabPlaces.length > SPOTS_LIST_PREVIEW}
                  showsVerticalScrollIndicator={tabPlaces.length > SPOTS_LIST_PREVIEW}
                >
                  {tabPlaces.map((place, index) => {
                    const { locationLine, section, thumb } = spotInfo(place);
                    return (
                      <FadeInCard key={place.id} index={index}>
                        <TouchableOpacity
                          style={styles.placeRow}
                          onPress={() => openPlace(place)}
                          activeOpacity={0.9}
                          accessibilityRole="button"
                          accessibilityLabel={spotLabel(place, locationLine)}
                        >
                          {thumb ? (
                            <Image
                              source={{ uri: thumb }}
                              style={styles.placeThumb}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              transition={200}
                              onError={() => setBrokenPlaceImages((prev) => ({ ...prev, [place.id]: true }))}
                            />
                          ) : (
                            <View style={[styles.placeThumb, styles.placeImagePlaceholder]}>
                              <Ionicons name={section?.icon || 'bookmark-outline'} size={20} color={COLORS.textMuted} />
                            </View>
                          )}
                          <View style={styles.placeRowBody}>
                            <Text style={styles.placeRowName} numberOfLines={1}>{place.placeName}</Text>
                            {!!locationLine && (
                              <Text style={styles.placeRowArea} numberOfLines={1}>{locationLine}</Text>
                            )}
                            {place.rating > 0 && (
                              <RatingRow rating={place.rating} reviews={place.userRatingsTotal} style={styles.placeRowRating} />
                            )}
                          </View>
                          {renderRemoveSpot(place, styles.removePlaceButton, 17)}
                        </TouchableOpacity>
                      </FadeInCard>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          </View>

          {/* Budget + Itinerary: compact side-by-side tiles; tap to open the tab. */}
          {(() => {
            const showBudget = trip.totalBudget > 0 || isOwner || spentTotal > 0;
            const planDays = tripDays(trip, sortedDestinations);
            const showPlan = planDays.length > 0;
            if (!showBudget && !showPlan) return null;

            let budgetTile = null;
            if (showBudget) {
              const total = trip.totalBudget || 0;
              const spent = spentTotal || 0;
              const ratio = total > 0 ? spent / total : 0;
              const barColor = ratio >= 1 ? COLORS.error : ratio >= 0.8 ? '#d97706' : '#2e7d32';
              const setUp = !total && isOwner;
              budgetTile = (
                <TouchableOpacity
                  style={[styles.card, styles.tile]}
                  onPress={() => {
                    if (setUp) setOpenBudgetSheet(true);
                    selectTab('budget');
                  }}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={setUp ? 'Set a budget for this trip' : 'Open budget'}
                >
                  <View style={styles.tileHeader}>
                    <SectionTitle icon="wallet" tint="#fff6e0" color="#b7791f" title="Budget" />
                  </View>
                  {setUp ? (
                    <>
                      <Text style={styles.tileValueMuted}>Not set</Text>
                      <Text style={styles.tileLink}>+ Set budget</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.tileValue} numberOfLines={1}>
                        {formatBudget(spent, trip.currency) || '0'}
                      </Text>
                      <Text style={styles.tileSub} numberOfLines={1}>
                        {total ? `of ${formatBudget(total, trip.currency)}` : 'spent'}
                      </Text>
                      {total > 0 && (
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${Math.min(100, Math.round(ratio * 100))}%`, backgroundColor: barColor },
                            ]}
                          />
                        </View>
                      )}
                    </>
                  )}
                </TouchableOpacity>
              );
            }

            let planTile = null;
            if (showPlan) {
              const list = planItems || [];
              const firstDay = planDays[0].day;
              const lastDay = planDays[planDays.length - 1].day;
              const inTrip = list.filter((it) => {
                const d = itinDay(it.scheduledDate);
                return d >= firstDay && d <= lastDay;
              });
              const fromDay = Math.max(itinToday(), firstDay);
              const next = inTrip
                .filter((it) => itinDay(it.scheduledDate) >= fromDay)
                .sort((a, b) => itinDay(a.scheduledDate) - itinDay(b.scheduledDate) || compareByTime(a, b))[0];
              const plannedDays = new Set(inTrip.map((it) => itinDay(it.scheduledDate))).size;
              planTile = (
                <TouchableOpacity
                  style={[styles.card, styles.tile]}
                  onPress={() => selectTab('itinerary')}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={`Open itinerary, ${plannedDays} of ${planDays.length} days planned`}
                >
                  <View style={styles.tileHeader}>
                    <SectionTitle icon="calendar" tint="#e6f4fb" color={COLORS.primaryLight} title="Itinerary" />
                  </View>
                  <Text style={styles.tileValue} numberOfLines={1}>
                    {plannedDays}<Text style={styles.tileValueOf}>{` / ${planDays.length}`}</Text>
                  </Text>
                  <Text style={styles.tileSub} numberOfLines={1}>
                    {next ? `Next: ${next.title}` : inTrip.length ? 'All done' : 'days planned'}
                  </Text>
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
                </TouchableOpacity>
              );
            }

            return (
              <View style={styles.tilesRow}>
                {budgetTile}
                {planTile}
              </View>
            );
          })()}

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

      {/* Compact bar that fades in once the photo scrolls away (same as the place page). */}
      <Animated.View
        style={[styles.stickyHeader, { opacity: headerOpacity, paddingTop: insets.top }]}
        pointerEvents={darkStatusBar ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.stickyButton} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.stickyTitle} numberOfLines={1}>{trip.name}</Text>
        {isOwner ? (
          <TouchableOpacity
            style={styles.stickyButton}
            onPress={openTripMenu}
            disabled={deletingTrip}
            accessibilityLabel="Trip options"
            accessibilityHint="Edit or delete this trip"
          >
            {deletingTrip
              ? <ActivityIndicator size="small" color={COLORS.textPrimary} />
              : <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textPrimary} />}
          </TouchableOpacity>
        ) : (
          <View style={styles.stickyButtonSpacer} />
        )}
      </Animated.View>

      <DestinationSheet
        visible={!!destSheet}
        editing={destSheet?.mode === 'edit' ? destSheet.dest : null}
        existingPlaceIds={sortedDestinations.map((d) => d.googlePlaceId)}
        suggestedStart={sortedDestinations[sortedDestinations.length - 1]?.endDate || null}
        otherStops={sortedDestinations.filter((d) => d.id !== destSheet?.dest?.id)}
        onClose={() => setDestSheet(null)}
        onSubmit={destSheet?.mode === 'edit' ? handleEditDates : handleAddDestination}
      />

      {editSheet}
      <TravellersSheet
        visible={travellersOpen}
        trip={trip}
        onClose={() => setTravellersOpen(false)}
        onChanged={loadTrip}
      />
      {/* Waiting: the animated logo over the page (which can't be touched meanwhile). */}
      <LoaderOverlay visible={deletingTrip} message="Deleting trip…" />
    </View>
  );
}

const styles = StyleSheet.create({
  // Rating under a saved spot's name.
  placeRowRating: {
    marginTop: 3,
  },
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

  // Compact bar (same as the place page)
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
  // Round buttons on the photo (same as the place page)
  heroControls: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },

  // Sheet that overlaps the bottom of the hero
  sheet: {
    marginTop: -SIZES.spacing_lg,
    // Soft grey canvas so each white section card stands apart.
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_base,
    // Clears the floating tab bar; padding (not scroll padding) keeps the grey canvas to the bottom.
    paddingBottom: 150,
    flexGrow: 1,
  },
  // ── Overview: summary ──
  summaryCard: {
    paddingBottom: SIZES.spacing_md,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  summaryDateIcon: {
    width: 40,
    height: 40,
    borderRadius: SIZES.radius_md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff1e8',
  },
  summaryDateText: {
    flex: 1,
    minWidth: 0,
  },
  summaryDates: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  summaryDatesSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  // Three numbers split by hairlines.
  summaryStats: {
    flexDirection: 'row',
    marginTop: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  summaryStatDivider: {
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  summaryStatValue: {
    fontSize: SIZES.xl,
    lineHeight: 28,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  summaryStatLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  travellersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_md,
  },
  travellersText: {
    flex: 1,
    minWidth: 0,
  },
  travellersTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  travellersNames: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    // Deeper orange keeps the small white label readable (theme note).
    backgroundColor: COLORS.accentDeep,
  },
  inviteButtonText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  statusBadgeInline: {
    marginBottom: 0,
  },
  avatarSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  avatarTextSmall: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },

  // ── Overview: places ──
  sectionCount: {
    minWidth: 26,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
    backgroundColor: '#fff1e8',
  },
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  spotsWhere: {
    marginTop: 2,
    marginLeft: 38,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  spotFilters: {
    gap: 6,
    paddingTop: SIZES.spacing_md,
    paddingBottom: SIZES.spacing_sm,
  },
  spotFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
  },
  spotFilterOn: {
    backgroundColor: COLORS.primary,
  },
  spotFilterText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  spotFilterTextOn: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
  },
  spotFilterCount: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  spotFilterCountOn: {
    color: 'rgba(255,255,255,0.75)',
  },
  placesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    flexShrink: 1,
  },
  // ── Overview: destinations (stop timeline) ──
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
  timelineDotActive: {
    backgroundColor: COLORS.accent,
  },
  timelineDotText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
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
  timelineText: {
    flex: 1,
  },
  timelineNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#fff1e8',
  },
  primaryBadgeText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  timelineName: {
    flexShrink: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  timelineMeta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  timelineMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  // ── Saved spots: list layout ──
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
  removePlaceButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Overview: budget / itinerary tiles ──
  tilesRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
  },
  tile: {
    flex: 1,
    minWidth: 0,
  },
  tileHeader: {
    marginBottom: SIZES.spacing_sm,
  },
  tileValue: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  tileValueOf: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  tileValueMuted: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  tileSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  tileLink: {
    marginTop: 2,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
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
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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

  // Countdown
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
  avatarDefault: {
    backgroundColor: COLORS.borderLight,
  },
  avatarMoreText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },

  // Destination timeline
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
  placeList: {
    marginTop: SIZES.spacing_md,
  },
  // Full-width place rows: thumbnail left, details right.
  placeImagePlaceholder: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
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
