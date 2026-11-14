import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { CURATED_DESTINATIONS } from '../constants/curatedDestinations';
import { ScreenHeader, Skeleton, PlaceTile } from '../components';
import PlaceGridCard from '../components/PlaceGridCard';
import { getPlacesByTheme, getCurrentLocation, reverseGeocode, isRegionResult } from '../services';
import { placePhotoUrl } from '../utils/placePhotos';

// Fallback copy per theme if the route doesn't pass a label.
const THEME_LABELS = {
  beaches: 'Beaches',
  mountains: 'Mountains',
  cities: 'Cities',
  historical: 'Historical',
  islands: 'Islands',
  wildlife: 'Wildlife',
};

// What "near you" is called per theme. Cities has none: you're in one.
const NEARBY_COPY = {
  beaches: 'Beaches you can get to',
  mountains: 'Hills & mountains nearby',
  historical: 'History around you',
  islands: 'Islands you can get to',
  wildlife: 'Wildlife nearby',
};

// Past this, "near you" is a stretch: the row is titled "Closest to you".
const FAR_KM = 600;

// PlaceTile's size, for the loading placeholders.
const TILE_W = 150;
const TILE_H = 190;

function distanceText(km) {
  if (km == null) return null;
  if (km < 1) return 'Under 1 km';
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

/**
 * CategoryResultsScreen - a home-screen category (Beaches, Mountains, ...).
 *
 *  - "Near you": real places of that kind around you, nearest first, with
 *    their distance (a sideways row; hidden for Cities, or without location).
 *  - "Around the world": a curated grid of famous destinations.
 *
 * Route params: theme, title.
 */
export default function CategoryResultsScreen({ route, navigation }) {
  const theme = route?.params?.theme;
  const title = route?.params?.title || THEME_LABELS[theme] || 'Destinations';
  const curated = CURATED_DESTINATIONS[theme] || [];
  const hasNearby = !!NEARBY_COPY[theme];

  const [headerHeight, setHeaderHeight] = useState(0);
  // 'loading' | 'ready' | 'off' (no location) | 'none' (nothing found)
  const [nearState, setNearState] = useState(hasNearby ? 'loading' : 'off');
  const [nearby, setNearby] = useState([]);
  const [city, setCity] = useState(null);

  const loadNearby = useCallback(async () => {
    if (!hasNearby) return;
    setNearState('loading');
    // Exploring a city from Home: around it; else around where you are.
    const chosen = route?.params?.near;
    const loc = chosen ? { granted: true, lat: chosen.lat, lng: chosen.lng } : await getCurrentLocation();
    if (!loc?.granted) {
      setNearState('off');
      return;
    }
    const label = chosen?.label || await reverseGeocode(loc.lat, loc.lng);
    setCity(label);
    const places = await getPlacesByTheme(theme, { lat: loc.lat, lng: loc.lng }, label);
    setNearby(places);
    setNearState(places.length ? 'ready' : 'none');
  }, [hasNearby, theme, route?.params?.near]);

  useEffect(() => {
    loadNearby();
  }, [loadNearby]);

  // An area (a country, an island, a city) opens its destination page, with
  // stays, food and things to do inside it; a single spot (a beach, a
  // monument, a national park) opens its place page.
  const openItem = (item, { isArea }) => {
    if (!item?.placeId) return;
    if (isArea) {
      navigation.navigate('DestinationDetail', {
        placeId: item.placeId,
        name: item.name,
        secondary: item.vicinity || item.country || '',
      });
    } else {
      navigation.navigate('PlaceDetail', {
        placeId: item.placeId,
        name: item.name,
        vicinity: item.vicinity || item.country || '',
        photoUrl: item.photoUrl,
        rating: item.rating,
      });
    }
  };

  const allFar = nearby.length > 0 && nearby.every((p) => (p.distanceKm ?? 0) > FAR_KM);

  const renderNearbyCard = ({ item }) => (
    <PlaceTile
      title={item.name}
      subtitle={item.distanceKm != null ? `${distanceText(item.distanceKm)} away` : null}
      imageUri={item.photoUrl}
      rating={item.rating}
      reviews={item.userRatingsTotal}
      onPress={() => openItem(item, { isArea: isRegionResult(item) })}
    />
  );

  const renderNearbySection = () => {
    if (!hasNearby) return null;

    let body;
    if (nearState === 'loading') {
      body = (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nearRow} scrollEnabled={false}>
          {[0, 1, 2].map((i) => <Skeleton key={i} width={TILE_W} height={TILE_H} radius={SIZES.radius_lg} />)}
        </ScrollView>
      );
    } else if (nearState === 'off') {
      body = (
        <TouchableOpacity style={styles.notice} onPress={loadNearby} activeOpacity={0.8}>
          <Ionicons name="location-outline" size={18} color={COLORS.accentDeep} />
          <Text style={styles.noticeText}>Turn on location to see {title.toLowerCase()} near you.</Text>
        </TouchableOpacity>
      );
    } else if (nearState === 'none') {
      body = (
        <View style={styles.notice}>
          <Ionicons name="compass-outline" size={18} color={COLORS.textSecondary} />
          <Text style={styles.noticeText}>Nothing close by. Try the picks below.</Text>
        </View>
      );
    } else {
      body = (
        <FlatList
          data={nearby}
          keyExtractor={(item) => item.placeId}
          renderItem={renderNearbyCard}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.nearRow}
        />
      );
    }

    return (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{allFar ? 'Closest to you' : 'Near you'}</Text>
          <Text style={styles.sectionSub} numberOfLines={1}>
            {allFar
              ? `Nothing nearer${city ? ` to ${city}` : ''}, these are the closest`
              : `${NEARBY_COPY[theme]}${city ? ` from ${city}` : ''}`}
          </Text>
        </View>
        {body}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={{ paddingTop: headerHeight + SIZES.spacing_sm, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {renderNearbySection()}

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Around the world</Text>
            <Text style={styles.sectionSub}>Famous {title.toLowerCase()} worth the trip</Text>
          </View>
          <View style={styles.grid}>
            {pairs(curated).map((row) => (
              <View key={row[0].placeId} style={styles.gridRow}>
                {row.map((item) => (
                  <PlaceGridCard
                    key={item.placeId}
                    name={item.name}
                    photoUrl={placePhotoUrl(item.placeId, 600)}
                    subtitle={item.country}
                    accessibilityLabel={`${item.name}${item.country ? `, ${item.country}` : ''}`}
                    onPress={() => openItem(
                      { ...item, photoUrl: placePhotoUrl(item.placeId, 800) },
                      { isArea: item.kind !== 'place' },
                    )}
                  />
                ))}
                {row.length === 1 && <View style={styles.gridSpacer} />}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Floating header: back button + title. */}
      <ScreenHeader
        title={title}
        subtitle={hasNearby ? 'Near you and around the world' : 'Around the world'}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        left={(
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

/** [a, b, c] -> [[a, b], [c]]: rows of a two-column grid. */
function pairs(list) {
  const rows = [];
  for (let i = 0; i < list.length; i += 2) rows.push(list.slice(i, i + 2));
  return rows;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: {
    marginTop: SIZES.spacing_base,
  },
  sectionHead: {
    paddingHorizontal: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
  },
  sectionTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  sectionSub: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 1,
  },

  // Near you (sideways row)
  nearRow: {
    paddingHorizontal: SIZES.spacing_base,
    gap: SIZES.spacing_md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginHorizontal: SIZES.spacing_base,
    padding: SIZES.spacing_md,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  noticeText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },

  // Around the world (grid of PlaceGridCard)
  grid: {
    paddingHorizontal: SIZES.spacing_base,
  },
  gridRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_base,
  },
  gridSpacer: {
    flex: 1,
  },
});
