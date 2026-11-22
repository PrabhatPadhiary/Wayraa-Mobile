import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useGlassMode, ANDROID_BLUR_METHOD } from '../utils/glass';

/** Liquid Glass tint: enough white behind the icons, still see-through. */
const LIQUID_TINT = 'rgba(255, 255, 255, 0.35)';

/**
 * GlassSurface: a reusable glass container. What it's made of depends on
 * the phone (see utils/glass):
 *
 *  - iPhone, iOS 26+: Apple's Liquid Glass (GlassView). It brings its own
 *    edge, light and shadow, so none of ours.
 *  - Older iPhones: a real blur, a light frost, a top sheen and a rim.
 *  - Android 12+: a real blur of `blurTarget` (the content behind, see
 *    BlurTargetContext) with the same frost and sheen. Without a target,
 *    or on Android 11 and older, a dense frost instead (no blur there).
 *
 * IMPORTANT sizing model:
 *   The CONTENT is the only in-flow child, so it defines the container's size.
 *   Every glass layer is an `absoluteFill` sibling *behind* the content, so
 *   they stretch to match it.
 *
 * @param {number} radius        - border radius of the shape
 * @param {number} blurIntensity - BlurView intensity
 * @param {string} tint          - BlurView tint
 * @param {object} blurTarget    - Android: ref to the BlurTargetView behind
 * @param {string|number} blurKey - Android: changes when the target does
 *                                   (the blur reads its target when it mounts)
 * @param {boolean} interactive  - iOS 26: glass reacts to touch
 * @param {object} style         - extra styles for the outer container
 * @param {object} contentStyle  - styles for the content wrapper (layout)
 */
export default function GlassSurface({
  children,
  radius = 24,
  blurIntensity = 45,
  tint = 'light',
  blurTarget,
  blurKey,
  interactive = false,
  style,
  contentStyle,
}) {
  const mode = useGlassMode();
  const rounded = { borderRadius: radius };

  if (mode === 'liquid') {
    return (
      <View style={[styles.liquidContainer, rounded, style]}>
        <GlassView
          style={[StyleSheet.absoluteFill, rounded]}
          // 'clear': see-through like Apple's own floating bars ('regular' is milkier).
          glassEffectStyle="clear"
          // A light tint so our dark icons and labels stay readable even over
          // dark photos (clear glass alone lets them show straight through).
          tintColor={LIQUID_TINT}
          isInteractive={interactive}
          colorScheme="light"
        />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }

  // Android only blurs with a target; otherwise it'd be a see-through layer.
  const realBlur = Platform.OS === 'ios' || (mode === 'blur' && !!blurTarget);

  return (
    <View style={[styles.container, rounded, style]}>
      {realBlur && (
        <BlurView
          key={Platform.OS === 'android' ? `blur-${blurKey ?? ''}` : undefined}
          intensity={blurIntensity}
          // Android: expo-blur's "light" tint lays ~35% white over the blur;
          // "default" is ~14%, so the glass stays see-through.
          tint={Platform.OS === 'android' ? 'default' : tint}
          blurTarget={Platform.OS === 'android' ? blurTarget : undefined}
          blurMethod={Platform.OS === 'android' ? ANDROID_BLUR_METHOD : undefined}
          style={[StyleSheet.absoluteFill, rounded]}
        />
      )}

      {/* Frost over the blur so text stays readable over busy content; dense
          where there's no blur, so what's behind still looks soft. */}
      <View
        style={[StyleSheet.absoluteFill, realBlur ? styles.fill : styles.fillDense, rounded]}
        pointerEvents="none"
      />

      {/* Subtle top gloss sheen. */}
      <LinearGradient
        colors={[Platform.OS === 'android' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={[StyleSheet.absoluteFill, rounded]}
        pointerEvents="none"
      />

      {/* Content — the in-flow child that defines the container's size. */}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // The container clips the glass layers to the rounded shape (Android's
    // blur needs this for round corners) and carries the lifted drop shadow.
    overflow: 'hidden',
    // Slightly cool border so the edge is visible even on a white background.
    borderWidth: 1,
    borderColor: 'rgba(190, 199, 208, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    // Android draws elevation shadows through a see-through surface, which
    // shows up as hard lines along the edges; the frost + border are enough.
    elevation: Platform.OS === 'android' ? 0 : 8,
  },
  // Liquid Glass draws its own edge, highlights and shadow.
  liquidContainer: {
    overflow: 'visible',
  },
  // Over a real blur: just a hint of cool grey so the panel reads on white
  // backgrounds; the blur keeps labels readable, so it stays see-through.
  fill: {
    backgroundColor: Platform.OS === 'android' ? 'rgba(244, 246, 248, 0.12)' : 'rgba(236, 240, 243, 0.22)',
  },
  // No blur behind: dense enough that content behind still looks soft.
  fillDense: {
    backgroundColor: 'rgba(247, 248, 249, 0.94)',
  },
  content: {
    zIndex: 2,
  },
});
