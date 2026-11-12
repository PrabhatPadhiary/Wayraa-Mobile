import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import RatingRow from './RatingRow';

// Brand-toned gradients (navy, blue, orange, teal, sand) used when a place has
// no photo (or it fails to load), so a missing image still looks intentional.
const FALLBACK_GRADIENTS = [
  ['#043247', '#0685c0'], // navy to blue
  ['#c2410c', '#f48c06'], // deep orange to amber
  ['#0d1b2a', '#415a77'], // midnight
  ['#0b5563', '#3aa0a0'], // teal
  ['#7a4a2b', '#d9a066'], // sand brown
];

/** Stable gradient for a name, so a tile keeps its colors between renders. */
export function fallbackGradientFor(name) {
  const text = name || '?';
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 997;
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
}

/**
 * Portrait photo tile with the title over a bottom gradient. Used in the
 * horizontal rows on Explore (Recently Explored, favourites).
 *
 * @param {string} title
 * @param {string} [subtitle]
 * @param {string|null} [imageUri]  falls back to a gradient + initial
 * @param {number|null} [rating]    shows a rating pill when > 0
 * @param {number} [reviews]        review count for the pill
 * @param {() => void} onPress
 */
export default function PlaceTile({ title, subtitle, imageUri, rating, reviews, onPress }) {
  const [failed, setFailed] = useState(false);

  // A new image (e.g. a fresher photo arriving) gets another chance to load.
  useEffect(() => {
    setFailed(false);
  }, [imageUri]);

  const showImage = !!imageUri && !failed;
  const initial = (title || '?').trim()[0]?.toUpperCase() || '?';

  return (
    <TouchableOpacity
      style={styles.tile}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
    >
      {showImage ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          onError={() => setFailed(true)}
        />
      ) : (
        <LinearGradient
          colors={fallbackGradientFor(title)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.image}
        >
          <Text style={styles.initial}>{initial}</Text>
        </LinearGradient>
      )}

      {rating > 0 && (
        <View style={styles.ratingPill}>
          <RatingRow rating={rating} reviews={reviews} tone="light" size={SIZES.xs + 1} />
        </View>
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
        style={styles.shade}
        pointerEvents="none"
      >
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 150,
    height: 190,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    backgroundColor: COLORS.sand,
  },
  image: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    fontSize: 48,
    fontFamily: 'Poppins_700Bold',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: SIZES.spacing_xl,
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
  title: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  subtitle: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
});
