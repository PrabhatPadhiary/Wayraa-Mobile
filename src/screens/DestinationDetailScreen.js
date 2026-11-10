import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  FlatList,
  ScrollView,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import RatingRow from '../components/RatingRow';
import { FilterChips, GridSkeleton } from '../components';
import FilterSheet from '../components/FilterSheet';
import PickToggle from '../components/PickToggle';
import { useBottomBar } from '../context/BottomBarContext';
import {
  getPlaceDetails,
  getPlacesByCategory,
  getPlacesByFilter,
  getFavourites,
  addFavourite,
  removeFavourite,
  getTripById,
  addPlaceToTrip,
  removeTripPlace,
  placeCoords,
  AuthRequiredError,
} from '../services';
import { buildTripPlaceDto, toTripCategory } from '../utils/tripPlaces';


/**
 * Category tabs. `apiCategory` maps the UI label to the backend category
 * expected by /Destinations/places (restaurants | stays | activities).
 */
const CATEGORIES = [
  { key: 'stays', label: 'Stays', icon: 'bed-outline', apiCategory: 'stays' },
  { key: 'food', label: 'Food', icon: 'restaurant-outline', apiCategory: 'restaurants' },
  { key: 'activities', label: 'Activities', icon: 'walk-outline', apiCategory: 'activities' },
];

// Filter chips per category — mirrors the website exactly.
// 'All' restores the cached base result with no extra API call.
const CATEGORY_FILTERS = {
  stays:      ['All', 'Hotels', 'Resorts', 'Boutique', 'Hostels', 'Villas'],
  food:       ['All', 'Fine Dining', 'Cafes', 'Street Food', 'Bars', 'Rooftop'],
  activities: ['All', 'Temples', 'Museums', 'Beaches', 'Adventure', 'Nightlife'],
};

// Icons for the filter sheet's option cards (Ionicons).
const FILTER_ICONS = {
  Hotels: 'business-outline', Resorts: 'umbrella-outline', Boutique: 'diamond-outline',
  Hostels: 'bed-outline', Villas: 'home-outline',
  'Fine Dining': 'wine-outline', Cafes: 'cafe-outline', 'Street Food': 'fast-food-outline',
  Bars: 'beer-outline', Rooftop: 'partly-sunny-outline',
  Temples: 'flower-outline', Museums: 'library-outline', Beaches: 'water-outline',
  Adventure: 'trail-sign-outline', Nightlife: 'moon-outline',
};

/**
 * DestinationDetailScreen - shows a searched place with its Stays / Food /
 * Activities, and a (stubbed) Create trip CTA.
 *
 * Route params: { placeId, name, secondary, pickForTrip }
 *
 * `pickForTrip` ({ tripId, destinationId, tripName }) turns this into a place
 * picker for that trip: each card gets an add/remove toggle instead of a heart,
 * and the bottom button becomes "Done".
 */
export default function DestinationDetailScreen({ navigation, route }) {
  const { placeId, name, secondary, pickForTrip } = route.params || {};
  const insets = useSafeAreaInsets();

  // Header panel top offset clears the Dynamic Island / status bar. The panel's
  // full height is measured (onLayout) so the list can start below it.
  const heroTop = insets.top + SIZES.spacing_sm;
  const [headerHeight, setHeaderHeight] = useState(0);
  // A little breathing room between the header's bottom edge and the first cards.
  const contentTop = headerHeight + SIZES.spacing_base;

  const [details, setDetails] = useState(null);
  const [activeCategory, setActiveCategory] = useState('stays');
  // Results + load state cached per category so switching tabs is instant on revisit.
  const [resultsByCategory, setResultsByCategory] = useState({});
  const [loadingCategory, setLoadingCategory] = useState({});
  const [errorCategory, setErrorCategory] = useState({});
  // Active filter chip per category — 'All' means show base category results.
  const [activeChips, setActiveChips] = useState({ stays: 'All', food: 'All', activities: 'All' });
  // Filtered results (chip !== 'All') — stored separately so base cache isn't overwritten.
  const [filteredResults, setFilteredResults] = useState(null);
  const [loadingFilter, setLoadingFilter] = useState(false);

  const activeChip = activeChips[activeCategory] || 'All';
  const activeResults = activeChip === 'All'
    ? (resultsByCategory[activeCategory] || [])
    : (filteredResults || []);
  const isLoading = activeChip === 'All'
    ? (!!loadingCategory[activeCategory] && !resultsByCategory[activeCategory])
    : loadingFilter;
  const hasError = !!errorCategory[activeCategory];

  // ── "See all" and "Search in <destination>" (not while picking for a trip) ──
  const destinationName = name || details?.name || 'this place';
  const categoryMeta = CATEGORIES.find((c) => c.key === activeCategory) || CATEGORIES[0];
  const openSearch = () => navigation.navigate('DestinationPlaces', {
    placeId,
    destinationName,
    mode: 'search',
    // For live suggestions limited to this destination.
    coords: placeCoords(details),
    // While adding to a trip, search adds to the same stop (with its ticks).
    pickForTrip: pickForTrip
      ? { ...pickForTrip, saved: Array.from(pickedMap.entries()) }
      : undefined,
  });
  const openSeeAll = () => navigation.navigate('DestinationPlaces', {
    placeId,
    destinationName,
    mode: 'browse',
    categoryKey: activeCategory,
    apiCategory: categoryMeta.apiCategory,
    categoryLabel: activeChip === 'All' ? categoryMeta.label : activeChip,
    filters: CATEGORY_FILTERS[activeCategory] || ['All'],
    filter: activeChip,
  });

  // ── Header collapses on scroll ──
  // Scrolling down folds the subtitle and the search bar away and shrinks the
  // title; a 🔍 icon in the title row keeps search one tap away. Near the top
  // it opens again. (Thresholds differ so it doesn't flicker at the edge.)
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  // Filters bottom sheet (replaces the row of filter chips).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const collapseAnim = useRef(new Animated.Value(0)).current; // 0 open, 1 collapsed
  useEffect(() => {
    Animated.timing(collapseAnim, {
      toValue: headerCollapsed ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animating heights and font size
    }).start();
  }, [headerCollapsed, collapseAnim]);
  const onListScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 40 && !headerCollapsed) setHeaderCollapsed(true);
    else if (y < 15 && headerCollapsed) setHeaderCollapsed(false);
  };
  // Filters button (opens the sheet). Orange tint + dot while a filter is on.
  const renderFiltersButton = (size = 44) => (
    <TouchableOpacity
      style={[
        styles.filtersButton,
        { width: size, height: size, borderRadius: size / 2 },
        activeChip !== 'All' && styles.filtersButtonOn,
      ]}
      onPress={() => setFiltersOpen(true)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={activeChip === 'All' ? 'Filters' : `Filter: ${activeChip}. Change filters`}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
    >
      <Ionicons name="options-outline" size={18} color={activeChip !== 'All' ? COLORS.accentDeep : COLORS.textPrimary} />
      {activeChip !== 'All' && <View style={styles.filtersDot} />}
    </TouchableOpacity>
  );

  const fold = (max) => ({
    maxHeight: collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [max, 0] }),
    opacity: collapseAnim.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
    overflow: 'hidden',
  });

  // Load the header photo/details once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const d = await getPlaceDetails(placeId);
      if (!cancelled) setDetails(d);
    })();
    return () => { cancelled = true; };
  }, [placeId]);

  // Fetch results for a category (cached; refetch on error/empty allowed).
  const loadCategory = useCallback(async (categoryKey) => {
    const cat = CATEGORIES.find((c) => c.key === categoryKey);
    if (!cat || !placeId) return;

    setLoadingCategory((prev) => ({ ...prev, [categoryKey]: true }));
    setErrorCategory((prev) => ({ ...prev, [categoryKey]: false }));
    try {
      const data = await getPlacesByCategory(placeId, cat.apiCategory);
      setResultsByCategory((prev) => ({ ...prev, [categoryKey]: data }));
    } catch (e) {
      setErrorCategory((prev) => ({ ...prev, [categoryKey]: true }));
    } finally {
      setLoadingCategory((prev) => ({ ...prev, [categoryKey]: false }));
    }
  }, [placeId]);

  // Load whenever the active category changes and isn't cached yet.
  useEffect(() => {
    if (!resultsByCategory[activeCategory] && !loadingCategory[activeCategory]) {
      loadCategory(activeCategory);
    }
    // Reset filter chip and results when switching category
    setFilteredResults(null);
  }, [activeCategory, resultsByCategory, loadingCategory, loadCategory]);

  // Handle chip selection — 'All' restores cache, others call /filter endpoint.
  const handleChipSelect = useCallback(async (chip) => {
    setActiveChips((prev) => ({ ...prev, [activeCategory]: chip }));
    if (chip === 'All') {
      setFilteredResults(null);
      return;
    }
    setLoadingFilter(true);
    setFilteredResults(null);
    try {
      const data = await getPlacesByFilter(placeId, chip.toLowerCase());
      setFilteredResults(data);
    } catch (_) {
      setFilteredResults([]);
    } finally {
      setLoadingFilter(false);
    }
  }, [activeCategory, placeId]);

  // Drive the shared persistent tab bar (collapse + CTA) via context.
  const { setCollapsed, setCta, reset } = useBottomBar();

  const handleCreateTrip = useCallback(() => {
    // The backend sends { latitude, longitude }; placeCoords reads either shape.
    const location = placeCoords(details);
    navigation.navigate('CreateTrip', {
      placeId,
      name: name || details?.name,
      secondary: secondary || details?.formattedAddress,
      photoUrl: details?.photoUrl,
      lat: location?.lat,
      lng: location?.lng,
    });
  }, [navigation, placeId, name, secondary, details]);

  // While focused, the shared tab bar stays collapsed (Home circle) with a
  // permanent "Create a trip" button beside it — not only after scrolling.
  // Cleared when leaving. The picking CTA ("Add (N)") is kept in sync by a
  // separate effect below so a count change doesn't reset the bar.
  useFocusEffect(
    useCallback(() => {
      if (!pickForTrip) {
        setCollapsed(true);
        setCta({ label: 'Create a trip', icon: 'add-circle-outline', onPress: handleCreateTrip });
      }
      return () => reset();
    }, [setCta, setCollapsed, reset, handleCreateTrip, pickForTrip])
  );

  // ── Trip picking (only when opened with `pickForTrip`) ─────────────────────
  // placeId -> trip place id, for the places already saved in the target
  // destination. An empty-string id means "saved, id not known yet".
  // Seeded from the trip screen (`pickForTrip.saved`: [placeId, tripPlaceId]
  // pairs) so ticks show instantly; the focus refresh below then syncs with
  // the server in the background.
  const [pickedMap, setPickedMap] = useState(() => new Map(pickForTrip?.saved || []));
  // False until we know which places are saved (no seed and first fetch pending),
  // so toggles don't flash "+" on places that are actually added.
  const [pickedReady, setPickedReady] = useState(() => Array.isArray(pickForTrip?.saved));
  const [pickPending, setPickPending] = useState(() => new Set());
  const isFocused = useIsFocused();
  const pickTripId = pickForTrip?.tripId;
  const pickDestId = pickForTrip?.destinationId;

  const loadPicked = useCallback(async () => {
    if (!pickTripId) return new Map();
    const full = await getTripById(pickTripId);
    const dest = (full?.destinations || []).find((d) => d.id === pickDestId);
    const map = new Map((dest?.places || []).map((p) => [p.placeId, p.id]));
    setPickedMap(map);
    setPickedReady(true);
    return map;
  }, [pickTripId, pickDestId]);

  useFocusEffect(
    useCallback(() => {
      if (!pickTripId) return undefined;
      let cancelled = false;
      // On failure keep what we already know (the seed) rather than clearing the ticks.
      loadPicked().catch(() => { if (!cancelled) setPickedReady(true); });
      return () => { cancelled = true; };
    }, [pickTripId, loadPicked])
  );

  const togglePick = useCallback(async (item) => {
    const id = item.placeId;
    if (!id || !pickTripId || !pickDestId || pickPending.has(id)) return;

    const category = toTripCategory(activeCategory);
    setPickPending((prev) => new Set(prev).add(id));
    try {
      if (pickedMap.has(id)) {
        // Saved already: remove it. If we only know it's saved (409 earlier),
        // look up its id first.
        let tripPlaceId = pickedMap.get(id);
        if (!tripPlaceId) tripPlaceId = (await loadPicked()).get(id);
        if (tripPlaceId) await removeTripPlace(tripPlaceId);
        setPickedMap((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      } else {
        const res = await addPlaceToTrip(pickTripId, pickDestId, buildTripPlaceDto(item, category));
        setPickedMap((prev) => new Map(prev).set(id, res.id || ''));
      }
    } catch (e) {
      const message = e instanceof AuthRequiredError
        ? 'Sign in to edit your trips.'
        : (e?.message || 'Something went wrong. Please try again.');
      Alert.alert('Could not update trip', message);
    } finally {
      setPickPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [pickTripId, pickDestId, pickedMap, pickPending, activeCategory, loadPicked]);

  // "Add (N)": N is every place saved to this destination across the
  // Stays, Food and Activities tabs, including ones added earlier.
  const pickedCount = pickedMap.size;
  useEffect(() => {
    if (!pickForTrip || !isFocused) return;
    // While picking, the bar stays collapsed (Home circle + "Add (N)") at all times.
    setCollapsed(true);
    setCta({
      label: pickedCount > 0 ? `Add (${pickedCount})` : 'Done',
      icon: 'checkmark-circle',
      onPress: () => navigation.goBack(),
    });
  }, [pickForTrip, isFocused, pickedCount, setCta, setCollapsed, navigation]);


  // Favourites: set of placeIds currently favourited, plus a per-place pending
  // flag so the heart can't be double-tapped mid-request.
  const [favedIds, setFavedIds] = useState(() => new Set());
  const [favPending, setFavPending] = useState(() => new Set());

  // Load the user's existing favourites so hearts reflect the real state.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const favs = await getFavourites();
          if (!cancelled) setFavedIds(new Set(favs.map((f) => f.placeId)));
        } catch (e) {
          // Guest or error — leave hearts empty.
        }
      })();
      return () => { cancelled = true; };
    }, [])
  );

  const toggleFavourite = useCallback(async (item) => {
    const id = item.placeId;
    if (!id || favPending.has(id)) return;

    const isFaved = favedIds.has(id);
    setFavPending((prev) => new Set(prev).add(id));
    // Optimistic update.
    setFavedIds((prev) => {
      const next = new Set(prev);
      if (isFaved) next.delete(id); else next.add(id);
      return next;
    });

    try {
      let ok;
      if (isFaved) {
        ok = await removeFavourite(id);
      } else {
        const res = await addFavourite({
          placeId: id,
          placeName: item.name,
          vicinity: item.vicinity,
          rating: item.rating,
          userRatingsTotal: item.userRatingsTotal,
          photoUrl: item.photoUrl,
          category: activeCategory,
        });
        ok = res.success;
      }
      if (!ok) {
        // Revert on failure.
        setFavedIds((prev) => {
          const next = new Set(prev);
          if (isFaved) next.add(id); else next.delete(id);
          return next;
        });
      }
    } catch (e) {
      // Revert; AuthRequiredError means not signed in.
      setFavedIds((prev) => {
        const next = new Set(prev);
        if (isFaved) next.add(id); else next.delete(id);
        return next;
      });
      if (e instanceof AuthRequiredError && typeof alert !== 'undefined') {
        alert('Sign in to save favourites.');
      }
    } finally {
      setFavPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [favedIds, favPending, activeCategory]);

  const renderResult = ({ item }) => {
    const isFaved = favedIds.has(item.placeId);
    const isPicked = pickedMap.has(item.placeId);
    const isPickPending = pickPending.has(item.placeId);
    return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.92}
      onPress={() => navigation.navigate('PlaceDetail', {
        placeId: item.placeId,
        name: item.name,
        vicinity: item.vicinity,
        photoUrl: item.photoUrl,
        rating: item.rating,
        category: activeCategory,
        pickForTrip,
      })}
    >
      <View style={styles.cardImageWrap}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="image-outline" size={26} color={COLORS.textMuted} />
          </View>
        )}

        {pickForTrip ? (
          /* Picking for a trip: add / saved toggle */
          <PickToggle
            picked={isPicked}
            pending={isPickPending || !pickedReady}
            onPress={() => togglePick(item)}
            label={isPicked ? `Remove ${item.name} from ${pickForTrip.tripName}` : `Add ${item.name} to ${pickForTrip.tripName}`}
          />
        ) : (
          /* Favourite heart */
          <TouchableOpacity
            style={styles.heartButton}
            onPress={() => toggleFavourite(item)}
            activeOpacity={0.8}
            accessibilityLabel={isFaved ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name={isFaved ? 'heart' : 'heart-outline'}
              size={18}
              color={isFaved ? COLORS.accent : COLORS.textPrimary}
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <RatingRow rating={item.rating} reviews={item.userRatingsTotal} style={styles.cardRating} />
        {!!item.vicinity && (
          <Text style={styles.cardVicinity} numberOfLines={2}>{item.vicinity}</Text>
        )}
      </View>
    </TouchableOpacity>
    );
  };

  const renderListState = () => {
    if (isLoading) {
      return <GridSkeleton label="Loading places" />;
    }
    if (hasError) {
      return (
        <View style={styles.stateContainer}>
          <Ionicons name="cloud-offline-outline" size={44} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Couldn't load results</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadCategory(activeCategory)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    const catLabel = CATEGORIES.find((c) => c.key === activeCategory)?.label?.toLowerCase();
    return (
      <View style={styles.stateContainer}>
        <Ionicons name="search-outline" size={44} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>No {catLabel} found</Text>
        <Text style={styles.stateSubtitle}>Try another category.</Text>
      </View>
    );
  };

  return (
    // No top safe-area padding: the fixed header clears the notch itself
    // (heroTop), and the list is offset by the header's measured height.
    // Padding the top here too pushed the cards down a second time.
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" />

      {/* BACK LAYER: results scroll the full height of the screen. Top padding
          leaves room for the framed hero + pill overlays; as you scroll, cards
          pass up behind the frosted pill bar and the hero's glass frame edges. */}
      <FlatList
        data={activeResults}
        extraData={{ pickedMap, pickPending, favedIds }}
        renderItem={renderResult}
        keyExtractor={(item) => item.placeId}
        numColumns={2}
        columnWrapperStyle={activeResults.length > 0 ? styles.column : undefined}
        contentContainerStyle={
          activeResults.length === 0
            ? [styles.listEmpty, { paddingTop: contentTop }]
            : [styles.listContent, { paddingTop: contentTop }]
        }
        ListEmptyComponent={renderListState}
        ListFooterComponent={pickForTrip || activeResults.length === 0 ? null : (
          <TouchableOpacity
            style={styles.seeAll}
            onPress={openSeeAll}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.seeAllText} numberOfLines={1}>
              See all {(activeChip === 'All' ? categoryMeta.label : activeChip).toLowerCase()} in {destinationName}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.accentDeep} />
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onListScroll}
      />

      {/* FRONT LAYER: solid white header panel — title + location + centered
          filter pills. No image. */}
      <View
        style={styles.headerPanel}
        pointerEvents="box-none"
        // Keep the tallest (open) height: the list's top padding stays put
        // while the header shrinks over it, so the cards don't jump.
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeaderHeight((prev) => (h > prev ? h : prev));
        }}
      >
       {/* Inner clip layer: rounded corners + overflow:hidden so the full-width
           scroll rows clip at the corners. Kept separate from the outer panel
           so the panel can still cast its drop shadow (a view can't clip and
           shadow at once on iOS). */}
       <View style={[styles.headerClip, { paddingTop: heroTop }]}>
        {/* Title row: back button on the left (overlaid), title centered.
            The title shrinks + subtitle hides on scroll, but the row stays. */}
        <View style={styles.headerTitleRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>

          {/* Create a trip here (also in the bottom bar). Hidden while picking
              places for an existing trip. */}
          {/* Collapsed, the "+" gives way to Filters ("Create a trip" stays in the
              bottom bar). */}
          {!pickForTrip && (
            <Animated.View
              style={[styles.titleRight, { opacity: collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
              pointerEvents={headerCollapsed ? 'none' : 'auto'}
            >
              <TouchableOpacity
                style={styles.createTripButton}
                onPress={handleCreateTrip}
                accessibilityRole="button"
                accessibilityLabel={`Create a trip to ${name || details?.name || 'this place'}`}
                accessibilityElementsHidden={headerCollapsed}
                importantForAccessibility={headerCollapsed ? 'no-hide-descendants' : 'auto'}
                activeOpacity={0.85}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </Animated.View>
          )}
          <Animated.View
            style={[styles.titleRight, { opacity: collapseAnim }]}
            pointerEvents={headerCollapsed ? 'auto' : 'none'}
            accessibilityElementsHidden={!headerCollapsed}
            importantForAccessibility={headerCollapsed ? 'auto' : 'no-hide-descendants'}
          >
            {renderFiltersButton(38)}
          </Animated.View>

          {/* Search icon: appears once the search bar folds away. */}
          <Animated.View
            style={[styles.searchIconWrap, { opacity: collapseAnim }]}
            pointerEvents={headerCollapsed ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={styles.searchIconButton}
              onPress={openSearch}
              accessibilityRole="button"
              accessibilityLabel={`Search in ${destinationName}`}
              accessibilityElementsHidden={!headerCollapsed}
              importantForAccessibility={headerCollapsed ? 'auto' : 'no-hide-descendants'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            >
              <Ionicons name="search" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </Animated.View>

          <View style={[styles.headerTitleCenter, styles.headerTitleCenterWide]}>
            <Animated.Text
              style={[
                styles.headerTitle,
                { fontSize: collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [SIZES.xxl, SIZES.lg] }) },
              ]}
              numberOfLines={1}
            >
              {name || details?.name || 'Destination'}
            </Animated.Text>
            {!!(pickForTrip || secondary || details?.formattedAddress) && (
              <Animated.View style={fold(24)}>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {pickForTrip ? `Adding to ${pickForTrip.tripName}` : (secondary || details?.formattedAddress)}
                </Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* Search inside this destination — part of the fixed header, so it
            stays put while the results scroll. While adding to a trip, it
            searches spots to add to the same stop. */}
        <Animated.View style={fold(56)} pointerEvents={headerCollapsed ? 'none' : 'auto'}>
          <View style={styles.searchRow}>
            <TouchableOpacity
              style={styles.searchPill}
              onPress={openSearch}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Search in ${destinationName}`}
            >
              <Ionicons name="search" size={18} color={COLORS.textMuted} />
              <Text style={styles.searchPillText} numberOfLines={1}>Search in {destinationName}</Text>
            </TouchableOpacity>
            {renderFiltersButton(44)}
          </View>
        </Animated.View>

        {/* Category tabs — ALWAYS visible (primary navigation) */}
        <View style={[styles.filterRow, styles.filterRowAfterSearch]}>
          <FilterChips
            filters={CATEGORIES}
            activeKey={activeCategory}
            onChange={(key) => setActiveCategory(key)}
            variant="pills"
          />
        </View>

        {/* Sub-filter chips — pinned here so they stay sticky on scroll. */}
       </View>
      </View>

      {/* The persistent AppTabBar (rendered by the Tab.Navigator) shows the
          collapsing tab bar + Create-a-trip CTA — driven via BottomBarContext. */}
      <FilterSheet
        visible={filtersOpen}
        title={`${categoryMeta.label} filters`}
        subtitle={`in ${destinationName}`}
        options={(CATEGORY_FILTERS[activeCategory] || []).filter((f) => f !== 'All')
          .map((f) => ({ label: f, icon: FILTER_ICONS[f] || 'pricetag-outline' }))}
        selected={activeChip}
        onApply={(choice) => { if (choice !== activeChip) handleChipSelect(choice); }}
        onClose={() => setFiltersOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // Solid white header panel: carries the rounded corners + drop shadow.
  // Content lives in an inner clip layer so the shadow isn't clipped away
  // (a view can't both cast a shadow and clip children on iOS).
  headerPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: SIZES.radius_xl,
    borderBottomRightRadius: SIZES.radius_xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  // Inner clip layer: same rounded corners + overflow:hidden so the full-width
  // scroll rows clip at the corners. Holds the panel's padding.
  headerClip: {
    borderBottomLeftRadius: SIZES.radius_xl,
    borderBottomRightRadius: SIZES.radius_xl,
    overflow: 'hidden',
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_md,
  },
  // Title row — back button overlaid left, title block centered.
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  // Back button absolutely positioned so the title stays truly centered.
  // Room for the "+" and the search icon on the right of the title.
  headerTitleCenterWide: {
    paddingHorizontal: 90,
  },
  searchIconWrap: {
    position: 'absolute',
    right: 38 + SIZES.spacing_sm,
    zIndex: 1,
  },
  searchIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  // Right end of the title row: "+" (open) or Filters (collapsed / picking).
  titleRight: {
    position: 'absolute',
    right: 0,
    zIndex: 1,
  },
  createTripButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.accentDeep,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 2,
    zIndex: 1,
  },
  // Centered title block; horizontal padding keeps long titles clear of the
  // back button.
  headerTitleCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 44,
  },
  // Title — matches the Favorites/MyTrips heading (Poppins bold, primary text).
  headerTitle: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  // Filter pills row, with more gap above and below. The pills scroll
  // horizontally and center themselves when they fit.
  filterRow: {
    marginTop: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_sm,
    marginHorizontal: -SIZES.spacing_lg, // let the scroll row span full width
  },

  // Results list (back layer, full screen). Top padding (applied inline) clears
  // the hero + pill overlays.
  listContent: {
    paddingHorizontal: SIZES.spacing_base,
    // Clear the CTA button + the floating tab bar at the bottom.
    paddingBottom: 190,
  },
  listEmpty: {
    flexGrow: 1,
  },
  // Search bar + Filters button.
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_md,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    height: 44,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  searchPillText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 48,
    marginTop: SIZES.spacing_xs,
    borderRadius: SIZES.radius_full,
    borderWidth: 1.5,
    borderColor: '#ffd9c2',
    backgroundColor: '#fff8f3',
  },
  seeAllText: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  column: {
    gap: SIZES.spacing_base,
  },

  // Result card
  card: {
    flex: 1,
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
  cardImageWrap: {
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: 120,
  },
  cardImagePlaceholder: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Add-to-trip toggle (add / added).
  heartButton: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    right: SIZES.spacing_sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    padding: SIZES.spacing_md,
  },
  cardName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  cardRating: {
    marginTop: 4,
  },
  cardVicinity: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // States
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.spacing_xl,
    minHeight: 260,
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

  filtersButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  filtersButtonOn: {
    borderColor: COLORS.accent,
    backgroundColor: '#fff8f3',
  },
  filtersDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  // With the search bar above, the pills sit a little closer.
  filterRowAfterSearch: {
    marginTop: SIZES.spacing_md,
  },
});
