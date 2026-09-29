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
import { getFavourites, removeFavourite, AuthRequiredError } from '../services';
import useAuth from '../hooks/useAuth';

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

/**
 * Resolve a displayable image URL from whatever the backend stored.
 * Favourites may hold: a full http(s) URL, a backend proxy URL, or a raw
 * Google `photo_reference`. Anything else (or empty) yields null → placeholder.
 */
function resolveImageUri(item) {
  const raw = item?.photoUrl || item?.photoReference;
  if (!raw || typeof raw !== 'string') return null;

  // Already a usable absolute URL (includes the backend proxy).
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;

  // Otherwise treat it as a raw photo reference and build the proxy URL.
  return `${API_URL}/Destinations/photo?reference=${encodeURIComponent(raw)}&maxWidth=400`;
}

/**
 * FavoritesScreen - the user's saved places (FavouritesController).
 * Two-column grid with a tap-to-remove heart on each card.
 */
export default function FavoritesScreen({ navigation }) {
  const { isAuthenticated, isAuthReady } = useAuth();
  const [favourites, setFavourites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  // Track ids whose image failed to load, so we can show the placeholder.
  const [brokenImages, setBrokenImages] = useState({});
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

  // Count of favourites per filter, for the chip badges.
  const countFor = (filter) => favourites.filter((f) => matchesFilter(f, filter)).length;

  // Favourites visible under the current filter.
  const visibleFavourites = (() => {
    const filter = FILTERS.find((f) => f.key === activeFilter);
    if (!filter || !filter.match) return favourites;
    return favourites.filter((f) => matchesFilter(f, filter));
  })();

  const loadFavourites = useCallback(async () => {
    setError(false);
    setNeedsAuth(false);
    try {
      const data = await getFavourites();
      setFavourites(data);
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

  const onRefresh = () => {
    setRefreshing(true);
    loadFavourites();
  };

  const handleRemove = async (placeId) => {
    if (!placeId || removingId) return;
    setRemovingId(placeId);
    // Optimistic removal; restore on failure.
    const previous = favourites;
    setFavourites((prev) => prev.filter((f) => f.placeId !== placeId));
    const ok = await removeFavourite(placeId);
    if (!ok) setFavourites(previous);
    setRemovingId(null);
  };

  const renderFavourite = ({ item }) => {
    const uri = resolveImageUri(item);
    const showImage = uri && !brokenImages[item.id];
    return (
    <View style={styles.card}>
      <View style={styles.cardImageWrap}>
        {showImage ? (
          <Image
            source={{ uri }}
            style={styles.cardImage}
            onError={() => setBrokenImages((prev) => ({ ...prev, [item.id]: true }))}
          />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Ionicons name="image-outline" size={28} color={COLORS.textMuted} />
          </View>
        )}
        <TouchableOpacity
          style={styles.heartButton}
          onPress={() => handleRemove(item.placeId)}
          accessibilityLabel={`Remove ${item.placeName} from favourites`}
          activeOpacity={0.8}
        >
          <Ionicons name="heart" size={18} color={COLORS.accent} />
        </TouchableOpacity>
        {item.rating > 0 && (
          <View style={styles.ratingPill}>
            <Ionicons name="star" size={11} color="#FFC107" />
            <Text style={styles.ratingText}>{item.rating}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardContent}>
        <Text style={styles.cardName} numberOfLines={1}>{item.placeName}</Text>
        {!!item.vicinity && (
          <Text style={styles.cardVicinity} numberOfLines={1}>{item.vicinity}</Text>
        )}
        {!!item.category && (
          <View style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>{item.category}</Text>
          </View>
        )}
      </View>
    </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
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
      <View style={styles.stateContainer}>
        <Ionicons name="funnel-outline" size={44} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>No {filterLabel} saved</Text>
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
          icon="heart-outline"
          title="Save your favorite places"
          subtitle="Sign in to keep the places you love in one place."
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
            data={visibleFavourites}
            renderItem={renderFavourite}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={visibleFavourites.length > 0 ? styles.column : undefined}
            contentContainerStyle={[
              visibleFavourites.length === 0 ? styles.listEmpty : styles.listContent,
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
        <Text style={styles.title}>Favorites</Text>
        <Text style={styles.subtitle}>
          {favourites.length > 0
            ? `${favourites.length} saved ${favourites.length === 1 ? 'place' : 'places'}`
            : 'Places you\u2019ve saved for later'}
        </Text>

        {!loading && favourites.length > 0 && (
          <View style={styles.headerFilters}>
            <FilterChips
              filters={FILTERS}
              activeKey={activeFilter}
              onChange={changeFilter}
              countFor={countFor}
              embedded
            />
          </View>
        )}
      </BlurView>
    </SafeAreaView>
  );
}

const CARD_GAP = SIZES.spacing_base;

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
  title: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  headerFilters: {
    marginTop: SIZES.spacing_md,
  },

  listWrap: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_xs,
    paddingBottom: 120,
  },
  listEmpty: {
    flexGrow: 1,
  },
  column: {
    gap: CARD_GAP,
  },

  // Favourite card
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_lg,
    marginBottom: CARD_GAP,
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
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    marginTop: SIZES.spacing_sm,
  },
  categoryChipText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
    textTransform: 'capitalize',
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
