import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { FilterChips, ScreenHeader, GridSkeleton } from '../components';
import PlaceGridCard from '../components/PlaceGridCard';
import { getNearbyPlaces, getCurrentLocation } from '../services';
import { distanceKm } from '../utils/itinerary';

// What the list can show: `type` is the Google place type the backend asks
// for, `radius` (metres) how far to look — food and coffee close by, sights
// across the city.
const KINDS = [
  { key: 'sights', type: 'tourist_attraction', radius: 30000, label: 'Sights', icon: 'camera-outline' },
  { key: 'food', type: 'restaurant', radius: 4000, label: 'Food', icon: 'restaurant-outline' },
  { key: 'cafes', type: 'cafe', radius: 4000, label: 'Cafés', icon: 'cafe-outline' },
];
const LIMIT = 20;     // Google's maximum for one nearby search

function distanceLabel(km) {
  if (km == null) return null;
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m away`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

/** Nearest first, each with its distance from you. */
function withDistance(places, from) {
  const origin = from ? { latitude: from.lat, longitude: from.lng } : null;
  return places
    .map((p) => ({
      ...p,
      km: origin ? distanceKm(origin, { latitude: p.lat, longitude: p.lng }) : null,
    }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
}

/**
 * "Near you" → See all: places around your current location, nearest first,
 * with a chip row to switch between sights, food and cafés.
 *
 * Route params (all optional — the screen finds your location itself):
 *  - coords ({ lat, lng }) where Home looked them up
 *  - label (city name for the subtitle)
 *  - places (Home's "Near you" list, shown at once for Things to do)
 */
export default function NearbyPlacesScreen({ navigation, route }) {
  const { coords: startCoords = null, label = null, places: startPlaces = [] } = route?.params || {};

  const [kind, setKind] = useState('sights');
  const [coords, setCoords] = useState(startCoords);
  const [byKind, setByKind] = useState(() => (
    startPlaces.length ? { sights: withDistance(startPlaces, startCoords) } : {}
  ));
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [locationOff, setLocationOff] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const loadedRef = useRef(new Set()); // kinds fetched in full this session

  const load = useCallback(async (key, { force = false } = {}) => {
    if (!force && loadedRef.current.has(key)) return;
    const meta = KINDS.find((k) => k.key === key);
    let here = coords;
    if (!here) {
      const loc = await getCurrentLocation();
      if (!loc?.granted) {
        setLocationOff(true);
        return;
      }
      here = { lat: loc.lat, lng: loc.lng };
      setCoords(here);
    }
    const list = await getNearbyPlaces(here.lat, here.lng, meta.radius, { type: meta.type, limit: LIMIT });
    loadedRef.current.add(key);
    setByKind((prev) => ({ ...prev, [key]: withDistance(list, here) }));
  }, [coords]);

  // Fetch the chosen kind (the full 20) when it's first shown.
  useEffect(() => {
    let active = true;
    const hasSome = (byKind[kind] || []).length > 0;
    if (!hasSome) setLoading(true);
    load(kind).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load(kind, { force: true });
    } finally {
      setRefreshing(false);
    }
  };

  const openPlace = (p) => navigation.navigate('PlaceDetail', {
    placeId: p.placeId,
    name: p.name,
    vicinity: p.vicinity,
    photoUrl: p.photoUrl,
    rating: p.rating,
  });

  const places = byKind[kind] || [];
  const kindMeta = KINDS.find((k) => k.key === kind);

  const renderCard = ({ item }) => (
    <PlaceGridCard
      style={styles.cardCell}
      name={item.name}
      photoUrl={item.photoUrl}
      rating={item.rating}
      reviews={item.userRatingsTotal}
      distance={distanceLabel(item.km)}
      subtitle={item.vicinity}
      accessibilityLabel={`${item.name}${item.km != null ? `, ${distanceLabel(item.km)}` : ''}`}
      onPress={() => openPlace(item)}
    />
  );

  const renderEmpty = () => {
    if (loading) return <GridSkeleton label="Loading places" />;
    if (locationOff) {
      return (
        <View style={styles.state}>
          <Ionicons name="location-outline" size={44} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Location is off</Text>
          <Text style={styles.stateText}>Turn on location to see places near you.</Text>
        </View>
      );
    }
    return (
      <View style={styles.state}>
        <Ionicons name={kindMeta.icon} size={44} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>Nothing found nearby</Text>
        <Text style={styles.stateText}>Try another kind of place, or pull down to refresh.</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="dark-content" />

      <FlatList
        data={places}
        keyExtractor={(item) => item.placeId}
        renderItem={renderCard}
        numColumns={2}
        columnWrapperStyle={places.length > 0 ? styles.column : undefined}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + SIZES.spacing_base }]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
            progressViewOffset={headerHeight}
          />
        )}
      />

      <ScreenHeader
        title="Near you"
        subtitle={label ? `Around ${label}` : 'Places around you'}
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
      >
        {/* The header's children area runs edge to edge; re-apply its side
            inset so the full-width track sits inside the panel. */}
        <View style={styles.filterRow}>
          <FilterChips
            filters={KINDS}
            activeKey={kind}
            onChange={setKind}
            variant="pills"
            fullWidth
            tinted={false}
          />
        </View>
      </ScreenHeader>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
  },
  list: {
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: 120, // clear the floating tab bar
    flexGrow: 1,
  },
  column: {
    gap: SIZES.spacing_base,
  },
  // Two-column grid cell (the card itself is PlaceGridCard).
  cardCell: {
    maxWidth: '48.5%',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    paddingHorizontal: SIZES.spacing_lg,
  },
  state: {
    alignItems: 'center',
    paddingTop: SIZES.spacing_xxl,
    paddingHorizontal: SIZES.spacing_xl,
    gap: SIZES.spacing_sm,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  stateText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
