import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS, SIZES, TRIP_HERO_HEIGHT } from '../constants';
import Skeleton from './Skeleton';
import { TRIP_CARD_HEIGHT, TRIP_CARD_OVERLAP } from './TripStackCard';

/**
 * Ready-made loading placeholders shaped like the real content they stand in
 * for, so the page doesn't jump when the data arrives. Each group is exposed
 * to screen readers as one "loading" item rather than many empty boxes.
 */

function Group({ label, style, children }) {
  return (
    <View
      style={style}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      {children}
    </View>
  );
}

/** Explore: the featured next-trip card (190px tall, same margins). */
export function NextTripCardSkeleton() {
  return (
    <Group label="Loading your trip" style={styles.nextTrip}>
      <Skeleton width="100%" height={190} radius={SIZES.radius_lg} />
    </Group>
  );
}

/** A horizontal row of photo tiles (Recently Explored / favourites / Near You). */
export function TileRowSkeleton({ count = 3, width = 150, height = 190, label = 'Loading places' }) {
  return (
    <Group label={label} style={styles.tileRow}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={width} height={height} radius={SIZES.radius_lg} />
      ))}
    </Group>
  );
}

/** Explore: the Near You row (wider, shorter cards). */
export function NearbyRowSkeleton() {
  return <TileRowSkeleton count={2} width={240} height={200} label="Loading places near you" />;
}

/** Explore: community journal cards (200px wide, photo plus two text lines). */
export function JournalRowSkeleton({ count = 2 }) {
  return (
    <Group label="Loading journals" style={styles.tileRow}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.journalCard}>
          <Skeleton width="100%" height={120} radius={0} />
          <View style={styles.journalBody}>
            <Skeleton width="85%" height={14} />
            <Skeleton width="55%" height={11} style={styles.gapTop} />
          </View>
        </View>
      ))}
    </Group>
  );
}

/** My Trips: stacked photo cards, same size and overlap as TripStackCard. */
export function TripListSkeleton({ count = 3 }) {
  return (
    <Group label="Loading your trips" style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.tripStackCard, i > 0 && { marginTop: -TRIP_CARD_OVERLAP }]}
        >
          <Skeleton width="100%" height={TRIP_CARD_HEIGHT} radius={28} />
        </View>
      ))}
    </Group>
  );
}

/** Two-column place cards (Favorites, Category Results, Destination results). */
export function GridSkeleton({ count = 6, gap = SIZES.spacing_base, label = 'Loading places' }) {
  const rows = Math.ceil(count / 2);
  return (
    <Group label={label} style={styles.list}>
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={[styles.gridRow, { gap, marginBottom: gap }]}>
          {[0, 1].map((col) => (
            <View key={col} style={styles.gridCard}>
              <Skeleton width="100%" height={120} radius={0} />
              <View style={styles.gridBody}>
                <Skeleton width="80%" height={14} />
                <Skeleton width="60%" height={10} style={styles.gapTopSmall} />
                <Skeleton width="40%" height={10} style={styles.gapTopSmall} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </Group>
  );
}

/** Trip Detail: hero photo plus the sheet (badge, title, meta, tiles, places). */
export function TripDetailSkeleton() {
  return (
    <Group label="Loading trip" style={styles.fill}>
      <Skeleton width="100%" height={TRIP_HERO_HEIGHT} radius={0} />
      <View style={styles.sheet}>
        <Skeleton width={84} height={24} radius={SIZES.radius_full} />
        <Skeleton width="70%" height={30} style={styles.gapTop} />
        <Skeleton width="45%" height={14} style={styles.gapTop} />
        <Skeleton width="55%" height={14} style={styles.gapTopSmall} />

        <View style={styles.statsRow}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.statTile}>
              <Skeleton width="100%" height={72} radius={SIZES.radius_md} />
            </View>
          ))}
        </View>

        <Skeleton width="40%" height={22} style={styles.sectionGap} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.placeRow}>
            <Skeleton width={64} height={64} radius={SIZES.radius_sm} />
            <View style={styles.placeText}>
              <Skeleton width="70%" height={14} />
              <Skeleton width="50%" height={11} style={styles.gapTopSmall} />
            </View>
          </View>
        ))}
      </View>
    </Group>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  gapTop: {
    marginTop: SIZES.spacing_sm,
  },
  gapTopSmall: {
    marginTop: 6,
  },
  sectionGap: {
    marginTop: SIZES.spacing_xl,
    marginBottom: SIZES.spacing_md,
  },

  nextTrip: {
    marginHorizontal: SIZES.spacing_lg,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: SIZES.spacing_lg,
    overflow: 'hidden',
  },

  journalCard: {
    width: 200,
    borderRadius: SIZES.radius_md,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
  },
  journalBody: {
    padding: SIZES.spacing_md,
  },

  list: {
    paddingHorizontal: SIZES.spacing_base,
  },
  // Each card gets a white edge so the overlapping placeholders stay
  // distinguishable while pulsing.
  tripStackCard: {
    borderRadius: 28,
    borderWidth: 2,
    borderColor: COLORS.white,
    backgroundColor: COLORS.white,
  },

  gridRow: {
    flexDirection: 'row',
  },
  gridCard: {
    flex: 1,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.white,
  },
  gridBody: {
    padding: SIZES.spacing_md,
  },

  sheet: {
    marginTop: -SIZES.spacing_lg,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_lg,
  },
  statTile: {
    flex: 1,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginBottom: SIZES.spacing_md,
  },
  placeText: {
    flex: 1,
  },
});
