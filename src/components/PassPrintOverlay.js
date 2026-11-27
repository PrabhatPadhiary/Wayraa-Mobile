import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  interpolate,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { COLORS, SIZES } from '../constants';
import TripTicket, { TICKET_HEIGHT as PASS_HEIGHT } from './TripTicket';

/*
 * "Your boarding pass is printing": over a light blur of the screen, a slot
 * opens in the screen and a new trip's boarding pass feeds out of it in
 * short jerks (a light tick each), the slot glowing orange. It always plays
 * in full: if the trip is still being saved (`ready`), the pass waits near
 * the end of the print. Then it tears off (a firmer tick), the slot closes,
 * and the pass flies onto the trip page's ticket (or settles in the middle).
 * If saving fails, it closes straight away. Used instead of a loader when a
 * trip is created, and when one is copied.
 *
 *   const done = showPassPrint({ trip, ticket, ready })   // ticket: TripTicket's props
 *   // done resolves { ok: true } when it's gone, { ok: false } if `ready` failed
 *
 * Mounted once (PassPrintHost, in App.js), above the screens.
 */

// The light frost laid over the blur (the pass's notches use the same colour).
const BACKDROP = '#EEF2F4';
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
// The slot in the screen the pass comes out of.
const SLOT_H = 12;
const SLOT_OPEN_MS = 280;

// Printing: the pass comes out in these steps (fractions), each a short feed.
const FEED_STEPS = [0.3, 0.55, 0.8, 1];
const FEED_MS = 230;
const FEED_PAUSE = 90;

let show = null;

// ── Landing on the trip page ─────────────────────────────────────────────
// The trip page that opens under the print (route param `printLanding`)
// registers a way to measure its ticket; the pass measures it right before
// flying (once the page has finished sliding in) and lands exactly on it.
// The page keeps its ticket hidden until then.
const landing = { measure: null, waiters: [], landedListeners: new Set() };

/**
 * The trip page: `measure(cb)` reports where its ticket is now, as
 * cb({ x, y, width, height }) in window coordinates (or cb(null)).
 */
export function registerPassTarget(measure) {
  landing.measure = measure;
  landing.waiters.splice(0).forEach((resolve) => resolve(measure));
}

/** The trip page: called once the pass has landed (show the real card). */
export function onPassLanded(fn) {
  landing.landedListeners.add(fn);
  return () => landing.landedListeners.delete(fn);
}

/** Where the trip page's ticket is right now, or null (none within `ms`). */
function waitForPassTarget(ms) {
  const measured = (measure) => new Promise((resolve) => {
    if (!measure) { resolve(null); return; }
    try {
      measure((rect) => resolve(rect && rect.width ? rect : null));
    } catch {
      resolve(null);
    }
  });
  if (landing.measure) return measured(landing.measure);
  return new Promise((resolve) => {
    landing.waiters.push(resolve);
    setTimeout(() => {
      const i = landing.waiters.indexOf(resolve);
      if (i >= 0) landing.waiters.splice(i, 1);
      resolve(null);
    }, ms);
  }).then(measured);
}

function announceLanded() {
  landing.landedListeners.forEach((fn) => fn());
}

/**
 * Play the print for a trip. `ready` (optional): a promise for the trip being
 * saved; the print waits for it before finishing. Resolves { ok } when gone.
 */
export function showPassPrint({ trip, ticket, ready }) {
  if (!show) return Promise.resolve({ ok: true });
  return new Promise((resolve) => show({ trip, ticket, ready, resolve }));
}

export function PassPrintHost() {
  const [job, setJob] = useState(null);
  useEffect(() => {
    show = (next) => setJob((cur) => {
      cur?.resolve?.({ ok: true }); // a new one replaces any still playing
      return next;
    });
    return () => { show = null; };
  }, []);
  if (!job) return null;
  return (
    <PassPrint
      key={job.trip?.id || 'job'}
      trip={job.trip}
      ticket={job.ticket}
      ready={job.ready}
      onDone={(ok) => {
        job.resolve?.({ ok });
        setJob(null);
      }}
    />
  );
}

function PassPrint({ trip, ticket, ready, onDone }) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const reduced = useReducedMotion();
  // As wide as the trip page's ticket (the page's side margins), so it lands
  // on it at exactly its size.
  const passW = W - SIZES.spacing_base * 2;
  const slotW = passW + 12;
  const slotTop = insets.top + 96;
  // The pass comes out of the middle of the slot.
  const slotY = slotTop + SLOT_H / 2;
  // Where the pass ends up without a trip page to land on: the middle.
  const centreShift = H / 2 - PASS_HEIGHT / 2 - slotY;

  const backdrop = useSharedValue(0);
  const slot = useSharedValue(0); // 0 closed, 1 open
  const feed = useSharedValue(0); // 0 = inside the slot, 1 = all out
  const tear = useSharedValue(0); // the jolt as it tears off
  const land = useSharedValue(0); // 0 at the slot, 1 settled in the middle
  const glow = useSharedValue(0);
  const caption = useSharedValue(0);
  const fadeOut = useSharedValue(1);
  // Flying onto the trip page's ticket: offset, scale, and the pass fading out.
  const flyX = useSharedValue(0);
  const flyY = useSharedValue(0);
  const flyScale = useSharedValue(1);
  const passFade = useSharedValue(1);
  useState(() => { landing.measure = null; }); // a new print: forget any old target
  const [printed, setPrinted] = useState(false);
  const timers = useRef([]);
  const finished = useRef(false);

  const finish = (ok = true) => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    fadeOut.set(withTiming(0, { duration: 240, easing: EASE_OUT }));
    if (ok) announceLanded(); // the page's ticket shows, whatever happened
    timers.current = [setTimeout(() => onDone(ok), 250)];
  };
  // Taps skip to the end, but only once the trip is saved.
  const saved = useRef(!ready);

  useEffect(() => {
    let alive = true;
    const at = (ms, fn) => timers.current.push(setTimeout(fn, ms));
    const tick = (style) => Haptics.impactAsync(style).catch(() => {});
    // Saving: resolves true when done, false if it failed.
    const savedP = (ready ? Promise.resolve(ready).then(() => true, () => false) : Promise.resolve(true))
      .then((ok) => { saved.current = ok; return ok; });

    backdrop.set(withTiming(1, { duration: 220, easing: EASE_OUT }));

    if (reduced) {
      // Fewer, gentler: no slot, no movement. The pass fades in, centred.
      savedP.then((ok) => {
        if (!alive) return;
        if (!ok) { finish(false); return; }
        feed.set(1);
        land.set(1);
        setPrinted(true);
        caption.set(withTiming(1, { duration: 250 }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        at(1800, () => finish(true));
      });
      return () => { alive = false; timers.current.forEach(clearTimeout); };
    }

    // The slot opens out from its middle and starts to glow.
    slot.set(withTiming(1, { duration: SLOT_OPEN_MS, easing: EASE_OUT }));
    glow.set(withDelay(SLOT_OPEN_MS - 80, withRepeat(withTiming(1, { duration: 320 }), -1, true)));

    // Printing, all but the last step: a short feed each, with a pause
    // between (a light tick each).
    const t0 = SLOT_OPEN_MS + 120;
    const head = FEED_STEPS.slice(0, -1);
    feed.set(withDelay(t0, withSequence(...head.map((to, i) => (i
      ? withDelay(FEED_PAUSE, withTiming(to, { duration: FEED_MS, easing: EASE_IN_OUT }))
      : withTiming(to, { duration: FEED_MS, easing: EASE_IN_OUT }))))));
    head.forEach((_, i) => at(t0 + i * (FEED_MS + FEED_PAUSE), () => tick(Haptics.ImpactFeedbackStyle.Light)));
    const headDone = new Promise((res) => at(t0 + head.length * (FEED_MS + FEED_PAUSE), res));

    // The rest plays once the head is printed and the trip is saved.
    Promise.all([headDone, savedP]).then(([, ok]) => {
      if (!alive) return;
      if (!ok) { finish(false); return; }
      let t = FEED_PAUSE;
      feed.set(withDelay(t, withTiming(1, { duration: FEED_MS, easing: EASE_IN_OUT })));
      at(t, () => tick(Haptics.ImpactFeedbackStyle.Light));
      t += FEED_MS + FEED_PAUSE;

      // Tear: a quick jolt down and a tilt, then back.
      at(t, () => {
        tick(Haptics.ImpactFeedbackStyle.Medium);
        setPrinted(true); // free of the slot now (stop clipping)
      });
      tear.set(withDelay(t, withSequence(
        withTiming(1, { duration: 90, easing: EASE_OUT }),
        withSpring(0, { duration: 380, dampingRatio: 0.55 }),
      )));
      glow.set(withDelay(t, withTiming(0, { duration: 150 })));
      t += 380;

      // The slot closes. If the trip page is showing its ticket, the pass
      // flies onto it and becomes it; otherwise it comes forward to the
      // middle with a caption.
      slot.set(withDelay(t, withTiming(0, { duration: 240, easing: EASE_OUT })));
      const passX = W / 2;
      const passY = slotY + PASS_HEIGHT / 2;
      at(t, () => waitForPassTarget(2500).then((rect) => {
        if (!alive || finished.current) return;
        if (rect) {
          // Same width as the ticket, top edges together.
          const scale = rect.width / passW;
          flyX.set(withSpring(rect.x + rect.width / 2 - passX, { duration: 620, dampingRatio: 0.86 }));
          flyY.set(withSpring(rect.y + (PASS_HEIGHT * scale) / 2 - passY, { duration: 620, dampingRatio: 0.86 }));
          flyScale.set(withSpring(scale, { duration: 620, dampingRatio: 0.86 }));
          backdrop.set(withDelay(150, withTiming(0, { duration: 420, easing: EASE_OUT })));
          // The hand-over: the ticket fades in under the pass as it fades out.
          at(380, () => {
            announceLanded();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          });
          passFade.set(withDelay(380, withTiming(0, { duration: 260, easing: EASE_OUT })));
          at(700, () => {
            finished.current = true;
            onDone(true);
          });
        } else {
          land.set(withSpring(1, { duration: 650, dampingRatio: 0.8 }));
          caption.set(withDelay(350, withTiming(1, { duration: 280, easing: EASE_OUT })));
          at(450, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}));
          at(650 + 1300, () => finish(true));
        }
      }));
    });
    return () => { alive = false; timers.current.forEach(clearTimeout); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rootStyle = useAnimatedStyle(() => ({ opacity: fadeOut.get() }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));
  const slotStyle = useAnimatedStyle(() => ({
    opacity: interpolate(slot.get(), [0, 0.3, 1], [0, 1, 1]),
    transform: [{ scaleX: interpolate(slot.get(), [0, 1], [0.12, 1]) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.3 + glow.get() * 0.7 }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: glow.get() * 0.5 * slot.get() }));
  const passStyle = useAnimatedStyle(() => {
    const l = land.get();
    const j = tear.get();
    return {
      opacity: passFade.get(),
      transform: [
        { perspective: 1000 },
        // Onto the trip page's ticket, when there is one.
        { translateX: flyX.get() },
        // Out of the slot, then down to the middle (or onto the ticket).
        { translateY: interpolate(feed.get(), [0, 1], [-PASS_HEIGHT - 8, 0]) + j * 10 + l * centreShift + flyY.get() },
        { scale: flyScale.get() },
        { rotateZ: `${j * -3}deg` },
        // Tips its top towards you on the way down, then lies flat.
        { rotateX: `${interpolate(l, [0, 0.5, 1], [0, 18, 0])}deg` },
        { scale: interpolate(l, [0, 0.6, 1], [1, 1.06, 1.02]) },
      ],
    };
  });
  const captionStyle = useAnimatedStyle(() => ({
    opacity: caption.get(),
    transform: [{ translateY: interpolate(caption.get(), [0, 1], [8, 0]) }],
  }));

  const captionTop = H / 2 + PASS_HEIGHT / 2 + SIZES.spacing_xl;
  const slotLeft = (W - slotW) / 2;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => { if (saved.current) finish(true); }}
        accessibilityRole="button"
        accessibilityLabel={`Boarding pass for ${trip?.name || 'your trip'} is ready. Tap to continue`}
      >
        {/* A light blur of the screen behind, washed with frost. */}
        <Animated.View style={[styles.fill, backdropStyle]}>
          <BlurView intensity={40} tint="light" style={styles.fill} />
          <View style={[styles.fill, styles.backdrop]} />
        </Animated.View>

        {/* Warm light spilling out of the slot while it prints. */}
        <Animated.View
          style={[styles.halo, { top: slotTop - 14, left: slotLeft + 10, width: slotW - 20 }, haloStyle]}
          pointerEvents="none"
        />

        {/* The pass, coming out of the slot. Clipped at the slot while printing. */}
        <View
          style={[
            styles.passClip,
            { top: slotY, width: passW, left: (W - passW) / 2, height: PASS_HEIGHT + 24 },
            printed && styles.passFree,
          ]}
          pointerEvents="none"
        >
          <Animated.View style={passStyle}>
            <TripTicket {...ticket} trip={ticket?.trip || trip} notchColor={BACKDROP} />
          </Animated.View>
        </View>

        {/* The slot in the screen: a dark recess with a lit lower lip and an
            orange glow inside. Drawn over the pass, which comes out of it. */}
        <Animated.View
          style={[styles.slot, { top: slotTop, left: slotLeft, width: slotW }, slotStyle]}
          pointerEvents="none"
        >
          <View style={styles.slotShade} />
          <Animated.View style={[styles.slotGlow, glowStyle]} />
          <View style={styles.slotLip} />
        </Animated.View>

        <Animated.View style={[styles.caption, { top: captionTop }, captionStyle]} pointerEvents="none">
          <Text style={styles.captionTitle}>You're all set</Text>
          <Text style={styles.captionText}>Your boarding pass for {trip?.name || 'the trip'} is ready</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 1000,
    elevation: 1000,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  backdrop: {
    backgroundColor: 'rgba(238, 242, 244, 0.72)',
  },
  passClip: {
    position: 'absolute',
    overflow: 'hidden',
  },
  passFree: {
    overflow: 'visible',
  },
  // The slot: a dark recess cut into the screen.
  slot: {
    position: 'absolute',
    height: SLOT_H,
    borderRadius: SLOT_H / 2,
    backgroundColor: '#0B1117',
    overflow: 'hidden',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(28, 40, 51, 0.9)',
  },
  // Darker towards the top inside, as if it goes deep.
  slotShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SLOT_H / 2,
    backgroundColor: '#000000',
    opacity: 0.55,
  },
  slotGlow: {
    height: 2,
    marginHorizontal: 22,
    borderRadius: 1,
    backgroundColor: COLORS.accent,
  },
  // Light catching the slot's lower lip.
  slotLip: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  halo: {
    position: 'absolute',
    height: SLOT_H + 28,
    borderRadius: 30,
    backgroundColor: 'rgba(217, 72, 28, 0.16)',
  },
  caption: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    right: SIZES.spacing_lg,
    alignItems: 'center',
  },
  captionTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  captionText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },
});
