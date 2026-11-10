import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/** Badge colour by score: deep green 4.5+, green 4.0+, amber below. */
function badgeColor(rating) {
  if (rating >= 4.5) return '#1b7a3e';
  if (rating >= 4.0) return '#2e9e57';
  return '#c77c02';
}

/** 980 -> "980", 2345 -> "2.3k", 12500 -> "12k", 1250000 -> "1.3M". */
export function compactCount(n) {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * Rating at a glance on place cards: a solid badge (★ 4.6, coloured by score)
 * and the review count in a matching neutral pill beside it ("2.3k reviews"). Renders nothing without
 * a rating.
 *
 * @param {number} rating
 * @param {number} [reviews]   number of ratings
 * @param {object} [style]
 */
export default function RatingRow({ rating, reviews, style }) {
  if (!(rating > 0)) return null;
  const score = Number(rating).toFixed(1);
  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={`Rated ${score}${reviews ? `, ${reviews.toLocaleString()} reviews` : ''}`}
    >
      <View style={[styles.badge, { backgroundColor: badgeColor(rating) }]}>
        <Text style={styles.score}>{score}</Text>
        <Ionicons name="star" size={10} color={COLORS.white} />
      </View>
      {reviews > 0 && (
        <View style={styles.reviewsPill}>
          <Ionicons name="chatbubble-ellipses-outline" size={11} color={COLORS.textSecondary} />
          <Text style={styles.reviews} numberOfLines={1}>
            {compactCount(reviews)} {reviews === 1 ? 'review' : 'reviews'}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  score: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  // Same height and shape as the badge, in a soft neutral tint.
  reviewsPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#eef1f4',
  },
  reviews: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
});
