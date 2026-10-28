import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { FilterChips } from '../components';
import { useBottomBar } from '../context/BottomBarContext';
import {
  getPlaceDetails,
  getPlacesByCategory,
  getFavourites,
  addFavourite,
  removeFavourite,
  AuthRequiredError,
} from '../services';

/**
 * Category tabs. `apiCategory` maps the UI label to the backend category
 * expected by /Destinations/places (restaurants | stays | activities).
 */
const CATEGORIES = [
  { key: 'stays', label: 'Stays', icon: 'bed-outline', apiCategory: 'stays' },
  { key: 'food', label: 'Food', icon: 'restaurant-outline', apiCategory: 'restaurants' },
  { key: 'activities', label: 'Activities', icon: 'walk-outline', apiCategory: 'activities' },
];

/**
 * DestinationDetailScreen - shows a searched place with its Stays / Food /
 * Activities, and a (stubbed) Create trip CTA.
 *
 * Route params: { placeId, name, secondary }
 */
export default function DestinationDetailScreen({ navigation, route }) {
  const { placeId, name, secondary } = route.params || {};
  const insets = useSafeAreaInsets();

  // Header panel top offset clears the Dynamic Island / status bar. The panel's
  // full height is measured (onLayout) so the list can start below it.
  const heroTop = insets.top + SIZES.spacing_sm;
  const [headerHeight, setHeaderHeight] = useState(0);
  const contentTop = headerHeight;

  const [details, setDetails] = useState(null);
  const [activeCategory, setActiveCategory] = useState('stays');
  // Results + load state cached per category so switching tabs is instant on revisit.
  const [resultsByCategory, setResultsByCategory] = useState({});
  const [loadingCategory, setLoadingCategory] = useState({});
  const [errorCategory, setErrorCategory] = useState({});

  const activeResults = resultsByCategory[activeCategory] || [];
  const isLoading = !!loadingCategory[activeCategory] && !resultsByCategory[activeCategory];
  const hasError = !!errorCategory[activeCategory];

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
  }, [activeCategory, resultsByCategory, loadingCategory, loadCategory]);

  // Drive the shared persistent tab bar (collapse + CTA) via context.
  const { setCollapsed, setCta, reset } = useBottomBar();
  const [collapsed, setLocalCollapsed] = useState(false);

  const handleCreateTrip = useCallback(() => {
    // Stub for now — trip creation wired in a later step.
    // eslint-disable-next-line no-alert
    if (typeof alert !== 'undefined') alert('Create trip coming soon!');
  }, []);

  // Register the "Create a trip" CTA on the shared tab bar while focused;
  // clear the bar's collapse + CTA state when leaving this screen.
  useFocusEffect(
    useCallback(() => {
      setCta({ label: 'Create a trip', icon: 'add-circle-outline', onPress: handleCreateTrip });
      return () => reset();
    }, [setCta, reset, handleCreateTrip])
  );

  const handleScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 40 && !collapsed) {
      setLocalCollapsed(true);
      setCollapsed(true);
    } else if (y <= 10 && collapsed) {
      setLocalCollapsed(false);
      setCollapsed(false);
    }
  };

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
    return (
    <View style={styles.card}>
      <View style={styles.cardImageWrap}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="image-outline" size={26} color={COLORS.textMuted} />
          </View>
        )}

        {/* Favourite heart */}
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

        {item.rating > 0 && (
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={11} color="#FFC107" />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        {!!item.vicinity && (
          <Text style={styles.cardVicinity} numberOfLines={2}>{item.vicinity}</Text>
        )}
        {item.userRatingsTotal > 0 && (
          <Text style={styles.cardReviews}>{item.userRatingsTotal.toLocaleString()} reviews</Text>
        )}
      </View>
    </View>
    );
  };

  const renderListState = () => {
    if (isLoading) {
      return (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      );
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* BACK LAYER: results scroll the full height of the screen. Top padding
          leaves room for the framed hero + pill overlays; as you scroll, cards
          pass up behind the frosted pill bar and the hero's glass frame edges. */}
      <FlatList
        data={activeResults}
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
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      {/* FRONT LAYER: solid white header panel — title + location + centered
          filter pills. No image. */}
      <View
        style={[styles.headerPanel, { paddingTop: heroTop }]}
        pointerEvents="box-none"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        {/* Title row: back button on the left (overlaid), title centered. */}
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

          <View style={styles.headerTitleCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {name || details?.name || 'Destination'}
            </Text>
            {!!(secondary || details?.formattedAddress) && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {secondary || details?.formattedAddress}
              </Text>
            )}
          </View>
        </View>

        {/* Centered filter pills */}
        <View style={styles.filterRow}>
          <FilterChips
            filters={CATEGORIES}
            activeKey={activeCategory}
            onChange={setActiveCategory}
            variant="pills"
          />
        </View>
      </View>

      {/* The persistent AppTabBar (rendered by the Tab.Navigator) shows the
          collapsing tab bar + Create-a-trip CTA — driven via BottomBarContext. */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // Solid white header panel: title + location + centered filter pills.
  // (paddingTop applied inline for the safe-area inset.)
  headerPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: COLORS.white,
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_md,
    borderBottomLeftRadius: SIZES.radius_xl,
    borderBottomRightRadius: SIZES.radius_xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  // Title row — back button overlaid left, title block centered.
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  // Back button absolutely positioned so the title stays truly centered.
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
  ratingPill: {
    position: 'absolute',
    bottom: SIZES.spacing_sm,
    left: SIZES.spacing_sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    gap: 3,
  },
  ratingText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  cardContent: {
    padding: SIZES.spacing_md,
  },
  cardName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  cardVicinity: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cardReviews: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    marginTop: SIZES.spacing_xs,
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

});
