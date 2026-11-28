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
import { auth } from '../config';
import { getSeen, markSeenOnAccount } from '../services/seenService';

/**
 * One-time tips: the first time you reach a screen, a spotlight on one
 * button and a short line on what it does. Each tip shows once per person:
 * signed in, what you've seen is kept with your account (so reinstalling or
 * a new phone doesn't repeat them); signed out, on this phone. One at a
 * time, and any tap closes it.
 *
 *   const searchRef = useRef(null);
 *   useTip('explore_search', searchRef, { title, text });
 *   <TouchableOpacity ref={searchRef} … />
 *
 * Settings → "Show tips again" brings them all back (resetTips).
 */

// Older versions kept one list for the phone; it's folded into the first
// account that signs in.
const LEGACY_KEY = 'wayraa_tips_seen';
const seenKey = (uid) => `wayraa_tips_seen.${uid || 'guest'}`;
// "Show tips again" on this phone: don't take the account's list until next time.
const resetKey = (uid) => `wayraa_tips_reset.${uid || 'guest'}`;
const HOLE_PAD = 6;
const GAP = 14; // between the spotlight and the bubble
const EDGE = 16;
const BUBBLE_MAX = 320;

// ── Which tips you've seen (your account, and this phone) ───────────────────
let seen = null;
let seenFor;     // whose list `seen` is (uid, or null signed out)
let loading = null;

const currentUid = () => auth?.currentUser?.uid || null;

function loadSeen() {
  const uid = currentUid();
  if (seen && seenFor === uid) return Promise.resolve(seen);
  if (!loading || seenFor !== uid) {
    seenFor = uid;
    loading = (async () => {
      const list = new Set();
      try {
        const raw = await AsyncStorage.getItem(seenKey(uid));
        (raw ? JSON.parse(raw) : []).forEach((id) => list.add(id));
        const legacy = await AsyncStorage.getItem(LEGACY_KEY);
        if (legacy) {
          JSON.parse(legacy).forEach((id) => list.add(id));
          await AsyncStorage.removeItem(LEGACY_KEY);
        }
      } catch {
        // Nothing saved here (or unreadable): the account may still know.
      }
      if (uid) {
        const reset = await AsyncStorage.getItem(resetKey(uid)).catch(() => null);
        const account = reset ? null : await getSeen();
        if (account?.tips) {
          const onlyHere = [...list].filter((id) => !account.tips.includes(id));
          account.tips.forEach((id) => list.add(id));
          // Seen here before this was kept with accounts: tell the account.
          if (onlyHere.length) markSeenOnAccount({ tips: onlyHere });
        }
      }
      AsyncStorage.setItem(seenKey(uid), JSON.stringify([...list])).catch(() => {});
      if (seenFor === uid) seen = list;
      return list;
    })();
  }
  return loading;
}

function markSeen(id) {
  if (!seen) return;
  seen.add(id);
  const uid = seenFor;
  AsyncStorage.setItem(seenKey(uid), JSON.stringify([...seen])).catch(() => {});
  if (uid) markSeenOnAccount({ tips: [id] });
}

/**
 * For one-time hints that aren't a tip bubble (e.g. a card nudging to show
 * it can be swiped): true the first time for this person, and from then on
 * false. Kept with the tips, so "Show tips again" brings it back too.
 */
export async function claimOnce(id) {
  const list = await loadSeen();
  if (list.has(id)) return false;
  markSeen(id);
  return true;
}

/** Settings → Show tips again (on this phone). */
export async function resetTips() {
  const uid = currentUid();
  seen = new Set();
  seenFor = uid;
  loading = null;
  await AsyncStorage.removeItem(seenKey(uid)).catch(() => {});
  if (uid) await AsyncStorage.setItem(resetKey(uid), '1').catch(() => {});
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
 * @param {object} [opts.shape] - the spotlight's outline, for a target that
 *   isn't a button (default: a pill). { radius, notches: [{ side: 'top' |
 *   'bottom' | 'left' | 'right', at, fromEnd?, r }] }: corner radius, and
 *   half-circle bites into its edges (`at` px along that edge from its start,
 *   or from its end with fromEnd), e.g. a ticket's notches.
 */
export function useTip(id, targetRef, { title, text, enabled = true, after, delay = 900, shape }) {
  const focused = useIsFocused();
  const copy = useRef({ title, text, shape });
  copy.current = { title, text, shape };

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

/**
 * The spotlight's outline, clockwise from the top-left corner, shifted by
 * (dx, dy): a rounded rectangle, with half-circle bites wherever the shape
 * has notches. `hole` is the target grown by its padding; `rect` the target.
 * A shaped target has no padding (see TipsHost), so each bite sits exactly
 * on the target's own notch.
 */
function holePath(hole, rect, shape, dx = 0, dy = 0) {
  const x = hole.x + dx;
  const y = hole.y + dy;
  const { w, h } = hole;
  const r = Math.min(hole.r, w / 2, h / 2);
  // Notch centres along the hole's edges, the size of the target's notches.
  const bites = { top: [], bottom: [], left: [], right: [] };
  (shape?.notches || []).forEach((n) => {
    const nr = n.r;
    if (n.side === 'top' || n.side === 'bottom') {
      const c = rect.x + dx + (n.fromEnd ? rect.width - n.at : n.at);
      bites[n.side].push({ c, nr });
    } else {
      const c = rect.y + dy + (n.fromEnd ? rect.height - n.at : n.at);
      bites[n.side].push({ c, nr });
    }
  });
  const asc = (a, b) => a.c - b.c;
  const desc = (a, b) => b.c - a.c;
  const d = [`M${x + r} ${y}`];
  bites.top.sort(asc).forEach(({ c, nr }) => d.push(`H${c - nr}A${nr} ${nr} 0 0 0 ${c + nr} ${y}`));
  d.push(`H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}`);
  bites.right.sort(asc).forEach(({ c, nr }) => d.push(`V${c - nr}A${nr} ${nr} 0 0 0 ${x + w} ${c + nr}`));
  d.push(`V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`);
  bites.bottom.sort(desc).forEach(({ c, nr }) => d.push(`H${c + nr}A${nr} ${nr} 0 0 0 ${c - nr} ${y + h}`));
  d.push(`H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}`);
  bites.left.sort(desc).forEach(({ c, nr }) => d.push(`V${c + nr}A${nr} ${nr} 0 0 0 ${x} ${c - nr}`));
  d.push(`V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`);
  return d.join('');
}

/** The whole screen, with the spotlight cut out (even-odd fill). */
function dimPath(W, H, hole, rect, shape) {
  return `M0 0H${W}V${H}H0Z${holePath(hole, rect, shape)}`;
}

// Room around the shaped ring's outline, so its stroke isn't clipped.
const RING_PAD = 2;

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

  const { rect, W, H, shape } = tip;
  // A pill with room round a button. A shaped target (a ticket) is traced
  // exactly: its notches can't be grown outward evenly (they'd turn into
  // dots), and a near miss shows as a crescent round each notch.
  const pad = shape ? 0 : HOLE_PAD;
  const hole = {
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.width + pad * 2,
    h: rect.height + pad * 2,
  };
  hole.r = shape ? shape.radius : Math.min(hole.w, hole.h) / 2;

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
          <Path d={dimPath(W, H, hole, rect, shape)} fill="rgba(18, 28, 37, 0.62)" fillRule="evenodd" />
        </Svg>
      </Pressable>

      {/* A soft ring that breathes out from the button (or, for a shaped
          target, its outline: a big card only breathes out a little). */}
      {shape ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: hole.x - RING_PAD,
            top: hole.y - RING_PAD,
            width: hole.w + RING_PAD * 2,
            height: hole.h + RING_PAD * 2,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
          }}
        >
          <Svg width={hole.w + RING_PAD * 2} height={hole.h + RING_PAD * 2}>
            <Path
              d={holePath(hole, rect, shape, RING_PAD - hole.x, RING_PAD - hole.y)}
              stroke={COLORS.accent}
              strokeWidth={2}
              fill="none"
            />
          </Svg>
        </Animated.View>
      ) : (
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
      )}

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
