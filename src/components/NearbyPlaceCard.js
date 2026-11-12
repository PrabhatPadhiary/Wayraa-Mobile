import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import RatingRow from './RatingRow';
import { fallbackGradientFor } from './PlaceTile';

export const NEARBY_CARD_WIDTH = 240;
export const NEARBY_CARD_HEIGHT = 200;

/**
 * Card for the "Near You" row: a wide photo with the name and address over a
 * bottom gradient and a rating badge, like PlaceTile but landscape so the
 * Near You row stays easy to tell apart from the portrait tile rows.
 *
 * @param {{ name: string, vicinity?: string, rating?: number, photoUrl?: string }} place
 * @param {() => void} onPress
 */
export default function NearbyPlaceCard({ place, onPress }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [place.photoUrl]);

  const showImage = !!place.photoUrl && !failed;

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={place.vicinity ? `Open ${place.name}, ${place.vicinity}` : `Open ${place.name}`}
    >
      {showImage ? (
        <Image
          source={{ uri: place.photoUrl }}
          style={styles.photo}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          onError={() => setFailed(true)}
        />
      ) : (
        <LinearGradient
          colors={fallbackGradientFor(place.name)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.photo}
        >
          <Ionicons name="image-outline" size={34} color="rgba(255,255,255,0.8)" />
        </LinearGradient>
      )}

      {place.rating > 0 && (
        <View style={styles.ratingPill}>
          <RatingRow rating={place.rating} reviews={place.userRatingsTotal} tone="light" size={SIZES.xs + 1} />
        </View>
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)']}
        style={styles.shade}
        pointerEvents="none"
      >
        <Text style={styles.name} numberOfLines={1}>{place.name}</Text>
        {!!place.vicinity && (
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" />
            <Text style={styles.address} numberOfLines={1}>{place.vicinity}</Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: NEARBY_CARD_WIDTH,
    height: NEARBY_CARD_HEIGHT,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    backgroundColor: COLORS.sand,
  },
  photo: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ratingPill: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    left: SIZES.spacing_sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  ratingText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIZES.spacing_md,
    paddingBottom: SIZES.spacing_md,
    paddingTop: SIZES.spacing_xl,
  },
  name: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  address: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.85)',
  },
});
