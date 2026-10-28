import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * GlassSurface — a reusable "glassmorphism" container that mimics a frosted
 * glass panel with a gradient rim, a top gloss sheen, and inner edge shadows.
 *
 * IMPORTANT sizing model:
 *   The CONTENT is the only in-flow child, so it defines the container's size.
 *   Every glass layer (blur, fill, gradients, edge lines) is an
 *   `absoluteFill` sibling *behind* the content — because they're absolute and
 *   the container's height comes from content, they stretch to match it.
 *   (The earlier bug: content had `flex:1` inside a plain View, collapsing to
 *   zero height, which made all the absolute glass layers zero-height too.)
 *
 * @param {number} radius       - border radius of the shape
 * @param {number} border       - rim thickness in px
 * @param {number} blurIntensity- BlurView intensity
 * @param {string} tint         - BlurView tint
 * @param {object} style        - extra styles for the outer container
 * @param {object} contentStyle - styles for the content wrapper (layout)
 */
export default function GlassSurface({
  children,
  radius = 24,
  border = 2,
  blurIntensity = 45,
  tint = 'light',
  style,
  contentStyle,
}) {
  return (
    <View style={[styles.container, { borderRadius: radius }, style]}>
      {/* Frosted blur — fills the whole container (sits behind content). */}
      <BlurView
        intensity={blurIntensity}
        tint={tint}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />

      {/* Dense frost fill so text stays readable over busy content. */}
      <View
        style={[StyleSheet.absoluteFill, styles.fill, { borderRadius: radius }]}
        pointerEvents="none"
      />

      {/* Subtle top gloss sheen. */}
      <LinearGradient
        colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />

      {/* Content — the in-flow child that defines the container's size. */}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // The container clips the glass layers to the rounded shape and carries the
    // lifted drop shadow. It sizes to its content.
    overflow: 'hidden',
    // Slightly cool border so the edge is visible even on a white background.
    borderWidth: 1,
    borderColor: 'rgba(190,196,208,0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  fill: {
    // A touch of cool grey (not pure white) so the panel reads on white
    // backgrounds, while staying light enough to look like glass over images.
    backgroundColor: 'rgba(236,238,243,0.5)',
  },
  content: {
    zIndex: 2,
  },
});
