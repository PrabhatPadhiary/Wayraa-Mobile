import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { formatDateRange, dayCount, daysUntil } from '../utils/tripDates';
import { fallbackGradientFor } from './PlaceTile';
import Skeleton from './Skeleton';

/** Label above the trip and the pill at the bottom right, by trip status. */
function describeTrip(trip) {
  const status = (trip.status || '').toLowerCase();

  if (status === 'in_progress') {
    const total = dayCount(trip.startDate, trip.endDate);
    const started = daysUntil(trip.startDate);
    const day = started != null ? 1 - started : null;
    return {
      eyebrow: 'Happening now',
      pill: total && day > 0 ? `Day ${Math.min(day, total)} of ${total}` : 'In progress',
    };
  }

  if (status === 'planning') {
    const days = daysUntil(trip.startDate);
    let pill = 'Upcoming';
    if (days === 0) pill = 'Starts today';
    else if (days === 1) pill = 'Tomorrow';
    else if (days > 1) pill = `In ${days} days`;
    return { eyebrow: 'Your next trip', pill };
  }

  return { eyebrow: 'Continue planning', pill: 'Add dates' };
}

// Longest the card waits for its photo before showing the text anyway.
const REVEAL_TIMEOUT_MS = 2500;

/**
 * Featured card for the user's most relevant trip, shown at the top of Explore.
 *
 * The card stays under a pulsing skeleton until its photo has loaded, so the
 * text and image appear together. If there's no photo, it fails, or it takes
 * longer than REVEAL_TIMEOUT_MS, the card reveals anyway (with the fallback
 * gradient if the photo never arrives).
 *
 * @param {object} trip       a trip from GET /api/Trips
 * @param {string|null} [imageUri]
 * @param {() => void} onPress
 */
export default function NextTripCard({ trip, imageUri, onPress, noMargin = false }) {
  const [failed, setFailed] = useState(false);
  const [revealed, setRevealed] = useState(!imageUri);

  // A new photo gets another chance to load (and hides the card again).
  useEffect(() => {
    setFailed(false);
    setRevealed(!imageUri);
    if (!imageUri) return undefined;
    const timer = setTimeout(() => setRevealed(true), REVEAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [imageUri]);

  const { eyebrow, pill } = describeTrip(trip);
  const destination = trip.primaryDestination || trip.name;
  const dates = formatDateRange(trip.startDate, trip.endDate) || 'Dates not set';
  const showImage = !!imageUri && !failed;

  return (
    <TouchableOpacity
      style={[styles.card, noMargin && styles.cardNoMargin]}
      activeOpacity={0.92}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${eyebrow}: ${trip.name}, ${pill}`}
    >
      {showImage ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          onLoad={() => setRevealed(true)}
          onError={() => {
            setFailed(true);
            setRevealed(true);
          }}
        />
      ) : (
        <LinearGradient
          colors={fallbackGradientFor(destination)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.image}
        />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.eyebrowChip}>
        <Text style={styles.eyebrowText}>{eyebrow}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerText}>
          <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.85)" />
            <Text style={styles.metaText} numberOfLines={1}>{destination}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.85)" />
            <Text style={styles.metaText} numberOfLines={1}>{dates}</Text>
          </View>
        </View>

        <View style={styles.pill}>
          <Text style={styles.pillText}>{pill}</Text>
        </View>
      </View>

      {/* Covers everything until the photo is ready, then disappears. The
          image underneath keeps loading the whole time. */}
      {!revealed && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Skeleton width="100%" height="100%" radius={0} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 190,
    marginHorizontal: SIZES.spacing_lg,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    backgroundColor: COLORS.sand,
  },
  // Carousel controls spacing itself, so the card drops its own side margin.
  cardNoMargin: {
    marginHorizontal: 0,
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  eyebrowChip: {
    position: 'absolute',
    top: SIZES.spacing_md,
    left: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  eyebrowText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_md,
  },
  footerText: {
    flex: 1,
  },
  name: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  metaText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.9)',
  },
  pill: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
  },
  pillText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
