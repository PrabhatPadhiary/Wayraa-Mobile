import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, AccessibilityInfo, Easing, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { fallbackGradientFor } from './PlaceTile';

/**
 * Trip page hero, in two parts that share Animated values owned by the screen:
 *
 *  - TripHeroBackdrop: fixed behind the scrolling sheet. Shows one photo per
 *    stop (a swipeable carousel on multi-stop trips), with a slow drift-zoom,
 *    parallax as the sheet covers it, and a stretch when pulled down (iOS).
 *    A stop without a usable photo gets a color gradient from its name.
 *
 *  - TripHeroOverlay: sits in the scroll content over the backdrop. Holds the
 *    trip title, the countdown pill and page dots, plus an invisible paging
 *    scroller that drives the backdrop carousel. The title shrinks and fades
 *    as it reaches the header, where the header title takes over.
 *
 * `scrollY` is the page's vertical scroll; `pageX` the carousel's horizontal
 * offset (an Animated.Value(0) created by the screen).
 */

// Slow zoom ("Ken Burns"): scale range and one-way duration.
const DRIFT_SCALE = 1.08;
const DRIFT_MS = 20000;
// Parallax: the photo moves up at this fraction of the scroll speed.
const PARALLAX = 0.5;

/** True while the OS "reduce motion" setting is on. */
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduce(!!v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduce(!!v));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);
  return reduce;
}

/** One carousel page: the photo, or a name-based gradient when there's none. */
function HeroPage({ photo, width, height, drift }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo.uri]);
  const showImage = !!photo.uri && !failed;
  return (
    <View style={{ width, height, overflow: 'hidden' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: drift }] }]}>
        {showImage ? (
          <Image
            source={{ uri: photo.uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={250}
            onError={() => setFailed(true)}
          />
        ) : (
          <LinearGradient
            colors={fallbackGradientFor(photo.name)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
      </Animated.View>
    </View>
  );
}

/**
 * @param {Array<{ key: string, uri: string|null, name: string }>} photos
 * @param {Animated.Value} scrollY
 * @param {Animated.Value} pageX
 * @param {number} height
 */
export function TripHeroBackdrop({ photos, scrollY, pageX, height }) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const drift = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) {
      drift.setValue(1);
      return undefined;
    }
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: DRIFT_SCALE, duration: DRIFT_MS, easing: ease, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 1, duration: DRIFT_MS, easing: ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, drift]);

  // Scrolling up: the photo rises at half speed (parallax).
  const translateY = scrollY.interpolate({
    inputRange: [0, height],
    outputRange: [0, -height * PARALLAX],
    extrapolate: 'clamp',
  });
  // Pulling down past the top (iOS bounce): grow from the top edge so the
  // photo keeps covering the gap above the sheet.
  const stretch = scrollY.interpolate({
    inputRange: [-height, 0],
    outputRange: [2, 1],
    extrapolateLeft: 'extend',
    extrapolateRight: 'clamp',
  });

  const count = Math.max(1, photos.length);

  return (
    <Animated.View
      style={[
        styles.backdrop,
        { height, transform: [{ translateY }, { scale: stretch }] },
      ]}
      pointerEvents="none"
    >
      <Animated.View
        style={{
          flexDirection: 'row',
          width: width * count,
          height,
          transform: [{ translateX: Animated.multiply(pageX, -1) }],
        }}
      >
        {photos.map((photo) => (
          <HeroPage key={photo.key} photo={photo} width={width} height={height} drift={drift} />
        ))}
      </Animated.View>

      {/* Top shade keeps the status bar and buttons readable; bottom shade
          keeps the title and countdown readable on bright photos. */}
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']}
        style={styles.topShade}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.6)']}
        locations={[0, 0.45, 1]}
        style={styles.bottomShade}
      />
    </Animated.View>
  );
}

/**
 * @param {string} title
 * @param {object|null} countdown  { icon, value, label, sub, progress, color }
 * @param {Array} photos           same list as the backdrop
 * @param {Animated.Value} scrollY
 * @param {Animated.Value} pageX
 * @param {number} height          hero height (the overlay fills it)
 * @param {number} bottomInset     how far the sheet overlaps the hero bottom
 * @param {number} handoffAt       scroll offset where the header has fully
 *                                 appeared; the title is gone just before it
 */
export function TripHeroOverlay({
  title,
  countdown,
  photos,
  scrollY,
  pageX,
  height,
  bottomInset,
  handoffAt,
}) {
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const multi = photos.length > 1;

  // Title shrinks a little as you scroll, then fades out just before it
  // would slide under the header (whose own title fades in to replace it).
  // Clamped so the ranges stay increasing even on very short screens.
  const goneAt = Math.max(80, handoffAt - 70);
  const titleOpacity = scrollY.interpolate({
    inputRange: [goneAt - 80, goneAt],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const titleScale = scrollY.interpolate({
    inputRange: [0, goneAt],
    outputRange: [1, 0.86],
    extrapolate: 'clamp',
  });

  const pillText = countdown
    ? [`${countdown.value}${countdown.label ? ` ${countdown.label}` : ''}`, countdown.sub]
        .filter(Boolean)
        .join(' · ')
    : null;

  return (
    <View style={{ height }} pointerEvents="box-none">
      {/* Invisible pager: swiping here moves the backdrop photos. */}
      {multi && (
        <Animated.ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={StyleSheet.absoluteFill}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: pageX } } }], {
            useNativeDriver: true,
          })}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          accessibilityLabel={`Photos of each stop, ${page + 1} of ${photos.length}`}
        >
          {photos.map((p) => (
            <View key={p.key} style={{ width, height }} />
          ))}
        </Animated.ScrollView>
      )}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.titleBlock,
          {
            bottom: bottomInset + SIZES.spacing_base,
            opacity: titleOpacity,
            transform: [{ scale: titleScale }],
          },
        ]}
      >
        {multi && (
          <Text style={styles.stopCaption} numberOfLines={1}>
            Stop {page + 1} of {photos.length} · {photos[page]?.name}
          </Text>
        )}
        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>

        <View style={styles.bottomRow}>
          {pillText ? (
            <View
              style={styles.pill}
              accessible
              accessibilityLabel={pillText}
            >
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
          ) : <View />}

          {multi && (
            <View style={styles.dots}>
              {photos.map((p, i) => (
                <View key={p.key} style={[styles.dot, i === page && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Stretch grows from the top edge, so the photo stays pinned to the top.
    transformOrigin: 'top',
  },
  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },

  titleBlock: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    right: SIZES.spacing_lg,
    transformOrigin: 'left bottom',
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
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_sm,
  },
  pill: {
    flexShrink: 1,
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
  dots: {
    flexDirection: 'row',
    gap: 6,
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
