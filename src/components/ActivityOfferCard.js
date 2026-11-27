import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import RatingRow from './RatingRow';
import { fallbackGradientFor } from './PlaceTile';
import { formatDuration } from '../utils/itinerary';

export const ACTIVITY_CARD_WIDTH = 228;
const PHOTO_HEIGHT = 136;

/** 9468 INR -> "₹9,468" (Indian grouping); other currencies by code. */
export function formatOfferPrice(amount, currency = 'INR') {
  const n = Math.round(Number(amount) || 0);
  if (!n) return null;
  if (currency === 'INR') {
    // 1234567 -> "12,34,567"
    const s = String(n);
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `₹${rest ? `${rest},` : ''}${last3}`;
  }
  return `${currency} ${n.toLocaleString('en')}`;
}

/** "3 h", "6–7 h", "2 days". */
export function formatOfferDuration(from, to) {
  if (!(from > 0)) return null;
  if (from >= 24 * 60) {
    const days = Math.round(from / (24 * 60));
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (to > from && to < 24 * 60) {
    const a = from / 60;
    const b = to / 60;
    if (Number.isInteger(a) && Number.isInteger(b)) return `${a}–${b} h`;
  }
  return formatDuration(from);
}

/**
 * One bookable tour or ticket (Viator): photo with its rating, the title,
 * how long it takes, free cancellation, and the "from" price. Tapping the
 * card opens its details; tapping Book goes straight to the partner's page.
 *
 * @param {{ title: string, imageUrl?: string, rating?: number, reviewCount?: number,
 *   durationMinutes?: number, durationToMinutes?: number, fromPrice?: number,
 *   currency?: string, freeCancellation?: boolean }} offer
 * @param {() => void} onPress  open the details
 * @param {() => void} [onBook]  book now (defaults to onPress)
 * @param {number} [width]
 */
export default function ActivityOfferCard({ offer, onPress, onBook, width = ACTIVITY_CARD_WIDTH }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [offer.imageUrl]);

  const price = formatOfferPrice(offer.fromPrice, offer.currency);
  const duration = formatOfferDuration(offer.durationMinutes, offer.durationToMinutes);
  const showImage = !!offer.imageUrl && !failed;

  return (
    <TouchableOpacity
      style={[styles.card, { width }]}
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[offer.title, price && `from ${price}`].filter(Boolean).join(', ')}
      accessibilityHint="Shows the details"
    >
      <View style={styles.photoWrap}>
        {showImage ? (
          <Image
            source={{ uri: offer.imageUrl }}
            style={styles.photo}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            onError={() => setFailed(true)}
          />
        ) : (
          <LinearGradient colors={fallbackGradientFor(offer.title)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.photo}>
            <Ionicons name="ticket-outline" size={30} color="rgba(255,255,255,0.85)" />
          </LinearGradient>
        )}
        {offer.rating > 0 && (
          <RatingRow rating={offer.rating} reviews={offer.reviewCount} variant="soft" style={styles.ratingBadge} />
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{offer.title}</Text>
        <View style={styles.metaRow}>
          {!!duration && (
            <View style={styles.meta}>
              <Feather name="clock" size={12} color={COLORS.textMuted} />
              <Text style={styles.metaText}>{duration}</Text>
            </View>
          )}
          {offer.freeCancellation && (
            <View style={styles.meta}>
              <Feather name="check" size={12} color={COLORS.success} />
              <Text style={[styles.metaText, { color: COLORS.success }]} numberOfLines={1}>Free cancellation</Text>
            </View>
          )}
        </View>
        <View style={styles.footer}>
          {price ? (
            <Text style={styles.price} numberOfLines={1}>
              <Text style={styles.priceFrom}>from </Text>{price}
            </Text>
          ) : (
            <Text style={styles.priceFrom}>See prices</Text>
          )}
          <TouchableOpacity
            style={styles.book}
            onPress={onBook || onPress}
            activeOpacity={0.85}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={`Book ${offer.title} on Viator`}
          >
            <Text style={styles.bookText}>Book</Text>
            <Feather name="arrow-up-right" size={13} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E9EDF1',
    overflow: 'hidden',
  },
  photoWrap: {
    height: PHOTO_HEIGHT,
    backgroundColor: COLORS.sand,
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // The same white rating badge as the place cards ("4.6 ★ (2.3k)"), on the photo.
  ratingBadge: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    left: SIZES.spacing_sm,
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  body: {
    padding: SIZES.spacing_md,
    gap: 6,
    flex: 1,
  },
  title: {
    fontSize: SIZES.md,
    lineHeight: 19,
    minHeight: 38,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    minHeight: 16,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  metaText: {
    fontSize: SIZES.xs + 1,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
    marginTop: 2,
  },
  price: {
    flexShrink: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  priceFrom: {
    fontSize: SIZES.xs + 1,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  book: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  bookText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
