import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import Skeleton from './Skeleton';
import { fallbackGradientFor } from './PlaceTile';
import { avatarColorFor, initialsFor } from './TripStackCard';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

const TILE_COUNT = 4;  // under the featured story, two per row
const FEATURED_HEIGHT = 230;
const TILE_HEIGHT = 190;

const FEATURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const timeOf = (j) => new Date(j.publishedAt || j.createdAt || 0).getTime() || 0;

/**
 * The story to feature: the most liked of the last 7 days (the newer one on
 * a tie), with a photo. Nothing that recent: the most liked overall.
 */
function pickFeatured(journals) {
  const withPhoto = journals.filter((j) => j.photos?.[0]?.url);
  const pool = withPhoto.length ? withPhoto : journals;
  const recent = pool.filter((j) => Date.now() - timeOf(j) <= FEATURE_WINDOW_MS);
  const best = (list) => [...list].sort((a, b) => (b.likesCount || 0) - (a.likesCount || 0) || timeOf(b) - timeOf(a))[0];
  return best(recent.length ? recent : pool);
}

const coverOf = (j, width) => cloudinarySized(j?.photos?.[0]?.url || null, width);

/** Round author photo, or their initials on a colour from their name. */
function Avatar({ author, size }) {
  const name = author?.name || 'Traveller';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColorFor(name) }]}>
      {author?.photoUrl ? (
        <Image
          source={{ uri: cloudinarySized(author.photoUrl, IMAGE_WIDTH.AVATAR) }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          contentFit="cover"
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initialsFor(name)}</Text>
      )}
    </View>
  );
}

/**
 * Home's "From the community": the most loved story of the past week
 * big (photo, title, author, place, likes), then the next few as photo
 * tiles, two side by side. Tap opens the story. Sits on its own tinted band (see ExploreScreen).
 *
 * @param {Array} journals   the feed, newest first
 * @param {boolean} loading
 * @param {object} navigation
 */
export default function CommunityHighlights({ journals, loading, navigation }) {
  const { width } = useWindowDimensions();

  if (loading) {
    return (
      <View style={styles.wrap} accessibilityLabel="Loading stories">
        <Skeleton width="100%" height={FEATURED_HEIGHT} radius={22} />
        <View style={styles.tileRow}>
          <View style={styles.tileCell}><Skeleton width="100%" height={TILE_HEIGHT} radius={18} /></View>
          <View style={styles.tileCell}><Skeleton width="100%" height={TILE_HEIGHT} radius={18} /></View>
        </View>
      </View>
    );
  }

  if (!journals?.length) {
    return (
      <TouchableOpacity
        style={[styles.wrap, styles.empty]}
        onPress={() => navigation.navigate('WriteJournal')}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <Ionicons name="book-outline" size={22} color={COLORS.accentDeep} />
        <Text style={styles.emptyText}>No stories yet. Be the first to share one.</Text>
      </TouchableOpacity>
    );
  }

  // The most loved recent story leads; the rest follow, newest first, in
  // full rows of two (a single one left over spans the row).
  const featured = pickFeatured(journals);
  const others = journals.filter((j) => j.id !== featured.id).slice(0, TILE_COUNT);
  const rest = others.length > 1 ? others.slice(0, others.length - (others.length % 2)) : others;
  const rows = [];
  for (let i = 0; i < rest.length; i += 2) rows.push(rest.slice(i, i + 2));
  const open = (j) => navigation.navigate('JournalDetail', { journalId: j.id, title: j.title });
  const featuredCover = coverOf(featured, IMAGE_WIDTH.PHOTO);
  const byline = (j) => [j.author?.name || 'Traveller', j.destination].filter(Boolean).join(' · ');

  return (
    <View style={styles.wrap}>
      {/* Featured */}
      <TouchableOpacity
        style={[styles.featured, { height: Math.min(FEATURED_HEIGHT, width * 0.62) }]}
        onPress={() => open(featured)}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={`${featured.title}, by ${byline(featured)}`}
      >
        {featuredCover ? (
          <Image source={{ uri: featuredCover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" />
        ) : (
          <LinearGradient colors={fallbackGradientFor(featured.destination)} style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.78)']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
        {(featured.likesCount || 0) > 0 && (
          <View style={styles.tag}>
            <Ionicons name="heart" size={12} color={COLORS.accent} />
            <Text style={styles.tagText}>{Date.now() - timeOf(featured) <= FEATURE_WINDOW_MS ? 'Most loved this week' : 'Most loved'}</Text>
          </View>
        )}
        <View style={styles.featuredBody}>
          <Text style={styles.featuredTitle} numberOfLines={2}>{featured.title}</Text>
          <View style={styles.featuredMeta}>
            <Avatar author={featured.author} size={24} />
            <Text style={styles.featuredBy} numberOfLines={1}>{byline(featured)}</Text>
            <View style={styles.likes}>
              <Ionicons name={featured.isLiked ? 'heart' : 'heart-outline'} size={15} color={COLORS.white} />
              <Text style={styles.likesTextLight}>{featured.likesCount || 0}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* The next few: photo tiles, two side by side. */}
      {rows.map((pair) => (
        <View key={pair[0].id} style={styles.tileRow}>
          {pair.map((j) => {
            const cover = coverOf(j, IMAGE_WIDTH.COVER);
            return (
              <TouchableOpacity
                key={j.id}
                style={[styles.tileCell, styles.tile]}
                onPress={() => open(j)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={`${j.title}, by ${byline(j)}, ${j.likesCount || 0} likes`}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                ) : (
                  <LinearGradient colors={fallbackGradientFor(j.destination)} style={StyleSheet.absoluteFill} />
                )}
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
                  locations={[0, 0.4, 1]}
                  style={StyleSheet.absoluteFill}
                />
                {(j.likesCount || 0) > 0 && (
                  <View style={styles.tileLikes}>
                    <Ionicons name={j.isLiked ? 'heart' : 'heart-outline'} size={12} color={COLORS.white} />
                    <Text style={styles.tileLikesText}>{j.likesCount}</Text>
                  </View>
                )}
                <View style={styles.tileBody}>
                  <Text style={styles.tileTitle} numberOfLines={2}>{j.title}</Text>
                  <View style={styles.tileMeta}>
                    <Avatar author={j.author} size={20} />
                    <Text style={styles.tileBy} numberOfLines={1}>{j.author?.name || 'Traveller'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SIZES.spacing_lg,
  },
  featured: {
    borderRadius: 22,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: COLORS.primary,
  },
  tag: {
    position: 'absolute',
    top: SIZES.spacing_md,
    left: SIZES.spacing_md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  tagText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  featuredBody: {
    padding: SIZES.spacing_base,
  },
  featuredTitle: {
    fontSize: SIZES.lg,
    lineHeight: 26,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_sm,
  },
  featuredBy: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.9)',
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  likes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likesTextLight: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  tileRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_md,
  },
  tileCell: {
    flex: 1,
  },
  tile: {
    height: TILE_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: COLORS.primary,
  },
  tileLikes: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    right: SIZES.spacing_sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  tileLikesText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  tileBody: {
    padding: SIZES.spacing_md,
  },
  tileTitle: {
    fontSize: SIZES.md,
    lineHeight: 19,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  tileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  tileBy: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.9)',
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginHorizontal: SIZES.spacing_lg,
    paddingVertical: SIZES.spacing_base,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },
  emptyText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
});
