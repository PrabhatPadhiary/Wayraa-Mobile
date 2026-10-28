import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { COLORS, SIZES } from '../constants';
import { FilterChips, ScreenHeader } from '../components';
import { getPlacesByTheme, getCurrentLocation } from '../services';

// Global vs. region-biased ("Nearby") toggle.
const SCOPES = [
  { key: 'global', label: 'Global', icon: 'earth-outline' },
  { key: 'nearby', label: 'Nearby', icon: 'navigate-outline' },
];

// Fallback copy per theme if the route doesn't pass a label.
const THEME_LABELS = {
  beaches: 'Beaches',
  mountains: 'Mountains',
  cities: 'Cities',
  historical: 'Historical',
  islands: 'Islands',
  wildlife: 'Wildlife',
};

/**
 * CategoryResultsScreen - themed destinations for a home-screen category
 * (Beaches, Mountains, ...). A Global / Nearby toggle switches between a
 * worldwide list and one biased toward the user's region.
 */
export default function CategoryResultsScreen({ route, navigation }) {
  const theme = route?.params?.theme;
  const title = route?.params?.title || THEME_LABELS[theme] || 'Destinations';

  const [scope, setScope] = useState('global');
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Cache the resolved coordinates so switching back to Nearby doesn't
  // re-prompt / re-fetch GPS each time.
  const coordsRef = useRef(null);

  const load = useCallback(async (activeScope) => {
    setLoading(true);
    setError(false);
    setLocationDenied(false);

    try {
      let coords = null;
      if (activeScope === 'nearby') {
        if (coordsRef.current) {
          coords = coordsRef.current;
        } else {
          const loc = await getCurrentLocation();
          if (loc.granted) {
            coords = { lat: loc.lat, lng: loc.lng };
            coordsRef.current = coords;
          } else {
            // No permission: show a note and fall back to a global list so the
            // screen is never empty.
            setLocationDenied(true);
          }
        }
      }

      const data = await getPlacesByTheme(theme, coords);
      setPlaces(data);
    } catch (e) {
      console.log('CategoryResults load error:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [theme]);

  useEffect(() => {
    load(scope);
  }, [scope, load]);

  const changeScope = (key) => {
    if (key === scope) return;
    setScope(key);
  };

  const openDestination = (item) => {
    if (!item?.placeId) return;
    navigation.navigate('DestinationDetail', {
      placeId: item.placeId,
      name: item.name,
      secondary: item.vicinity || '',
    });
  };

  const renderCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => openDestination(item)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
    >
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
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (error) {
      return (
        <View style={styles.stateContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Couldn't load destinations</Text>
          <Text style={styles.stateSubtitle}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => load(scope)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.stateContainer}>
        <Ionicons name="search-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>No destinations found</Text>
        <Text style={styles.stateSubtitle}>Try the other view.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {loading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : (
        <FlatList
          data={places}
          renderItem={renderCard}
          keyExtractor={(item) => item.placeId}
          numColumns={2}
          columnWrapperStyle={places.length > 0 ? styles.column : undefined}
          contentContainerStyle={[
            places.length === 0 ? styles.listEmpty : styles.listContent,
            places.length > 0 && { paddingTop: headerHeight + SIZES.spacing_sm },
          ]}
          ListHeaderComponent={
            locationDenied ? (
              <View style={styles.noticeRow}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.noticeText}>
                  Location is off, showing global picks. Enable location for nearby results.
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating header: back button + title + Global/Nearby toggle. */}
      <ScreenHeader
        title={title}
        subtitle="Popular destinations"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>

        <FilterChips
          filters={SCOPES}
          activeKey={scope}
          onChange={changeScope}
          variant="pills"
        />
      </ScreenHeader>
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
  // Back button pinned to the left of the centered header title.
  backButton: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
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

  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_xs,
    paddingHorizontal: SIZES.spacing_xs,
    paddingBottom: SIZES.spacing_sm,
  },
  noticeText: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },

  // Card (matches the DestinationDetail result card).
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
    width: '100%',
    height: 120,
    backgroundColor: COLORS.cardBackground,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingPill: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
  },
  ratingText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  cardContent: {
    padding: SIZES.spacing_base,
  },
  cardName: {
    fontSize: SIZES.md,
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
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    marginTop: SIZES.spacing_xs,
  },

  // State (loading / empty / error).
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
    marginTop: SIZES.spacing_base,
    paddingHorizontal: SIZES.spacing_lg,
    paddingVertical: SIZES.spacing_sm,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  retryText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
