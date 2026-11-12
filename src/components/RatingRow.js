import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/** 980 -> "980", 2345 -> "2.3k", 12500 -> "12k", 1250000 -> "1.3M". */
export function compactCount(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

// Trying a gold star everywhere (Google's). Set to null to go back to a star
// the same colour as the number.
const STAR_COLOR = '#FBBC04';

/** Badge colour by score: deep green 4.5+, green 4.0+, amber below. */
function badgeColor(rating) {
  if (rating >= 4.5) return '#1b7a3e';
  if (rating >= 4.0) return '#2e9e57';
  return '#c77c02';
}

/**
 * The same rating as plain text, for lines that mix it with other details
 * ("4.6 ★ (2.3k) · Ubud"). Empty string without a rating.
 */
export function ratingText(rating, reviews) {
  if (!(rating > 0)) return '';
  const count = reviews > 0 ? ` (${compactCount(reviews)})` : '';
  return `${Number(rating).toFixed(1)} ★${count}`;
}

/**
 * A rating the way Google shows it on cards: "4.3 ★ (23k)". The star is the
 * same colour as the number everywhere in the app (dark on light, white on
 * photos); the review count is quieter. Renders nothing without a rating.
 *
 * @param {number} rating
 * @param {number} [reviews]   number of ratings
 * @param {'dark'|'light'} [tone]  'light' for white text over photos
 * @param {number} [size]      font size (default SIZES.sm)
 * @param {'badge'|'soft'} [variant]  a pill, "4.6 ★ (2.3k)": 'badge' solid,
 *   coloured by score (the place page's header); 'soft' a quiet light-grey
 *   pill with dark text (cards)
 * @param {object} [style]
 */
export default function RatingRow({ rating, reviews, tone = 'dark', size = SIZES.sm, variant, style }) {
  if (!(rating > 0)) return null;
  const score = Number(rating).toFixed(1);
  if (variant === 'badge' || variant === 'soft') {
    return <RatingBadge rating={rating} score={score} reviews={reviews} soft={variant === 'soft'} style={style} />;
  }
  const light = tone === 'light';
  const main = light ? COLORS.white : COLORS.textPrimary;
  const muted = light ? 'rgba(255,255,255,0.8)' : COLORS.textSecondary;
  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={`Rated ${score}${reviews ? `, ${reviews.toLocaleString()} reviews` : ''}`}
    >
      <Text style={[styles.score, { fontSize: size, color: main }]}>{score}</Text>
      <Ionicons name="star" size={Math.round(size * 0.9)} color={STAR_COLOR || main} style={styles.star} />
      {reviews > 0 && (
        <Text style={[styles.count, { fontSize: size, color: muted }]} numberOfLines={1}>
          ({compactCount(reviews)})
        </Text>
      )}
    </View>
  );
}

function RatingBadge({ rating, score, reviews, soft, style }) {
  const main = soft ? COLORS.textPrimary : COLORS.white;
  return (
    <View
      style={[styles.badge, { backgroundColor: soft ? '#f0f2f5' : badgeColor(rating) }, style]}
      accessible
      accessibilityLabel={`Rated ${score}${reviews ? `, ${reviews.toLocaleString()} reviews` : ''}`}
    >
      <Text style={[styles.badgeScore, { color: main }]}>{score}</Text>
      <Ionicons name="star" size={10} color={STAR_COLOR || main} style={styles.badgeStar} />
      {reviews > 0 && (
        <Text style={[styles.badgeCount, soft && { color: COLORS.textSecondary }]} numberOfLines={1}>
          ({compactCount(reviews)})
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  score: {
    fontFamily: 'Poppins_600SemiBold',
  },
  star: {
    marginLeft: 3,
    marginTop: -1,
  },
  count: {
    marginLeft: 4,
    fontFamily: 'Poppins_400Regular',
    flexShrink: 1,
  },

  // variant="badge": one pill, coloured by score — "4.6 ★ (2.3k)"
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeScore: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  badgeStar: {
    marginLeft: 3,
    marginTop: -1,
  },
  badgeCount: {
    marginLeft: 5,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.88)',
  },
});
