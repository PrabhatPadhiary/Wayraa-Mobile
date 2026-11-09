import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { formatDateRange, dayCount } from '../utils/tripDates';
import { fallbackGradientFor } from './PlaceTile';
import { statusInfo } from './TripStackCard';

export const TRIP_ROW_HEIGHT = 84;
const THUMB = 60;

/**
 * Compact trip row for the "See all trips" list on My Trips: thumbnail, name,
 * destination + dates, and status. Built for scanning many trips quickly,
 * where the photo fan would get too long.
 *
 * @param {object} trip         a trip from GET /api/Trips
 * @param {string|null} imageUri
 * @param {() => void} onPress
 * @param {Array} [accessibilityActions]
 * @param {(e) => void} [onAccessibilityAction]
 */
export default function TripListRow({
  trip,
  imageUri,
  onPress,
  accessibilityActions,
  onAccessibilityAction,
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [imageUri]);

  const destination = trip.primaryDestination || trip.name;
  const dates = formatDateRange(trip.startDate, trip.endDate) || 'Dates not set';
  const days = dayCount(trip.startDate, trip.endDate);
  const status = statusInfo(trip.status);
  const showImage = !!imageUri && !failed;

  const meta = [destination !== trip.name ? destination : null, dates].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityHint={accessibilityActions ? 'Swipe left for edit and delete' : undefined}
      accessibilityLabel={[
        trip.name,
        meta,
        days ? `${days} ${days === 1 ? 'day' : 'days'}` : null,
        status.label,
      ].filter(Boolean).join(', ')}
    >
      <View style={styles.thumb}>
        {showImage ? (
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            onError={() => setFailed(true)}
          />
        ) : (
          <LinearGradient
            colors={fallbackGradientFor(destination)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: status.color }]} />
          <Text style={styles.statusText}>{status.label}</Text>
          {days ? (
            <Text style={styles.daysText}>
              {' · '}{days} {days === 1 ? 'day' : 'days'}
            </Text>
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    height: TRIP_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: SIZES.radius_md,
    overflow: 'hidden',
    backgroundColor: COLORS.sand,
  },
  body: {
    flex: 1,
  },
  name: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  statusText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  daysText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
});
