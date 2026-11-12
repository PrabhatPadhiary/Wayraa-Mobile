import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import RatingRow from './RatingRow';

/**
 * The place card used in every two-column grid (a destination's places, "See
 * all", a category's "Around the world", "Near you"): photo on top, then the
 * name, the address / country, distance and the rating pill on white.
 *
 * @param {string} name
 * @param {string|null} [photoUrl]
 * @param {number} [rating]
 * @param {number} [reviews]
 * @param {string} [subtitle]   address / country, up to two lines
 * @param {string} [distance]   e.g. "3.2 km away", shown with a pin
 * @param {React.ReactNode} [corner]  control over the photo's top-right
 *   (favourite heart, add-to-trip toggle)
 * @param {() => void} onPress
 * @param {string} [accessibilityLabel]
 * @param {object} [style]  e.g. a fixed width outside a FlatList grid
 */
export default function PlaceGridCard({
  name,
  photoUrl,
  rating,
  reviews,
  subtitle,
  distance,
  corner,
  onPress,
  accessibilityLabel,
  style,
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [photoUrl]);

  return (
    <TouchableOpacity
      style={[styles.card, style]}
      activeOpacity={0.92}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || name}
    >
      <View>
        {photoUrl && !failed ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={[styles.image, styles.imagePlaceholder]}>
            <Ionicons name="image-outline" size={26} color={COLORS.textMuted} />
          </View>
        )}
        {corner}
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>}
        {!!distance && (
          <View style={styles.distanceRow}>
            <Ionicons name="navigate" size={11} color={COLORS.accentDeep} />
            <Text style={styles.distance} numberOfLines={1}>{distance}</Text>
          </View>
        )}
        <RatingRow rating={rating} reviews={reviews} variant="soft" style={styles.rating} />
      </View>
    </TouchableOpacity>
  );
}

/** Round control for a card's photo corner (the favourite heart). */
export function CardCornerButton({ icon, color = COLORS.textPrimary, onPress, accessibilityLabel }) {
  return (
    <TouchableOpacity
      style={styles.cornerButton}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Ionicons name={icon} size={18} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
  image: {
    width: '100%',
    height: 120,
  },
  imagePlaceholder: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerButton: {
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
  content: {
    padding: SIZES.spacing_md,
  },
  name: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  rating: {
    marginTop: 8,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  distance: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  subtitle: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
