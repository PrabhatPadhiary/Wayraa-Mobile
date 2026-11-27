import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import ActivityOfferCard, { ACTIVITY_CARD_WIDTH } from './ActivityOfferCard';
import Skeleton from './Skeleton';
import {
  getDestinationActivities,
  getPlaceActivities,
  peekDestinationActivities,
  peekPlaceActivities,
  openOffer,
} from '../services/offersService';

/** Load tours for a place or a destination: the last copy at once, then fresh. */
export function useActivityOffers(source) {
  const { kind, name, lat, lng, exact, theme } = source || {};
  const ready = !!source && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const peek = () => {
    if (!ready) return undefined;
    return kind === 'place' ? peekPlaceActivities({ name, lat, lng, exact }) : peekDestinationActivities({ name, lat, lng, theme });
  };
  const [result, setResult] = useState(peek);

  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    setResult(peek());
    const load = kind === 'place' ? getPlaceActivities({ name, lat, lng, exact }) : getDestinationActivities({ name, lat, lng, theme });
    load.then((r) => { if (live) setResult(r); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, kind, name, lat, lng, exact, theme]);

  return { result, loading: ready && result === undefined };
}

/** The partner and the commission note, shown under every list of offers. */
export function OffersDisclosure({ style }) {
  return (
    <Text style={[styles.disclosure, style]}>
      Booked on Viator. Wayraa may earn a commission.
    </Text>
  );
}

/**
 * A row of tours and tickets you can book (Viator). Hidden when there are none.
 *
 * @param {{ kind: 'place'|'destination', name: string, lat: number, lng: number, exact?: boolean,
 *   theme?: 'food' }} source  theme 'food': food tours and cooking classes only
 * @param {(result) => string} [title]  heading from the result ({ scope, areaName })
 * @param {'card'|'plain'} [variant]   'card': a white card like the place page's
 *   sections; 'plain': a heading and the row, for lists
 * @param {number} [inset]  side padding of the row ('plain'), so cards line up with the page
 * @param {object} [titleStyle]  heading style ('plain'), to match the page's section titles
 * @param {object} [style]
 */
export default function BookableActivities({ source, title, variant = 'card', inset = 0, titleStyle, style }) {
  const navigation = useNavigation();
  const { result, loading } = useActivityOffers(source);
  const items = result?.items || [];
  if (!loading && items.length === 0) return null;

  const heading = title
    ? title(result || {})
    : result?.scope === 'place' ? 'Tours & tickets' : `Things to book in ${result?.areaName || source?.name || 'the area'}`;

  const seeAllPhotos = [...new Set(items.map((o) => o.imageUrl).filter(Boolean))];
  // 4+ different photos: a mosaic. Fewer: a plain card like the tour cards
  // (their photos are already in the row beside it).
  const mosaic = seeAllPhotos.length >= 4;

  const open = (url) => {
    Haptics.selectionAsync().catch(() => {});
    openOffer(url);
  };

  const row = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal: variant === 'plain' ? inset : SIZES.spacing_base }]}
      style={variant === 'card' ? styles.cardRowBleed : null}
    >
      {loading
        ? [0, 1, 2].map((i) => (
          <View key={i} style={styles.skeletonCard}>
            <Skeleton height={136} radius={0} />
            <View style={styles.skeletonBody}>
              <Skeleton height={14} width="90%" />
              <Skeleton height={14} width="60%" />
              <Skeleton height={18} width="45%" />
            </View>
          </View>
        ))
        : items.map((offer) => (
          <ActivityOfferCard
            key={offer.id}
            offer={offer}
            onPress={() => navigation.navigate('ActivityDetail', { offer, areaName: result?.areaName })}
            onBook={() => open(offer.bookingUrl)}
          />
        ))}
      {!loading && !!result?.seeAllUrl && (
        <TouchableOpacity
          style={[styles.seeAll, !mosaic && styles.seeAllPlain]}
          activeOpacity={0.85}
          onPress={() => open(result.seeAllUrl)}
          accessibilityRole="link"
          accessibilityLabel={`See all tours in ${result.areaName || 'this area'} on Viator`}
        >
          {mosaic ? (
            <>
              {/* A 2x2 mosaic of the tours' photos hints at what's behind it. */}
              <View style={styles.seeAllMosaic}>
                {seeAllPhotos.slice(-4).map((uri, i) => (
                  <Image key={i} source={{ uri }} style={styles.seeAllTile} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                ))}
              </View>
              <LinearGradient
                colors={['rgba(43, 63, 81, 0.55)', 'rgba(43, 63, 81, 0.9)']}
                style={styles.seeAllShade}
                pointerEvents="none"
              />
            </>
          ) : null}
          <View style={styles.seeAllBody}>
            <View style={[styles.seeAllIcon, !mosaic && styles.seeAllIconPlain]}>
              <Feather name="arrow-up-right" size={20} color={mosaic ? COLORS.primary : COLORS.accentDeep} />
            </View>
            <Text style={[styles.seeAllText, !mosaic && { color: COLORS.primary }]}>See all</Text>
            <Text style={[styles.seeAllSub, !mosaic && { color: COLORS.textSecondary }]} numberOfLines={3}>
              {`More tours in ${result.areaName || 'this area'} on Viator`}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  if (variant === 'plain') {
    return (
      <View style={style}>
        <Text style={[styles.plainTitle, { paddingHorizontal: inset }, titleStyle]} numberOfLines={1}>{loading ? 'Things to book' : heading}</Text>
        {row}
        <OffersDisclosure style={{ paddingHorizontal: inset }} />
      </View>
    );
  }

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Feather name="tag" size={15} color={COLORS.accentDeep} />
        </View>
        <Text style={styles.headTitle} numberOfLines={1}>{loading ? 'Tours & tickets' : heading}</Text>
      </View>
      {row}
      <OffersDisclosure />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    borderWidth: 1,
    borderColor: '#E9EDF1',
    shadowColor: '#2B3F51',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_md,
  },
  headIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FDEFEA',
  },
  headTitle: {
    flexShrink: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  plainTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
    marginBottom: SIZES.spacing_md,
  },
  // Inside the card the row runs to the card's edges while scrolling.
  cardRowBleed: {
    marginHorizontal: -SIZES.spacing_base,
  },
  row: {
    gap: SIZES.spacing_md,
  },
  skeletonCard: {
    width: ACTIVITY_CARD_WIDTH,
    borderRadius: SIZES.radius_lg,
    borderWidth: 1,
    borderColor: '#E9EDF1',
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  skeletonBody: {
    padding: SIZES.spacing_md,
    gap: 8,
  },
  // Same look as Home's "See all" on Near you; as tall as the tour cards.
  seeAll: {
    width: 150,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    backgroundColor: COLORS.primary,
  },
  seeAllMosaic: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  seeAllTile: {
    width: '50%',
    height: '50%',
  },
  // A soft warm tint (the brand orange, very light), so it reads as the
  // row's "more" card without photos.
  seeAllPlain: {
    backgroundColor: '#FDF1EC',
    borderWidth: 1,
    borderColor: '#F7DDD2',
  },
  seeAllIconPlain: {
    backgroundColor: COLORS.white,
  },
  seeAllShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  seeAllBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_md,
  },
  seeAllIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginBottom: SIZES.spacing_sm,
  },
  seeAllText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  seeAllSub: {
    marginTop: 2,
    textAlign: 'center',
    fontSize: SIZES.xs + 1,
    lineHeight: 15,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.88)',
  },
  disclosure: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.xs + 1,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
});
