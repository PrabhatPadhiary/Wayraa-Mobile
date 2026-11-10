import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { dayCount, daysUntil } from '../utils/tripDates';
import { fallbackGradientFor } from './PlaceTile';
import { avatarColorFor, initialsFor } from './TripStackCard';

export const TRIP_ROW_HEIGHT = 100;
const THUMB = 78;
const MAX_AVATARS = 3;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Where the trip stands, as a short coloured chip: "In 9 days", "Tomorrow",
 * "Day 3 of 8", "Completed", "No dates yet". `progress` (0..1) while under way.
 */
export function tripTiming(trip) {
  const status = (trip.status || '').toLowerCase();
  const until = daysUntil(trip.startDate);
  const left = trip.endDate ? daysUntil(trip.endDate) : null;
  const total = dayCount(trip.startDate, trip.endDate);

  if (status === 'completed' || (left !== null && left < 0)) {
    return { label: 'Completed', icon: 'checkmark-circle', color: '#64748b', tint: '#eef1f5' };
  }
  if (until === null) {
    return { label: 'No dates yet', icon: 'calendar-outline', color: COLORS.primaryLight, tint: '#e6f3fb' };
  }
  if (until > 1) {
    return { label: `In ${until} days`, icon: 'time-outline', color: COLORS.accentDeep, tint: '#fff0e6' };
  }
  if (until === 1) return { label: 'Tomorrow', icon: 'airplane-outline', color: COLORS.accentDeep, tint: '#ffe6d6' };
  if (until === 0) return { label: 'Starts today', icon: 'airplane', color: '#15803d', tint: '#e5f6ec' };
  const dayNo = 1 - until;
  return {
    label: total ? `Day ${dayNo} of ${total}` : `Day ${dayNo}`,
    icon: 'sunny',
    color: '#15803d',
    tint: '#e5f6ec',
    progress: total ? Math.min(1, dayNo / total) : null,
  };
}

/**
 * Trip row for the list view on My Trips: rounded photo with a date tag,
 * name, destination and length, a coloured timing chip, who's going, and a
 * progress line while the trip is under way.
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
  const days = dayCount(trip.startDate, trip.endDate);
  const timing = tripTiming(trip);
  const showImage = !!imageUri && !failed;
  const start = trip.startDate ? new Date(trip.startDate) : null;

  const members = Array.isArray(trip.members) ? trip.members.slice(0, MAX_AVATARS) : [];
  const memberCount = typeof trip.memberCount === 'number' ? trip.memberCount : members.length;
  const extra = Math.max(0, memberCount - members.length);

  const place = destination !== trip.name ? destination : null;
  const meta = [place, days ? `${days} ${days === 1 ? 'day' : 'days'}` : null].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityHint={accessibilityActions ? 'Swipe left for edit and delete' : undefined}
      accessibilityLabel={[trip.name, meta, timing.label, memberCount > 1 ? `${memberCount} travellers` : null]
        .filter(Boolean).join(', ')}
    >
      {/* Photo with a little calendar tag for the start date. */}
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
        {start && (
          <View style={styles.dateTag}>
            <Text style={styles.dateDay}>{start.getUTCDate()}</Text>
            <Text style={styles.dateMonth}>{MONTHS[start.getUTCMonth()]}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
        {!!meta && (
          <View style={styles.metaRow}>
            <Ionicons name="location" size={12} color={COLORS.accent} />
            <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
          </View>
        )}
        <View style={styles.footRow}>
          <View style={[styles.chip, { backgroundColor: timing.tint }]}>
            <Ionicons name={timing.icon} size={12} color={timing.color} />
            <Text style={[styles.chipText, { color: timing.color }]} numberOfLines={1}>{timing.label}</Text>
          </View>
          {memberCount > 1 && (
            <View style={styles.avatars}>
              {members.map((m, i) => (
                <View
                  key={m.userId || i}
                  style={[styles.avatar, { backgroundColor: avatarColorFor(m.name), zIndex: MAX_AVATARS - i }, i > 0 && styles.avatarOverlap]}
                >
                  {m.photoUrl
                    ? <Image source={{ uri: m.photoUrl }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} contentFit="cover" />
                    : <Text style={styles.avatarText}>{initialsFor(m.name)}</Text>}
                </View>
              ))}
              {extra > 0 && (
                <View style={[styles.avatar, styles.avatarOverlap, styles.avatarMore]}>
                  <Text style={styles.avatarMoreText}>+{extra}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>

      <View style={styles.go}>
        <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
      </View>

      {/* Under way: how far through the trip you are. */}
      {timing.progress != null && (
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${Math.round(timing.progress * 100)}%` }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    height: TRIP_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingLeft: 11,
    paddingRight: SIZES.spacing_md,
    borderRadius: 22,
    // A real card: light border + shadow (not clipped, so the shadow shows).
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e3e9ef',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.sand,
  },
  dateTag: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    minWidth: 30,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  dateDay: {
    fontSize: 13,
    lineHeight: 15,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  dateMonth: {
    fontSize: 8,
    lineHeight: 10,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
    letterSpacing: 0.5,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
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
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
    marginTop: 2,
  },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
  },
  avatars: {
    flexDirection: 'row',
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.white,
    overflow: 'hidden',
  },
  avatarOverlap: {
    marginLeft: -7,
  },
  avatarText: {
    fontSize: 8,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  avatarMore: {
    backgroundColor: COLORS.cardBackground,
  },
  avatarMoreText: {
    fontSize: 8,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textSecondary,
  },
  go: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eef4f8',
  },
  // Inset so it sits inside the rounded corners.
  progressTrack: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 5,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#e5f6ec',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#22c55e',
  },
});
