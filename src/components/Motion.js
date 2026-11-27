import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  Easing,
  useReducedMotion,
  cubicBezier,
} from 'react-native-reanimated';

/*
 * Small, shared bits of motion. Each one answers a moment rather than
 * decorating: a tap that took, a friend's new row, a group finished.
 * All of them stay still when the phone asks for reduced motion.
 */

/**
 * Pops its child when `active` turns on (a tick, a heart): a quick dip to
 * 85%, then a springy return. Nothing on first render or when turning off.
 */
export function PopOnTrue({ active, children, style }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const was = useRef(active);
  useEffect(() => {
    if (active && !was.current && !reduceMotion) {
      scale.value = withSequence(
        withTiming(0.85, { duration: 80, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 }),
      );
    }
    was.current = active;
  }, [active, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * Which rows just arrived from someone else (a live update), for a moment.
 *
 * Rows that appear after `liveKey` bumps (a friend changed the trip) are
 * "fresh" for ~1.2s; rows you add yourself, and the first load, are not.
 *
 * @param {object[]} items
 * @param {number} liveKey  bumps on each live update
 * @param {(item) => string} [getId]
 * @returns {Set<string>} fresh ids
 */
export function useLiveArrivals(items, liveKey, getId = (i) => i.id) {
  const known = useRef(null);
  const waiting = useRef(false); // a live update came; the reload is on its way
  const waitTimer = useRef(null);
  const clearTimer = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());

  useEffect(() => {
    if (!liveKey) return undefined;
    waiting.current = true;
    // If nothing new turns up soon, the next change is your own.
    clearTimeout(waitTimer.current);
    waitTimer.current = setTimeout(() => { waiting.current = false; }, 5000);
    return undefined;
  }, [liveKey]);

  useEffect(() => {
    const ids = (items || []).map(getId).filter(Boolean);
    if (known.current && waiting.current) {
      const arrived = ids.filter((id) => !known.current.has(id));
      if (arrived.length) {
        waiting.current = false;
        setFresh(new Set(arrived));
        clearTimeout(clearTimer.current);
        clearTimer.current = setTimeout(() => setFresh(new Set()), 1200);
      }
    }
    known.current = new Set(ids);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    clearTimeout(waitTimer.current);
    clearTimeout(clearTimer.current);
  }, []);

  return fresh;
}

/**
 * A soft orange wash over a row that fades away once: "this is the new
 * one". Put it as the first child of the row (it fills it, under the
 * content). Shown when `active` turns on.
 */
export function ArrivalGlow({ active, color = '#FDE3D7', radius = 0, style }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (!active) return;
    opacity.value = withSequence(
      withTiming(1, { duration: reduceMotion ? 0 : 160 }),
      withDelay(reduceMotion ? 700 : 250, withTiming(0, { duration: reduceMotion ? 0 : 900, easing: Easing.out(Easing.quad) })),
    );
  }, [active, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.glow, { backgroundColor: color, borderRadius: radius }, style, animated]}
    />
  );
}

/**
 * Pulses its child once when `done` turns on (a checklist group finished):
 * a green wash behind it that blooms and fades, with a small lift.
 */
export function DonePulse({ done, children, style, color = '#DDF1E5' }) {
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(0);
  const lift = useSharedValue(1);
  const was = useRef(done);
  useEffect(() => {
    if (done && !was.current && !reduceMotion) {
      glow.value = withSequence(withTiming(1, { duration: 180 }), withDelay(500, withTiming(0, { duration: 600 })));
      lift.value = withSequence(
        withTiming(1.12, { duration: 160, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 10, stiffness: 260 }),
      );
    }
    was.current = done;
  }, [done, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const wash = useAnimatedStyle(() => ({ opacity: glow.value }));
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: lift.value }] }));
  return (
    <Animated.View style={[style, scale]}>
      <Animated.View pointerEvents="none" style={[styles.pulse, { backgroundColor: color }, wash]} />
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  pulse: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -8,
    right: -8,
    borderRadius: 12,
  },
});

/**
 * Press feedback for anything tappable: the content dips to `scale` the
 * moment a finger lands (120ms, strong ease-out) and comes back on release,
 * so a tap reads as physical before the screen changes. A CSS transition on
 * the UI thread; React only renders on press in / out. With reduced motion
 * it dims a little instead of shrinking.
 *
 * Takes Pressable's props (onPress, onLongPress, accessibility...). `style`
 * goes on the moving view, so backgrounds and radii shrink with it;
 * `containerStyle` on the Pressable (e.g. flex: 1 in a row). `haptic` adds a
 * light selection tick on press.
 */
export function PressScale({ children, style, containerStyle, scale = 0.97, haptic = false, onPress, onPressIn, onPressOut, ...rest }) {
  const reduceMotion = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      style={containerStyle}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      onPressIn={(e) => { setPressed(true); onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); onPressOut?.(e); }}
      pressRetentionOffset={16}
    >
      <Animated.View
        style={[
          style,
          pressStyles.base,
          pressed && (reduceMotion ? pressStyles.dim : { transform: [{ scale }] }),
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

const pressStyles = StyleSheet.create({
  base: {
    transform: [{ scale: 1 }],
    opacity: 1,
    transitionProperty: ['transform', 'opacity'],
    transitionDuration: '120ms',
    // A string 'cubic-bezier(...)' isn't accepted here; it must be built.
    transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
  },
  dim: { opacity: 0.75 },
});
