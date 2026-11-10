import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { formatDateRange, dayCount } from '../utils/tripDates';
import { fallbackGradientFor } from './PlaceTile';

export const TRIP_CARD_HEIGHT = 210;
// How far each card slides up over the one above it (the "deck" look).
export const TRIP_CARD_OVERLAP = 44;
const RADIUS = 28;
const AVATAR = 28;
const MAX_AVATARS = 3;

// Solid avatar colors, picked per name so a person keeps their color.
const AVATAR_COLORS = ['#e85d04', '#0685c0', '#2d6a4f', '#6a4c93', '#c0392b', '#415a77'];
export function avatarColorFor(name) {
  const text = name || '?';
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 997;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initialsFor(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Status pill styling, matching the colors used elsewhere for trip status. */
export function statusInfo(status) {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return { label: 'Completed', color: COLORS.textSecondary };
    case 'in_progress':
      return { label: 'Ongoing', color: COLORS.success };
    case 'planning':
      return { label: 'Upcoming', color: COLORS.accent };
    case 'draft':
    default:
      return { label: 'Draft', color: COLORS.primaryLight };
  }
}

/** Short date range for the card ("12 Jun – 18 Jun 2026" → kept as is). */
function shortDates(trip) {
  return formatDateRange(trip.startDate, trip.endDate) || 'Dates not set';
}

/**
 * Full-bleed photo card for the My Trips list, designed to stack: each card
 * after the first slides up over the bottom of the previous one, so all the
 * content sits in the top part of the card.
 *
 * Shows the trip name, destination and dates, member avatars (initials) with
 * a "+N" chip, and a large day count with the trip status.
 *
 * @param {object} trip         a trip from GET /api/Trips
 * @param {string|null} imageUri
 * @param {boolean} stacked     true for every card after the first
 * @param {() => void} onPress
 * @param {Array} [accessibilityActions]  e.g. edit / delete for screen readers
 * @param {(e) => void} [onAccessibilityAction]
 */
export default function TripStackCard({
  trip,
  imageUri,
  stacked = false,
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
  const status = statusInfo(trip.status);
  const showImage = !!imageUri && !failed;

  // Member avatars. Older backends don't send members; fall back to the
  // traveler count so the card still says how many are going.
  const members = Array.isArray(trip.members) ? trip.members.slice(0, MAX_AVATARS) : [];
  const memberCount = typeof trip.memberCount === 'number' ? trip.memberCount : members.length;
  const extraMembers = Math.max(0, memberCount - members.length);
  const travelers = trip.travelersCount || 1;

  const a11yParts = [
    trip.name,
    destination !== trip.name ? destination : null,
    shortDates(trip),
    days ? `${days} ${days === 1 ? 'day' : 'days'}` : null,
    status.label,
  ].filter(Boolean);

  return (
    <View style={[styles.shadowWrap, stacked && styles.stacked]}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.95}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        accessibilityHint={accessibilityActions ? 'Swipe left for edit and delete' : undefined}
        accessibilityLabel={a11yParts.join(', ')}
      >
        {showImage ? (
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
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

        {/* Darkens the top of the photo so the white text stays readable. */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0)']}
          locations={[0, 0.5, 0.8]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.topRow}>
          {/* Left: name, destination + dates, avatars */}
          <View style={styles.leftCol}>
            <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.85)" />
              <Text style={styles.metaText} numberOfLines={1}>
                {destination !== trip.name ? `${destination} · ` : ''}{shortDates(trip)}
              </Text>
            </View>

            <View style={styles.avatarRow}>
              {members.length > 0 ? (
                <>
                  {members.map((m, i) => (
                    <View
                      key={m.userId || i}
                      style={[
                        styles.avatar,
                        { backgroundColor: avatarColorFor(m.name), zIndex: MAX_AVATARS - i },
                        i > 0 && styles.avatarOverlap,
                      ]}
                    >
                      {m.photoUrl
                        ? <Image source={{ uri: m.photoUrl }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} contentFit="cover" />
                        : <Text style={styles.avatarText}>{initialsFor(m.name)}</Text>}
                    </View>
                  ))}
                  {extraMembers > 0 && (
                    <View style={[styles.avatar, styles.avatarOverlap, styles.moreChip]}>
                      <Text style={styles.moreText}>+{extraMembers}</Text>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.travelersChip}>
                  <Ionicons name="people-outline" size={13} color={COLORS.white} />
                  <Text style={styles.travelersText}>
                    {travelers} {travelers === 1 ? 'traveler' : 'travelers'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Right: big day count + status */}
          <View style={styles.rightCol}>
            {days ? (
              <>
                <Text style={styles.days}>{String(days).padStart(2, '0')}</Text>
                <Text style={styles.daysLabel}>{days === 1 ? 'day' : 'days'}</Text>
              </>
            ) : (
              <Ionicons name="calendar-outline" size={26} color={COLORS.white} />
            )}
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <Text style={styles.statusText}>{status.label}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Shadow lives on a wrapper because the card itself clips (overflow hidden),
  // which would hide a shadow on iOS. The shadow is cast upward so each card
  // reads as sitting on top of the one above.
  shadowWrap: {
    height: TRIP_CARD_HEIGHT,
    borderRadius: RADIUS,
    backgroundColor: COLORS.cardBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  stacked: {
    marginTop: -TRIP_CARD_OVERLAP,
  },
  card: {
    flex: 1,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
  },
  leftCol: {
    flex: 1,
  },
  name: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  metaText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.88)',
  },

  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SIZES.spacing_md,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    borderColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  avatarText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  moreChip: {
    width: undefined,
    minWidth: AVATAR,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  moreText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  travelersChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  travelersText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },

  rightCol: {
    alignItems: 'flex-end',
  },
  days: {
    fontSize: 36,
    lineHeight: 40,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  daysLabel: {
    marginTop: -4,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.88)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
});
