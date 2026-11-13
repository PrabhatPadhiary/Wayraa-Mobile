import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  ScrollView,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ratingText } from '../components/RatingRow';
import { COLORS, SIZES } from '../constants';
import {
  FilterChips,
  SignInPrompt,
  ScreenHeader,
  GridSkeleton,
  AddToTripSheet,
} from '../components';
import { getFavourites, removeFavourite, addFavourite, AuthRequiredError } from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { cityOf, groupByCity, favouriteIcon } from '../utils/favourites';
import useAuth from '../hooks/useAuth';
import { showAlert } from '../components/AppDialog';

/**
 * Category filters. `match` lists the backend category values each chip includes.
 * Explore saves favourites with categories from GooglePlacesService:
 * "stays" | "restaurants" | "attractions" | "activities". We also tolerate
 * singular / alternate spellings just in case.
 */
const FILTERS = [
  { key: 'all', label: 'All', icon: 'apps-outline', match: null },
  { key: 'places', label: 'Places', icon: 'bed-outline', match: ['stays', 'stay', 'attractions', 'attraction'] },
  { key: 'food', label: 'Food', icon: 'restaurant-outline', match: ['restaurants', 'restaurant', 'food'] },
  { key: 'activities', label: 'Activities', icon: 'walk-outline', match: ['activities', 'activity'] },
];

/** Does a favourite item belong to the given filter? */
function matchesFilter(item, filter) {
  if (!filter || !filter.match) return true;
  const cat = (item?.category || '').toLowerCase();
  return filter.match.includes(cat);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const PAD = SIZES.spacing_base;
const GAP = SIZES.spacing_md;
const COLUMN_WIDTH = (SCREEN_WIDTH - PAD * 2 - GAP) / 2;
// Repeating tile heights give the masonry its mood-board rhythm.
const TILE_HEIGHTS = [230, 180, 205, 250, 170, 220];
const UNDO_MS = 5000;

function photoFor(item, width) {
  return placePhotoUrl(item.placeId, width) || normalizePhotoUrl(item.photoUrl || item.photoReference, width);
}

/** Split items into two columns, always adding to the shorter one. */
function toMasonry(items) {
  const cols = [[], []];
  const heights = [0, 0];
  items.forEach((item, i) => {
    const h = TILE_HEIGHTS[i % TILE_HEIGHTS.length];
    const c = heights[0] <= heights[1] ? 0 : 1;
    cols[c].push({ item, height: h });
    heights[c] += h + GAP;
  });
  return cols;
}

/**
 * FavoritesScreen - the user's saved places (FavouritesController).
 *
 * City collections at the top (tap one to show just that city), then a
 * two-column masonry "mood board" of photo tiles. Each tile has a heart to
 * remove and a + to add it to a trip.
 * Removing shows an Undo toast.
 */
export default function FavoritesScreen({ navigation }) {
  const { isAuthenticated, isAuthReady } = useAuth();
  const [favourites, setFavourites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  // Track ids whose image failed to load, so we can show the placeholder.
  const [brokenImages, setBrokenImages] = useState({});
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeCity, setActiveCity] = useState(null); // collection key or null
  const [headerHeight, setHeaderHeight] = useState(0);
  const [tripPlace, setTripPlace] = useState(null); // favourite being added to a trip
  // Last removal, for the Undo toast: { item, index }.
  const [undo, setUndo] = useState(null);
  const undoTimer = useRef(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const listOpacity = useRef(new Animated.Value(1)).current;

  // Change filter with a quick cross-fade of the list content.
  const crossFade = (apply) => {
    Animated.timing(listOpacity, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      apply();
      Animated.timing(listOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    });
  };
  const changeFilter = (key) => {
    if (key === activeFilter) return;
    crossFade(() => setActiveFilter(key));
  };
  const toggleCity = (key) => crossFade(() => setActiveCity((cur) => (cur === key ? null : key)));

  const collections = useMemo(() => groupByCity(favourites), [favourites]);
  // Collections are worth showing once there's more than one place to group.
  const showCollections = favourites.length >= 2;
  const activeCollection = collections.find((c) => c.key === activeCity) || null;

  // Favourites visible under the current city + filter.
  const visibleFavourites = useMemo(() => {
    const filter = FILTERS.find((f) => f.key === activeFilter);
    const base = activeCollection ? activeCollection.items : favourites;
    return filter?.match ? base.filter((f) => matchesFilter(f, filter)) : base;
  }, [favourites, activeFilter, activeCollection]);

  const columns = useMemo(() => toMasonry(visibleFavourites), [visibleFavourites]);

  const loadFavourites = useCallback(async () => {
    setError(false);
    setNeedsAuth(false);
    try {
      const data = await getFavourites();
      setFavourites(data);
      setBrokenImages({});
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

  useFocusEffect(
    useCallback(() => {
      // Wait until Firebase has restored persisted auth before deciding.
      if (!isAuthReady) return;
      if (!isAuthenticated) {
        setNeedsAuth(true);
        setLoading(false);
        return;
      }
      loadFavourites();
    }, [loadFavourites, isAuthReady, isAuthenticated])
  );

  // A collection that no longer exists (its last place was removed) clears itself.
  useEffect(() => {
    if (activeCity && !collections.some((c) => c.key === activeCity)) setActiveCity(null);
  }, [activeCity, collections]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const onRefresh = () => {
    setRefreshing(true);
    loadFavourites();
  };


  // ── Undo toast ──────────────────────────────────────────────────────────
  const hideToast = () => {
    clearTimeout(undoTimer.current);
    Animated.timing(toastAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setUndo(null));
  };

  const showToast = (entry) => {
    clearTimeout(undoTimer.current);
    setUndo(entry);
    toastAnim.setValue(0);
    Animated.spring(toastAnim, { toValue: 1, useNativeDriver: true, friction: 9, tension: 90 }).start();
    undoTimer.current = setTimeout(hideToast, UNDO_MS);
  };

  // Remove straight away (optimistic) and offer Undo, which saves it again.
  const handleRemove = async (item) => {
    const index = favourites.findIndex((f) => f.placeId === item.placeId);
    setFavourites((prev) => prev.filter((f) => f.placeId !== item.placeId));
    const ok = await removeFavourite(item.placeId);
    if (!ok) {
      setFavourites((prev) => {
        const next = [...prev];
        next.splice(Math.max(0, index), 0, item);
        return next;
      });
      showAlert('Could not remove', 'Please check your connection and try again.');
      return;
    }
    showToast({ item, index });
  };

  const handleUndo = async () => {
    if (!undo) return;
    const { item, index } = undo;
    hideToast();
    setFavourites((prev) => {
      if (prev.some((f) => f.placeId === item.placeId)) return prev;
      const next = [...prev];
      next.splice(Math.min(Math.max(0, index), next.length), 0, item);
      return next;
    });
    try {
      const res = await addFavourite({
        placeId: item.placeId,
        placeName: item.placeName,
        vicinity: item.vicinity,
        rating: item.rating,
        userRatingsTotal: item.userRatingsTotal,
        photoUrl: item.photoUrl,
        category: item.category,
      });
      if (!res.success) throw new Error(res.error);
    } catch (e) {
      setFavourites((prev) => prev.filter((f) => f.placeId !== item.placeId));
      showAlert('Could not restore', 'Please try saving it again from the place page.');
    }
  };

  // ── Add to trip ─────────────────────────────────────────────────────────
  const openAddToTrip = (item) => {
    setTripPlace({
      placeId: item.placeId,
      name: item.placeName,
      vicinity: item.vicinity,
      rating: item.rating,
      userRatingsTotal: item.userRatingsTotal,
      category: item.category,
      rawPhotoUrl: item.photoUrl || null,
      previewUrl: photoFor(item, 200),
    });
  };

  const openTripFromSheet = (tripId, tripName) => {
    // Trips live in the My Trips tab; keep its list underneath so back works.
    navigation.getParent()?.navigate('MyTrips', {
      screen: 'TripDetail',
      params: { tripId, tripName },
      initial: false,
    });
  };

  const openPlace = (item) => {
    navigation.navigate('PlaceDetail', {
      placeId: item.placeId,
      name: item.placeName,
      vicinity: item.vicinity,
      photoUrl: photoFor(item, 800),
      rating: item.rating,
      category: item.category,
    });
  };

  // ── Rendering ───────────────────────────────────────────────────────────
  const renderCollection = (c) => {
    const photos = c.items.map((i) => photoFor(i, 400)).filter(Boolean).slice(0, 3);
    const active = c.key === activeCity;
    return (
      <TouchableOpacity
        key={c.key}
        style={[styles.collection, active && styles.collectionActive]}
        onPress={() => toggleCity(c.key)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${c.city}, ${c.items.length} saved`}
      >
        {/* Collage: one big photo, two small stacked beside it. */}
        <View style={styles.collage}>
          {photos[0] ? (
            <Image source={{ uri: photos[0] }} style={styles.collageMain} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.collageMain, styles.photoEmpty]}>
              <Ionicons name="images-outline" size={22} color={COLORS.textMuted} />
            </View>
          )}
          {photos.length > 1 && (
            <View style={styles.collageSide}>
              <Image source={{ uri: photos[1] }} style={styles.collageSmall} contentFit="cover" cachePolicy="memory-disk" />
              {photos[2] ? (
                <Image source={{ uri: photos[2] }} style={styles.collageSmall} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={[styles.collageSmall, styles.photoEmpty]} />
              )}
            </View>
          )}
        </View>
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']} style={styles.collectionShade} pointerEvents="none" />
        <View style={styles.collectionText} pointerEvents="none">
          <Text style={styles.collectionCity} numberOfLines={1}>{c.city}</Text>
          <Text style={styles.collectionCount}>{c.items.length} saved</Text>
        </View>
        {active && (
          <View style={styles.collectionCheck}>
            <Ionicons name="checkmark" size={14} color={COLORS.white} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderTile = ({ item, height }) => {
    const uri = photoFor(item, 500);
    const showImage = uri && !brokenImages[item.id];
    const city = cityOf(item.vicinity);
    return (
        <TouchableOpacity
          key={item.id}
          style={[styles.tile, { height }]}
          onPress={() => openPlace(item)}
          activeOpacity={0.92}
          accessibilityRole="button"
          accessibilityLabel={[item.placeName, city, item.rating > 0 ? `rated ${item.rating}` : null].filter(Boolean).join(', ')}
          accessibilityActions={[{ name: 'trip', label: 'Add to trip' }, { name: 'remove', label: 'Remove from favourites' }]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'trip') openAddToTrip(item);
            if (e.nativeEvent.actionName === 'remove') handleRemove(item);
          }}
        >
          {showImage ? (
            <Image
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.photoEmpty]}>
              <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
            locations={[0, 0.35, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.tileTop}>
            <View style={styles.categoryBadge}>
              <Ionicons name={favouriteIcon(item.category)} size={13} color={COLORS.white} />
            </View>
            <TouchableOpacity
              style={styles.heartButton}
              onPress={() => handleRemove(item)}
              accessibilityLabel={`Remove ${item.placeName} from favourites`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              activeOpacity={0.8}
            >
              <Ionicons name="heart" size={17} color={COLORS.accent} />
            </TouchableOpacity>
          </View>

          <View style={styles.tileBottom}>
            <View style={styles.tileText}>
              <Text style={styles.tileName} numberOfLines={2}>{item.placeName}</Text>
              <Text style={styles.tileMeta} numberOfLines={1}>
                {[ratingText(item.rating, item.userRatingsTotal), city].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.tripButton}
              onPress={() => openAddToTrip(item)}
              accessibilityLabel={`Add ${item.placeName} to a trip`}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (error) {
      return (
        <View style={styles.stateContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Couldn't load favourites</Text>
          <Text style={styles.stateSubtitle}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFavourites}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    // No favourites at all vs. none matching the active filter.
    if (favourites.length === 0) {
      return (
        <View style={styles.stateContainer}>
          <Ionicons name="heart-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>No favourites yet</Text>
          <Text style={styles.stateSubtitle}>Tap the heart on a place to save it here.</Text>
        </View>
      );
    }
    const filterLabel = FILTERS.find((f) => f.key === activeFilter)?.label?.toLowerCase();
    return (
      <View style={styles.inlineEmpty}>
        <Ionicons name="funnel-outline" size={36} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>
          No {filterLabel} saved{activeCollection ? ` in ${activeCollection.city}` : ''}
        </Text>
        <Text style={styles.stateSubtitle}>Try a different filter to see more.</Text>
      </View>
    );
  };

  // The scrolling content is memoised so unrelated state changes (e.g. the
  // undo toast) don't re-render every tile and image.
  const scrollContent = useMemo(() => (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + SIZES.spacing_md }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.accent}
                progressViewOffset={headerHeight}
              />
            }
          >
            {showCollections && (
              <>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>Collections</Text>
                  <Text style={styles.sectionCount}>{collections.length} {collections.length === 1 ? 'city' : 'cities'}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.collectionsRow}
                >
                  {collections.map(renderCollection)}
                </ScrollView>
              </>
            )}

            <Animated.View style={{ opacity: listOpacity }}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>
                  {activeCollection ? activeCollection.city : 'All saved'}
                </Text>
                {activeCollection ? (
                  <TouchableOpacity
                    style={styles.clearCity}
                    onPress={() => toggleCity(activeCollection.key)}
                    accessibilityRole="button"
                    accessibilityLabel="Show all saved places"
                  >
                    <Text style={styles.clearCityText}>Show all</Text>
                    <Ionicons name="close" size={14} color={COLORS.primary} />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.sectionCount}>{visibleFavourites.length}</Text>
                )}
              </View>

              {visibleFavourites.length === 0 ? (
                renderEmpty()
              ) : (
                <View style={styles.masonry}>
                  {columns.map((col, i) => (
                    <View key={i} style={styles.masonryColumn}>
                      {col.map(renderTile)}
                    </View>
                  ))}
                </View>
              )}
            </Animated.View>
          </ScrollView>
  // Everything the content reads (render helpers close over these values).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [
    headerHeight, refreshing, favourites, error, showCollections, collections, activeCity,
    activeCollection, listOpacity, visibleFavourites, columns, brokenImages,
    activeFilter,
  ]);

  // Guest: show the sign-in gate instead of an empty list + header.
  if (needsAuth) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <SignInPrompt
          icon="heart-outline"
          title="Save your favourite places"
          subtitle="Sign in to keep the places you love in one place."
          onSignIn={() => navigation.navigate('Welcome')}
        />
      </SafeAreaView>
    );
  }

  const noItemsAtAll = favourites.length === 0 || error;

  return (
    // No top safe-area padding: the floating header already clears the
    // status bar / notch, and content is offset by its measured height.
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {loading ? (
        // Offset below the floating header, like the real list.
        <View style={{ paddingTop: headerHeight + SIZES.spacing_sm }}>
          <GridSkeleton />
        </View>
      ) : noItemsAtAll ? (
        <View style={styles.fill}>{renderEmpty()}</View>
      ) : (
        scrollContent
      )}

      {/* Shared floating header panel. List scrolls beneath. */}
      <ScreenHeader
        title="Favourites"
        subtitle={
          favourites.length > 0
            ? `${favourites.length} saved ${favourites.length === 1 ? 'place' : 'places'}`
            : 'Places you\u2019ve saved for later'
        }
        // Always expanded (title + filters stay put while the list scrolls).
        onLayout={(e) => setHeaderHeight(Math.round(e.nativeEvent.layout.height))}
      >
        {!loading && favourites.length > 0 && (
          <FilterChips
            filters={FILTERS}
            activeKey={activeFilter}
            onChange={changeFilter}
            variant="pills"
          />
        )}
      </ScreenHeader>

      {/* Undo toast after removing a favourite. */}
      {!!undo && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            },
          ]}
          accessibilityLiveRegion="polite"
        >
          <Ionicons name="heart-dislike" size={16} color={COLORS.white} />
          <Text style={styles.toastText} numberOfLines={1}>Removed {undo.item.placeName}</Text>
          <TouchableOpacity onPress={handleUndo} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.toastUndo}>Undo</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      <AddToTripSheet
        visible={!!tripPlace}
        place={tripPlace}
        onClose={() => setTripPlace(null)}
        onSignIn={() => { setTripPlace(null); navigation.navigate('Welcome'); }}
        onCreateTrip={() => { setTripPlace(null); navigation.getParent()?.navigate('Explore'); }}
        onViewTrip={openTripFromSheet}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  // Main view: like container, minus the Android status bar padding (the
  // floating header handles the top inset).
  screen: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 140,
  },

  // Section headings
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
    marginTop: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_md,
  },
  sectionTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  sectionCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  clearCity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  clearCityText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },

  // City collections
  collectionsRow: {
    gap: SIZES.spacing_md,
    paddingHorizontal: PAD,
    paddingBottom: SIZES.spacing_md,
  },
  collection: {
    width: 220,
    height: 150,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  collectionActive: {
    borderColor: COLORS.accent,
  },
  collage: {
    flex: 1,
    flexDirection: 'row',
    gap: 2,
  },
  collageMain: {
    flex: 2,
    height: '100%',
  },
  collageSide: {
    flex: 1,
    gap: 2,
  },
  collageSmall: {
    flex: 1,
    width: '100%',
  },
  collectionShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
  },
  collectionText: {
    position: 'absolute',
    left: SIZES.spacing_md,
    right: SIZES.spacing_md,
    bottom: SIZES.spacing_sm,
  },
  collectionCity: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  collectionCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },
  collectionCheck: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    right: SIZES.spacing_sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Masonry
  masonry: {
    flexDirection: 'row',
    gap: GAP,
    paddingHorizontal: PAD,
  },
  masonryColumn: {
    width: COLUMN_WIDTH,
    gap: GAP,
  },
  tile: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'space-between',
  },
  photoEmpty: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SIZES.spacing_sm,
  },
  categoryBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SIZES.spacing_xs,
    padding: SIZES.spacing_md,
  },
  tileText: {
    flex: 1,
  },
  tileName: {
    fontSize: SIZES.md,
    lineHeight: 19,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  tileMeta: {
    marginTop: 2,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.88)',
  },
  tripButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Undo toast
  toast: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    right: SIZES.spacing_lg,
    bottom: 110,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  toastText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },
  toastUndo: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_700Bold',
    color: '#ffb27a',
  },

  // State (loading / empty / error)
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.spacing_xl,
  },
  inlineEmpty: {
    alignItems: 'center',
    paddingVertical: SIZES.spacing_xl,
    paddingHorizontal: SIZES.spacing_xl,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginTop: SIZES.spacing_base,
    textAlign: 'center',
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
