import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Modal } from 'react-native';
import Svg, { Path, Ellipse } from 'react-native-svg';
import { COLORS, SIZES } from '../constants';

/*
 * The Wayraa logo, drawn in code and animated, for moments you wait:
 *  - the sun's rings brighten in a ripple, from the sun outwards
 *  - the sun bobs gently on the horizon
 *  - the waves sway
 *
 * Drawn on a 100 × 100 grid (scaled to `size`): sun on the horizon at y 50,
 * rings up to radius 35, waves below, all inside the circle.
 */

const RING_COUNT = 10;
const RING_MIN = 9;
const RING_MAX = 35;
// Inner rings orange, outer ones deep red (as in the logo).
const RING_COLORS = ['#f08a1c', '#ee7d18', '#ec7114', '#ea660e', '#e85d04', '#e3550f', '#dc4d18', '#d54820', '#ca4026', '#c0392b'];
// Waves: light at the horizon, deep blue lower down.
const WAVE_COLORS = ['#5cc6f0', '#48b8e4', '#38aad6', '#2ea6c6', '#2290b6', '#1688aa', '#13708f', '#0f5876', '#0b3d5a'];
const WAVE_TOP = 53;
const WAVE_GAP = 3.7;
const WAVELENGTH = 16;
const AMPLITUDE = 1.1;

/** Upper half of a circle (a ring above the horizon). */
const arc = (r) => `M ${50 - r} 50 A ${r} ${r} 0 0 1 ${50 + r} 50`;

/** A wavy line across the (wider than the circle) wave layer. */
function wave(y, width) {
  let d = `M 0 ${y}`;
  for (let x = 0; x <= width; x += 2) {
    d += ` L ${x} ${(y + Math.sin((x / WAVELENGTH) * Math.PI * 2) * AMPLITUDE).toFixed(2)}`;
  }
  return d;
}

/**
 * @param {number} [size]  width and height in points (default 72)
 */
export default function WayraaLoader({ size = 72 }) {
  const u = size / 100; // one grid unit, in points
  const pulse = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])),
      Animated.loop(Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [pulse, sway, bob]);

  // The wave layer is wider than the circle so it can sway; the circle clips it.
  const waveWidth = 70 + WAVELENGTH * 2;

  return (
    <View style={{ width: size, height: size }} accessibilityRole="progressbar" accessibilityLabel="Loading">
      {/* Rings: each its own layer, brightening in turn from the inside out. */}
      {RING_COLORS.map((color, i) => {
        const r = RING_MIN + ((RING_MAX - RING_MIN) * i) / (RING_COUNT - 1);
        const at = (i / RING_COUNT) * 0.55;
        return (
          <Animated.View
            key={i}
            style={[StyleSheet.absoluteFill, {
              opacity: pulse.interpolate({
                inputRange: [0, at, at + 0.15, at + 0.45, 1],
                outputRange: [0.3, 0.3, 1, 0.3, 0.3],
                extrapolate: 'clamp',
              }),
            }]}
          >
            <Svg width={size} height={size} viewBox="0 0 100 100">
              <Path d={arc(r)} stroke={color} strokeWidth={1.3} strokeLinecap="round" fill="none" />
            </Svg>
          </Animated.View>
        );
      })}

      {/* Sun, bobbing on the horizon (under the waves). */}
      <Animated.View
        style={[StyleSheet.absoluteFill, {
          transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -2.2 * u] }) }],
        }]}
      >
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Path d="M 43 50.5 A 7 7 0 0 1 57 50.5 Z" fill="#e85d04" />
          <Ellipse cx={50} cy={51} rx={5.2} ry={2.2} fill="#f4a020" />
        </Svg>
      </Animated.View>

      {/* Waves, swaying, clipped to the circle. */}
      <View
        style={{
          position: 'absolute',
          left: 15 * u,
          top: 15 * u,
          width: 70 * u,
          height: 70 * u,
          borderRadius: 35 * u,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            left: -WAVELENGTH * u,
            top: -15 * u,
            transform: [{ translateX: sway.interpolate({ inputRange: [0, 1], outputRange: [0, (WAVELENGTH / 2) * u] }) }],
          }}
        >
          <Svg width={waveWidth * u} height={100 * u} viewBox={`0 0 ${waveWidth} 100`}>
            {WAVE_COLORS.map((color, i) => (
              <Path
                key={i}
                d={wave(WAVE_TOP + i * WAVE_GAP, waveWidth)}
                stroke={color}
                strokeWidth={1.25 - i * 0.04}
                strokeLinecap="round"
                fill="none"
              />
            ))}
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * The loader straight on the screen: the page fades behind a soft warm-white
 * veil (still faintly visible, and not touchable meanwhile) with the animated
 * logo and a line under it in the middle (e.g. "Creating your trip…").
 *
 * @param {boolean} visible
 * @param {string} [message]
 */
export function LoaderOverlay({ visible, message }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [visible, fade]);

  if (!visible) return null;
  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={() => {}}>
      <Animated.View style={[styles.dim, { opacity: fade }]}>
        <Animated.View
          style={[styles.center, { transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}
          accessibilityLiveRegion="polite"
        >
          <WayraaLoader size={104} />
          {!!message && <Text style={styles.message}>{message}</Text>}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Warm white veil (the app's background colour), so the logo stands out.
  dim: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 251, 248, 0.9)',
  },
  center: {
    alignItems: 'center',
  },
  message: {
    marginTop: SIZES.spacing_base,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
});
