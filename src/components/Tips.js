import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Animated,
  Easing,
  BackHandler,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SIZES } from '../constants/theme';

/**
 * One-time tips: the first time you reach a screen, a spotlight on one
 * button and a short line on what it does. Each tip shows once per phone
 * (signed in or not), one at a time, and any tap closes it.
 *
 *   const searchRef = useRef(null);
 *   useTip('explore_search', searchRef, { title, text });
 *   <TouchableOpacity ref={searchRef} … />
 *
 * Settings → "Show tips again" brings them all back (resetTips).
 */

const SEEN_KEY = 'wayraa_tips_seen';
const HOLE_PAD = 6;
const GAP = 14; // between the spotlight and the bubble
const EDGE = 16;
const BUBBLE_MAX = 320;

// ── Which tips you've seen (on this phone) ──────────────────────────────────
let seen = null;
let loading = null;

function loadSeen() {
  if (seen) return Promise.resolve(seen);
  if (!loading) {
    loading = AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => { seen = new Set(raw ? JSON.parse(raw) : []); })
      .catch(() => { seen = new Set(); })
      .then(() => seen);
  }
  return loading;
}

function markSeen(id) {
  if (!seen) return;
  seen.add(id);
  AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen])).catch(() => {});
}

/** Settings → Show tips again. */
export function resetTips() {
  seen = new Set();
  loading = null;
  return AsyncStorage.removeItem(SEEN_KEY).catch(() => {});
}

// ── The one tip on screen (TipsHost draws it) ───────────────────────────────
let active = null;
let setHostTip = null;

function present(tip) {
  if (active || !setHostTip) return false;
  active = tip;
  markSeen(tip.id); // seen as soon as it shows, so it never comes back
  setHostTip(tip);
  return true;
}

function closeActive() {
  active = null;
  setHostTip?.(null);
}

/**
 * Show a tip pointing at `targetRef` the first time this screen is in view.
 *
 * @param {string} id - stable key, stored once seen
 * @param {React.RefObject} targetRef - the button to point at
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.text
 * @param {boolean} [opts.enabled=true] - e.g. only when signed in
 * @param {string} [opts.after] - only once this other tip was seen (on an
 *   earlier visit), so two tips never compete on one screen
 * @param {number} [opts.delay=900] - let the screen settle and animate in
 */
export function useTip(id, targetRef, { title, text, enabled = true, after, delay = 900 }) {
  const focused = useIsFocused();
  const copy = useRef({ title, text });
  copy.current = { title, text };

  useEffect(() => {
    if (!enabled || !focused) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const s = await loadSeen();
      if (cancelled || active || s.has(id) || (after && !s.has(after))) return;
      const node = targetRef.current;
      if (!node?.measureInWindow) return;
      node.measureInWindow((x, y, width, height) => {
        if (cancelled || !width || !height) return;
        present({ id, rect: { x, y, width, height }, ...copy.current });
      });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Left the screen (e.g. a notification opened something): drop its tip.
      if (active?.id === id) closeActive();
    };
  }, [id, enabled, focused, after, delay, targetRef]);
}

// ── Drawing ─────────────────────────────────────────────────────────────────

/** The whole screen, with a rounded hole cut out (even-odd fill). */
function dimPath(W, H, { x, y, w, h, r }) {
  return [
    `M0 0H${W}V${H}H0Z`,
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
  ].join('');
}

/** Mount once, next to the NavigationContainer, above the screens. */
export function TipsHost() {
  const [tip, setTip] = useState(null);
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const layerRef = useRef(null);

  // The button was measured against the window. Android doesn't always count
  // the status bar the same way for every view, so measure this layer the
  // same way and use the difference: the spotlight then sits exactly on the
  // button, whatever the phone does with its bars.
  useEffect(() => {
    const show = (next) => {
      if (!next) { setTip(null); return; }
      const layer = layerRef.current;
      if (!layer?.measureInWindow) { setTip({ ...next, W: win.width, H: win.height }); return; }
      layer.measureInWindow((ox, oy, w, h) => {
        if (active?.id !== next.id) return; // closed meanwhile
        const { rect } = next;
        setTip({
          ...next,
          rect: { ...rect, x: rect.x - (ox || 0), y: rect.y - (oy || 0) },
          W: w || win.width,
          H: h || win.height,
        });
      });
    };
    setHostTip = show;
    return () => { if (setHostTip === show) setHostTip = null; };
  }, [win.width, win.height]);

  useEffect(() => {
    if (!tip) return undefined;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    AccessibilityInfo.announceForAccessibility(`Tip. ${tip.title}. ${tip.text}`);

    let loop = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      pulse.setValue(0);
      loop = Animated.loop(
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true })
      );
      loop.start();
    }).catch(() => {});

    const back = BackHandler.addEventListener('hardwareBackPress', () => { dismiss(); return true; });
    return () => {
      loop?.stop();
      back.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tip]);

  const dismiss = () => {
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => closeActive());
  };

  // Always mounted (empty and see-through when idle), so it can be measured.
  if (!tip) {
    return <View ref={layerRef} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill} />;
  }

  const { rect, W, H } = tip;
  const hole = {
    x: rect.x - HOLE_PAD,
    y: rect.y - HOLE_PAD,
    w: rect.width + HOLE_PAD * 2,
    h: rect.height + HOLE_PAD * 2,
  };
  hole.r = Math.min(hole.w, hole.h) / 2;

  const bubbleW = Math.min(W - EDGE * 2, BUBBLE_MAX);
  const centreX = rect.x + rect.width / 2;
  const left = Math.max(EDGE, Math.min(centreX - bubbleW / 2, W - EDGE - bubbleW));
  const arrowLeft = Math.max(20, Math.min(centreX - left, bubbleW - 20)) - 7;
  // Below the button if it's in the top part of the screen, else above.
  const below = hole.y + hole.h / 2 < H * 0.55;
  const place = below
    ? { top: hole.y + hole.h + GAP }
    : { bottom: Math.max(H - hole.y + GAP, insets.bottom + EDGE) };
  const lift = fade.interpolate({ inputRange: [0, 1], outputRange: [below ? -6 : 6, 0] });

  return (
    <Animated.View
      ref={layerRef}
      collapsable={false}
      style={[StyleSheet.absoluteFill, styles.layer, { opacity: fade }]}
      accessibilityViewIsModal
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Close tip">
        <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={dimPath(W, H, hole)} fill="rgba(18, 28, 37, 0.62)" fillRule="evenodd" />
        </Svg>
      </Pressable>

      {/* A soft ring that breathes out from the button. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            left: hole.x,
            top: hole.y,
            width: hole.w,
            height: hole.h,
            borderRadius: hole.r,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
          },
        ]}
      />

      <Animated.View style={[styles.bubble, place, { left, width: bubbleW, transform: [{ translateY: lift }] }]}>
        <View style={[styles.arrow, below ? styles.arrowTop : styles.arrowBottom, { left: arrowLeft }]} />
        <Text style={styles.title}>{tip.title}</Text>
        <Text style={styles.text}>{tip.text}</Text>
        <TouchableOpacity style={styles.button} onPress={dismiss} activeOpacity={0.85} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.buttonText}>Got it</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    zIndex: 1000,
    elevation: 1000,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  bubble: {
    position: 'absolute',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_lg,
    paddingHorizontal: SIZES.spacing_base + 2,
    paddingTop: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_md,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  arrow: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: COLORS.white,
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
  },
  arrowTop: { top: -6 },
  arrowBottom: { bottom: -6 },
  title: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  text: {
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: SIZES.spacing_xs,
  },
  button: {
    alignSelf: 'flex-end',
    marginTop: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_xs + 2,
    paddingHorizontal: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(217, 72, 28, 0.10)',
  },
  buttonText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
});
