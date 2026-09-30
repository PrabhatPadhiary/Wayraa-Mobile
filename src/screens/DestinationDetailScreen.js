import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { COLORS, SIZES } from '../constants';
import { FilterChips } from '../components';
import { getPlaceDetails, getPlacesByCategory } from '../services';

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

  const handleCreateTrip = () => {
    // Stub for now — trip creation wired in a later step.
    // eslint-disable-next-line no-alert
    if (typeof alert !== 'undefined') alert('Create trip coming soon!');
  };

  const renderResult = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardImageWrap}>
        {item.photoUrl ? (
          <Image source={{ uri: item.photoUrl }} style={styles.cardImage} />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="image-outline" size={26} color={COLORS.textMuted} />
          </View>
        )}
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
        contentContainerStyle={activeResults.length === 0 ? styles.listEmpty : styles.listContent}
        ListEmptyComponent={renderListState}
        showsVerticalScrollIndicator={false}
      />

      {/* FRONT LAYER: framed, rounded hero image with a frosted glass border. */}
      <View style={styles.heroFrame} pointerEvents="box-none">
        <BlurView intensity={30} tint="light" style={styles.heroGlassBorder}>
          <View style={styles.heroInner}>
            {details?.photoUrl ? (
              <Image source={{ uri: details.photoUrl }} style={styles.heroImage} />
            ) : (
              <View style={[styles.heroImage, styles.heroPlaceholder]} />
            )}
            <View style={styles.heroOverlay} />

            <View style={styles.heroTextWrap}>
              <Text style={styles.heroName} numberOfLines={1}>{name || details?.name || 'Destination'}</Text>
              {!!(secondary || details?.formattedAddress) && (
                <Text style={styles.heroSecondary} numberOfLines={1}>
                  {secondary || details?.formattedAddress}
                </Text>
              )}
            </View>
          </View>
        </BlurView>
      </View>

      {/* Back button floats above the frame. */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        accessibilityLabel="Go back"
        activeOpacity={0.8}
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.white} />
      </TouchableOpacity>

      {/* FRONT LAYER: glass pill selector, sitting just below the hero frame. */}
      <View style={styles.categoryRow} pointerEvents="box-none">
        <FilterChips
          filters={CATEGORIES}
          activeKey={activeCategory}
          onChange={setActiveCategory}
          variant="icon-selective"
        />
      </View>

      {/* Create trip CTA (stubbed) */}
      <View style={styles.ctaWrap} pointerEvents="box-none">
        <TouchableOpacity style={styles.ctaButton} onPress={handleCreateTrip} activeOpacity={0.9}>
          <Ionicons name="add-circle-outline" size={20} color={COLORS.white} />
          <Text style={styles.ctaText}>Create a trip</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Layout constants for the layered composition.
const HERO_TOP = (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) + SIZES.spacing_sm;
const HERO_HEIGHT = 210;          // outer framed card height (incl. glass border)
const GLASS_BORDER = 6;           // thickness of the frosted glass frame
const SELECTOR_HEIGHT = 52;       // approx pill bar height
const HERO_BOTTOM_GAP = SIZES.spacing_base; // gap between hero frame and pills
// Where the pill row sits (below the framed hero).
const SELECTOR_TOP = HERO_TOP + HERO_HEIGHT + HERO_BOTTOM_GAP;
// Where list content must start so the first cards clear hero + pills.
const CONTENT_TOP = SELECTOR_TOP + SELECTOR_HEIGHT + SIZES.spacing_sm;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // FRAMED HERO — rounded card with a frosted glass border, inset from edges.
  heroFrame: {
    position: 'absolute',
    top: HERO_TOP,
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    height: HERO_HEIGHT,
    zIndex: 10,
  },
  heroGlassBorder: {
    flex: 1,
    borderRadius: SIZES.radius_xl,
    overflow: 'hidden',
    padding: GLASS_BORDER,
    // Translucent frame; the blur reveals content scrolling behind the edges.
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  heroInner: {
    flex: 1,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    backgroundColor: COLORS.primary,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  heroTextWrap: {
    padding: SIZES.spacing_lg,
  },
  heroName: {
    fontSize: SIZES.xxl,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.white,
  },
  heroSecondary: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },

  backButton: {
    position: 'absolute',
    top: HERO_TOP + SIZES.spacing_md,
    left: SIZES.spacing_base + SIZES.spacing_md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },

  // Glass pill selector — floats below the hero; content scrolls behind it.
  categoryRow: {
    position: 'absolute',
    top: SELECTOR_TOP,
    left: 0,
    right: 0,
    zIndex: 10,
  },

  // Results list (back layer, full screen). Top padding clears the overlays.
  listContent: {
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: CONTENT_TOP,
    paddingBottom: 110,
  },
  listEmpty: {
    flexGrow: 1,
    paddingTop: CONTENT_TOP,
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

  // CTA
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: Platform.OS === 'ios' ? 28 : SIZES.spacing_lg,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: COLORS.accent,
    paddingVertical: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    gap: SIZES.spacing_sm,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  ctaText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
