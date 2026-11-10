import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { fallbackGradientFor } from './PlaceTile';

/**
 * Trip page hero, built like the place page's: one photo per stop in a plain
 * swipeable row (no zoom, parallax or stretch), with the trip title, the
 * countdown pill and page dots on top. It scrolls with the page.
 * A stop without a usable photo gets a color gradient from its name.
 */

/** One page: the photo, or a name-based gradient when there's none. */
function HeroPage({ photo, width, height }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo.uri]);
  const showImage = !!photo.uri && !failed;
  return showImage ? (
    <Image
      source={{ uri: photo.uri }}
      style={{ width, height }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
      onError={() => setFailed(true)}
    />
  ) : (
    <LinearGradient
      colors={fallbackGradientFor(photo.name)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width, height }}
    />
  );
}

/**
 * @param {string} title
 * @param {object|null} countdown  { icon, value, label, sub, progress, color }
 * @param {Array<{ key: string, uri: string|null, name: string }>} photos
 * @param {number} height
 * @param {number} bottomInset     how far the sheet overlaps the hero bottom
 * @param {React.ReactNode} [children]  extra overlays (e.g. the round buttons)
 */
export default function TripHero({ title, countdown, photos, height, bottomInset, children }) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const multi = photos.length > 1;

  const pillText = countdown
    ? [`${countdown.value}${countdown.label ? ` ${countdown.label}` : ''}`, countdown.sub]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <View style={{ height, backgroundColor: COLORS.primary }}>
      <ScrollView
        horizontal
        pagingEnabled
        scrollEnabled={multi}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        accessibilityLabel={multi ? `Photos of each stop, ${page + 1} of ${photos.length}` : undefined}
      >
        {photos.map((p) => (
          <HeroPage key={p.key} photo={p} width={width} height={height} />
        ))}
      </ScrollView>

      {/* Top shade keeps the status bar and buttons readable; bottom shade
          keeps the title and countdown readable on bright photos. */}
      <LinearGradient colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']} style={styles.topShade} pointerEvents="none" />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.75)']}
        locations={[0, 0.4, 1]}
        style={styles.bottomShade}
        pointerEvents="none"
      />

      <View pointerEvents="none" style={[styles.titleBlock, { bottom: bottomInset + SIZES.spacing_base }]}>
        {multi && (
          <Text style={styles.stopCaption} numberOfLines={1}>
            Stop {page + 1} of {photos.length} · {photos[page]?.name}
          </Text>
        )}
        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>

        {pillText && (
          <View style={styles.pill} accessible accessibilityLabel={pillText}>
            <View style={styles.pillRow}>
              <Ionicons name={countdown.icon} size={14} color={countdown.color || COLORS.accent} />
              <Text style={styles.pillText} numberOfLines={1}>{pillText}</Text>
            </View>
            {countdown.progress != null && (
              <View style={styles.pillTrack}>
                <View
                  style={[
                    styles.pillFill,
                    {
                      width: `${Math.round(countdown.progress * 100)}%`,
                      backgroundColor: countdown.color || COLORS.accent,
                    },
                  ]}
                />
              </View>
            )}
          </View>
        )}

        {multi && (
          <View style={styles.dots}>
            {photos.map((p, i) => (
              <View key={p.key} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
        )}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },

  titleBlock: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    right: SIZES.spacing_lg,
  },
  stopCaption: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  pill: {
    alignSelf: 'flex-start',
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  pillTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  pillFill: {
    height: '100%',
    borderRadius: 2,
  },
  // Same as the place page: under the title, left-aligned.
  dots: {
    flexDirection: 'row',
    gap: 5,
    marginTop: SIZES.spacing_md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotActive: {
    width: 16,
    backgroundColor: COLORS.white,
  },
});
