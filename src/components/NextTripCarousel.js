import React, { useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { COLORS, SIZES } from '../constants';
import NextTripCard from './NextTripCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Side padding so the card doesn't touch the screen edges (matches the old
// single-card layout's SIZES.spacing_lg margin).
const SIDE = SIZES.spacing_lg;

/**
 * Horizontal, paged carousel of the user's active trips for the home screen.
 * Each page is one NextTripCard at screen width; swipe to move between trips.
 * Dot indicators sit inside the card area at the bottom. A single trip renders
 * with no dots (just the card).
 *
 * @param {Array} trips
 * @param {(trip) => string|null} getImageUri  cover URL for a trip
 * @param {(trip) => void} onPressTrip
 */
export default function NextTripCarousel({ trips, getImageUri, onPressTrip }) {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef(null);

  if (!trips || trips.length === 0) return null;

  const onMomentumEnd = (e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (i !== index) setIndex(i);
  };

  if (trips.length === 1) {
    return (
      <View style={styles.singleWrap}>
        <NextTripCard
          trip={trips[0]}
          imageUri={getImageUri(trips[0])}
          onPress={() => onPressTrip(trips[0])}
        />
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        scrollEventThrottle={16}
      >
        {trips.map((trip) => (
          <View key={trip.id} style={styles.page}>
            <NextTripCard
              trip={trip}
              imageUri={getImageUri(trip)}
              onPress={() => onPressTrip(trip)}
              noMargin
            />
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators, overlaid inside the bottom of the card. */}
      <View style={styles.dots} pointerEvents="none">
        {trips.map((trip, i) => (
          <View
            key={trip.id}
            style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  singleWrap: {
    // NextTripCard keeps its own horizontal margin in the single case.
  },
  page: {
    width: SCREEN_WIDTH,
    paddingHorizontal: SIDE,
  },
  dots: {
    position: 'absolute',
    bottom: SIZES.spacing_md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    backgroundColor: COLORS.white,
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
});
