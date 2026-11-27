import React, { useEffect, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants';

/*
 * A deleted trip's ticket, ripped in half: it splits along its own tear
 * line (the dots before the photo stub). The two halves first peel apart at
 * the top, as if the tear runs down, then twist away from each other and
 * fall off the screen. Little paper teeth line the torn edges, and the phone
 * gives a ripping buzz as it tears. The tear runs down first (about 1s) with
 * the ticket in place; only then do the halves part and fall (about 1.2s).
 * With reduced motion it just fades.
 *
 *   ripTicket({ rect, splitFromRight, content })   // resolves when done
 *
 * `rect` is where the ticket is on screen (measureInWindow), `content` a copy
 * of it to draw (the caller hides the real one), `splitFromRight` how far
 * from its right edge the tear line is. Mounted once (TicketRipHost, App.js).
 */

// Falling: picks up speed, like gravity.
const FALL = Easing.bezier(0.55, 0, 0.9, 0.5);
// 1. The tear runs down the perforation while the ticket stays put.
const TEAR_MS = 1000;
// 2. A beat once it's torn through.
const PAUSE_MS = 160;
// 3. The halves part, then fall.
const PART_MS = 280;
const FALL_MS = 1100;
// Ripping ticks follow the tear down.
const RIP_TICK_EVERY = 110;
/** When the ticket has torn and starts to fall (ms): callers close the gap then. */
export const RIP_FALL_AT = TEAR_MS + PAUSE_MS;
const TOOTH = 7;

let show = null;

export function ripTicket(job) {
  if (!show || !job?.rect) return Promise.resolve();
  return new Promise((resolve) => show({ ...job, resolve }));
}

export function TicketRipHost() {
  const [jobs, setJobs] = useState([]);
  useEffect(() => {
    show = (job) => setJobs((cur) => [...cur, { ...job, key: `${Date.now()}-${Math.random()}` }]);
    return () => { show = null; };
  }, []);
  return jobs.map((job) => (
    <Rip
      key={job.key}
      job={job}
      onDone={() => {
        job.resolve?.();
        setJobs((cur) => cur.filter((j) => j.key !== job.key));
      }}
    />
  ));
}

/**
 * A column of little paper teeth along a torn edge, revealed from the top
 * down as the tear runs (`tear` 0..1).
 */
function Teeth({ height, side, tear }) {
  const count = Math.max(1, Math.floor((height - 20) / (TOOTH + 2)));
  // Only this absolutely placed, out-of-flow box changes height.
  const reveal = useAnimatedStyle(() => ({ height: 10 + (height - 20) * tear.get() }));
  return (
    <Animated.View
      style={[styles.teethClip, side === 'right' ? { right: -TOOTH } : { left: -TOOTH }, reveal]}
      pointerEvents="none"
    >
      <View style={[styles.teeth, { height: height - 20 }]}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={[styles.tooth, { marginLeft: i % 2 ? TOOTH / 2 + 1.5 : TOOTH / 2 - 1.5 }]} />
        ))}
      </View>
    </Animated.View>
  );
}

function Rip({ job, onDone }) {
  const { height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { rect, content, splitFromRight = 113 } = job;
  const leftW = Math.max(0, rect.width - splitFromRight);
  const rightW = rect.width - leftW;
  const tear = useSharedValue(0); // the tear running down, ticket in place
  const part = useSharedValue(0); // the halves coming apart
  const fall = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    const timers = [];
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    if (reduced) {
      fade.set(withTiming(0, { duration: 220 }));
      at(240, onDone);
      return () => timers.forEach(clearTimeout);
    }
    // 1. Tearing: steady, top to bottom; a light tick every so often.
    tear.set(withTiming(1, { duration: TEAR_MS, easing: Easing.linear }));
    for (let ms = 0; ms < TEAR_MS; ms += RIP_TICK_EVERY) {
      at(ms, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}));
    }
    // 2. Torn through: a firmer tick. 3. The halves part, then fall.
    at(RIP_FALL_AT, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}));
    part.set(withDelay(RIP_FALL_AT, withTiming(1, { duration: PART_MS, easing: Easing.bezier(0.23, 1, 0.32, 1) })));
    fall.set(withDelay(RIP_FALL_AT + PART_MS * 0.5, withTiming(1, { duration: FALL_MS, easing: FALL })));
    fade.set(withDelay(RIP_FALL_AT + PART_MS * 0.5 + FALL_MS * 0.6, withTiming(0, { duration: FALL_MS * 0.4 })));
    at(RIP_FALL_AT + PART_MS * 0.5 + FALL_MS + 40, onDone);
    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // How far to fall: off the bottom of the screen.
  const drop = Math.max(260, H - rect.y + 40);

  // While tearing, the top only just opens (pivoting on the bottom corners);
  // once torn, they swing apart and drop.
  const leftStyle = useAnimatedStyle(() => {
    const t = tear.get();
    const p = part.get();
    const f = fall.get();
    return {
      opacity: fade.get(),
      transform: [
        { translateX: -1 * t - 9 * p - 40 * f },
        { translateY: drop * f },
        { rotateZ: `${-1.2 * t - 6 * p - 22 * f}deg` },
      ],
    };
  });
  const rightStyle = useAnimatedStyle(() => {
    const t = tear.get();
    const p = part.get();
    const f = fall.get();
    return {
      opacity: fade.get(),
      transform: [
        { translateX: 1 * t + 9 * p + 60 * f },
        { translateY: drop * 1.08 * f },
        { rotateZ: `${1.6 * t + 8 * p + 34 * f}deg` },
      ],
    };
  });

  return (
    <View style={styles.root} pointerEvents="none">
      {/* Left half: pivots on its bottom-right corner as the tear opens. */}
      <Animated.View
        style={[styles.half, { left: rect.x, top: rect.y, width: leftW, height: rect.height, transformOrigin: 'right bottom' }, leftStyle]}
      >
        <View style={[styles.clip, { width: leftW, height: rect.height }]}>
          <View style={{ width: rect.width, height: rect.height }}>{content}</View>
        </View>
        <Teeth height={rect.height} side="right" tear={tear} />
      </Animated.View>

      {/* Right half (the photo stub): pivots on its bottom-left corner. */}
      <Animated.View
        style={[styles.half, { left: rect.x + leftW, top: rect.y, width: rightW, height: rect.height, transformOrigin: 'left bottom' }, rightStyle]}
      >
        <View style={[styles.clip, { width: rightW, height: rect.height }]}>
          <View style={{ width: rect.width, height: rect.height, marginLeft: -leftW }}>{content}</View>
        </View>
        <Teeth height={rect.height} side="left" tear={tear} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1100,
    elevation: 1100,
  },
  half: {
    position: 'absolute',
  },
  clip: {
    overflow: 'hidden',
  },
  // Clips the teeth to however far the tear has run.
  teethClip: {
    position: 'absolute',
    top: 10,
    width: TOOTH * 2,
    overflow: 'hidden',
  },
  teeth: {
    width: TOOTH * 2,
    justifyContent: 'space-between',
  },
  // A small white diamond: a jag of torn paper sticking out past the edge.
  tooth: {
    width: TOOTH,
    height: TOOTH,
    backgroundColor: COLORS.white,
    transform: [{ rotate: '45deg' }],
  },
});
