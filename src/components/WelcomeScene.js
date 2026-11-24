import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path, G, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  useDerivedValue,
  withTiming,
  withDelay,
  withRepeat,
  interpolate,
  Extrapolation,
  Easing,
  useReducedMotion,
  runOnJS,
  cancelAnimation,
  scrollTo,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { PALETTE } from '../constants/theme';
import { MiniItinerary, MiniBudget, MiniStory, MINI_W, MINI_H } from './WelcomeMiniScreens';

/*
 * The welcome screen's three pages, drawn as one wide landscape in the app's
 * flat illustration style (like TravelScene): a village and a lake, a camp,
 * then the hills below a summit. A little plane flies one dotted route
 * across all three at an even, unhurried speed. The moment it reaches the
 * right edge the next page glides in, so it never stops; on page three it
 * lands on a flag. Over each page floats a small version of an app screen
 * (a day's plan, the budget, a story), which comes in as the plane passes.
 *
 * Swiping takes over: the plane then follows your finger, flying back when
 * you swipe back (it turns round), and resting mid-page when you stop.
 *
 * Everything reads one number, `shown` (0 → 3, one unit per page), so the
 * plane, the dots, the pins and the page always agree. The sky, sun and
 * clouds stay put while the land scrolls under them. With reduced motion the
 * plane just rests on the page you're on.
 *
 * The landscape is a 1080 × 520 grid (three 360-wide pages), cropped to fill
 * the box and anchored to the bottom. Its front hill is the page's frost, so
 * it melts into the text below.
 */

const PAGE_W = 360;
const GRID_W = PAGE_W * 3;
const GRID_H = 520;
const PAGES = 3;

const PAGE_TEXT = [
  { title: 'Plan it together', accent: 'together', body: 'Map out every day of the trip with your crew, in one place.' },
  { title: 'Split it fairly', accent: 'fairly', body: 'Track the budget as you go and see who owes what.' },
  { title: 'Share the story', accent: 'story', body: 'Write up the trip with photos and inspire the next traveller.' },
];
const MINIS = [MiniItinerary, MiniBudget, MiniStory];

const SPEED = 80;        // plane speed, grid units a second
const FIRST_DELAY = 900; // after the sun is up
const GLIDE = 0.09;      // how long (in pages of flight) a page change takes
const REST = 0.55;       // where the plane rests on a page when you swipe

const C = {
  skyTop: '#8FD3F4',
  skyBottom: '#E3F4FB',
  sun: '#FFC93C',
  sunHalo: '#FFE7A3',
  cloud: '#FFFFFF',
  farMountain: '#9DB7D5',
  farShade: '#86A3C4',
  snow: '#FFFFFF',
  hillBack: '#9BD27A',
  hillMid: '#6DBB5A',
  lake: '#4FB3E8',
  lakeLight: '#9FDBF7',
  field: '#C9E58C',
  hillNear: '#3E9A4B',
  wall: '#FFF4E3',
  wallShade: '#F2DFC2',
  roof: '#E5533C',
  roofDark: '#C23E2B',
  door: '#8A4B2A',
  window: '#7FC8EE',
  trunk: '#8A5A34',
  tree: '#2F8F45',
  treeLight: '#4DAF5A',
  pine: '#2C7A3C',
  pineLight: '#3E9A4B',
  tent: '#F2A541',
  tentShade: '#D9862A',
  tentBlue: '#5E9FD6',
  tentBlueShade: '#4A86BC',
  flame: '#FF9F1C',
  flameCore: '#FFD166',
  plane: '#FFFFFF',
  planeShade: '#E6EEF5',
};

// ── Route ────────────────────────────────────────────────────────────────
// Waypoints across the three pages, kept low over the land so the screens
// above have the sky. `edge: k` is where the route leaves page k (its x is
// the real screen edge); `pin` puts a pin there; `screen: k` is the pin
// that brings in page k's screen.
const WAYPOINTS = [
  { x: 52, y: 470, pin: 'start' },
  { x: 120, y: 430 },
  { x: 204, y: 452, pin: 'stop', screen: 0 },
  { x: 290, y: 420 },
  { edge: 1, y: 410 },
  { x: 440, y: 446 },
  { x: 556, y: 450, pin: 'stop', screen: 1 },
  { x: 650, y: 424 },
  { edge: 2, y: 414 },
  { x: 796, y: 446 },
  { x: 900, y: 440, pin: 'flag', screen: 2 },
];

const SAMPLES = 400; // evenly spaced points along the route, for the plane
const DOT_GAP = 10;  // grid units between dots

/** Catmull-Rom through the waypoints: dense points, then evenly respaced. */
function buildRoute(points, s) {
  const dense = [];
  const wpDense = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let k = i === 0 ? 0 : 1; k <= 30; k++) {
      const t = k / 30;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
    wpDense.push(dense.length - 1);
  }
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y));
  }
  const total = cum[cum.length - 1];
  const at = (d) => {
    let j = 1;
    while (j < cum.length - 1 && cum[j] < d) j++;
    const t = (d - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    return {
      x: dense[j - 1].x + (dense[j].x - dense[j - 1].x) * t,
      y: dense[j - 1].y + (dense[j].y - dense[j - 1].y) * t,
    };
  };
  const xs = [];
  const ys = [];
  for (let i = 0; i < SAMPLES; i++) {
    const p = at((i / (SAMPLES - 1)) * total);
    xs.push(p.x);
    ys.push(p.y);
  }
  const gap = DOT_GAP * s;
  const dots = [];
  for (let d = gap * 1.6; d < total - gap * 1.4; d += gap) {
    dots.push({ ...at(d), f: d / total });
  }
  return { xs, ys, dots, total, wpFrac: wpDense.map((i) => cum[i] / total) };
}

/** Progress runs 0 → 3, one unit per page; route fraction ↔ progress. */
function fracToProgress(f, edges) {
  'worklet';
  for (let k = 0; k < PAGES; k++) {
    if (f <= edges[k + 1]) return k + (f - edges[k]) / (edges[k + 1] - edges[k]);
  }
  return PAGES;
}
function progressToFrac(p, edges) {
  'worklet';
  const q = Math.min(Math.max(p, 0), PAGES);
  const k = Math.min(Math.floor(q), PAGES - 1);
  return edges[k] + (q - k) * (edges[k + 1] - edges[k]);
}
/** Where the plane is when you've swiped to `x` pages (it lands on page 3). */
function swipeProgress(x) {
  'worklet';
  return x + REST + (1 - REST) * Math.min(Math.max(x - (PAGES - 2), 0), 1);
}
/** Where the page should be while the plane flies itself. */
function cameraPages(p) {
  'worklet';
  let c = 0;
  for (let k = 1; k < PAGES; k++) {
    const t = Math.min(Math.max((p - k) / GLIDE, 0), 1);
    c += t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  }
  return c;
}

// ── Drawing pieces ───────────────────────────────────────────────────────
function House({ x, y, s = 1 }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x="-12" y="-14" width="24" height="16" fill={C.wall} />
      <Rect x="4" y="-14" width="8" height="16" fill={C.wallShade} />
      <Path d="M -15 -13 L 0 -26 L 15 -13 Z" fill={C.roof} />
      <Path d="M 0 -26 L 15 -13 L 7 -13 Z" fill={C.roofDark} />
      <Rect x="-8" y="-8" width="5" height="10" fill={C.door} />
      <Rect x="1" y="-10" width="6" height="5" fill={C.window} />
    </G>
  );
}

function Tree({ x, y, s = 1 }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x="-1.5" y="-6" width="3" height="8" fill={C.trunk} />
      <Circle cx="0" cy="-12" r="8" fill={C.tree} />
      <Circle cx="-2.5" cy="-14" r="4" fill={C.treeLight} />
    </G>
  );
}

function Pine({ x, y, s = 1 }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x="-1.5" y="-4" width="3" height="6" fill={C.trunk} />
      <Path d="M -10 -4 L 0 -30 L 10 -4 Z" fill={C.pine} />
      <Path d="M 0 -30 L 10 -4 L 3 -4 Z" fill={C.pineLight} />
    </G>
  );
}

function Tent({ x, y, s = 1, color = C.tent, shade = C.tentShade }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M -16 0 L 0 -22 L 16 0 Z" fill={color} />
      <Path d="M 0 -22 L 16 0 L 6 0 Z" fill={shade} />
      <Path d="M -4 0 L 0 -9 L 4 0 Z" fill={C.door} />
    </G>
  );
}

function Campfire({ x, y }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Path d="M -8 0 L 8 -3 M -8 -3 L 8 0" stroke={C.door} strokeWidth="3" strokeLinecap="round" />
      <Path d="M -5 -3 C -6 -9 -1 -11 0 -16 C 2 -11 6 -9 5 -3 Z" fill={C.flame} />
      <Path d="M -2 -3 C -2 -7 0 -8 0 -11 C 1 -8 3 -7 2 -3 Z" fill={C.flameCore} />
    </G>
  );
}

const PEAKS = [
  [52, 266, 112, 316], [176, 250, 222, 290], [262, 232, 330, 300],
  [520, 254, 590, 310], [650, 276, 700, 300], [780, 250, 830, 278],
  [870, 206, 960, 300], [1020, 262, 1120, 320],
];

function Snow({ x, y }) {
  return <Path d={`M ${x} ${y} L ${x + 13} ${y + 13} L ${x + 5} ${y + 11} L ${x - 2} ${y + 16} L ${x - 10} ${y + 10} Z`} fill={C.snow} />;
}

/** Sky only: the sun and clouds sit between it and the land. */
function Sky({ width, height }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${PAGE_W} ${GRID_H}`} preserveAspectRatio="xMidYMax slice" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="welcomeSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.skyTop} />
          <Stop offset="1" stopColor={C.skyBottom} />
        </LinearGradient>
      </Defs>
      <Rect x="-400" y="-400" width="1160" height="780" fill="url(#welcomeSky)" />
    </Svg>
  );
}

/** All three pages of land, one wide drawing. */
function Land({ width, height }) {
  const ridge = 'M -40 330 L 52 266 L 112 316 L 176 250 L 222 290 L 262 232 L 330 300 L 400 270 L 460 300 L 520 254 L 590 310 L 650 276 L 700 300 L 780 250 L 830 278 L 870 206 L 960 300 L 1020 262 L 1120 320 L 1120 520 L -40 520 Z';
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${GRID_W} ${GRID_H}`} preserveAspectRatio="xMidYMax slice" style={StyleSheet.absoluteFill}>
      {/* Far mountains */}
      <Path d={ridge} fill={C.farMountain} />
      {PEAKS.map(([px, py, vx, vy]) => (
        <Path key={`s${px}`} d={`M ${px} ${py} L ${vx} ${vy} L ${px + (vx - px) * 0.35} ${vy + 2} Z`} fill={C.farShade} />
      ))}
      {PEAKS.map(([px, py]) => <Snow key={`n${px}`} x={px} y={py} />)}

      {/* Back hills */}
      <Path d="M -40 350 C 30 328 100 332 160 346 C 220 360 290 326 400 336 C 480 344 540 322 620 334 C 700 346 760 330 840 338 C 920 346 1000 326 1120 336 L 1120 520 L -40 520 Z" fill={C.hillBack} />

      {/* Mid hill */}
      <Path d="M -40 404 C 30 384 110 386 180 398 C 240 408 300 386 400 394 C 470 400 540 384 620 392 C 700 400 780 386 860 394 C 940 402 1020 388 1120 396 L 1120 520 L -40 520 Z" fill={C.hillMid} />

      {/* Page 1: village and lake */}
      <Path d="M 232 414 C 258 406 312 406 336 412 C 350 416 346 424 330 427 C 300 432 254 431 236 425 C 224 421 222 417 232 414 Z" fill={C.lake} />
      <Path d="M 252 415 L 282 415 M 300 421 L 326 421" stroke={C.lakeLight} strokeWidth="2.5" strokeLinecap="round" />
      <Tree x={22} y={394} s={0.85} />
      <House x={44} y={394} s={0.8} />
      <House x={68} y={392} s={1} />
      <House x={94} y={393} s={0.85} />
      <Tree x={116} y={392} s={0.8} />

      {/* Page 2: pines on the hill */}
      <Pine x={652} y={396} s={0.9} />
      <Pine x={672} y={398} s={1.1} />
      <Pine x={694} y={398} s={0.85} />
      <Pine x={420} y={396} s={0.8} />

      {/* Page 3: a cabin and pines */}
      <House x={960} y={398} s={0.9} />
      <Pine x={936} y={400} s={0.9} />
      <Pine x={1000} y={400} s={1} />
      <Pine x={1020} y={402} s={0.8} />

      {/* Near hill */}
      <Path d="M -40 452 C 50 432 140 440 210 450 C 270 458 320 438 400 444 C 480 450 560 436 640 446 C 720 456 800 438 880 446 C 960 454 1040 440 1120 446 L 1120 520 L -40 520 Z" fill={C.hillNear} />
      <Path d="M 232 458 C 262 452 300 446 330 448 L 322 462 C 296 462 262 466 238 470 Z" fill={C.field} />
      <Tree x={150} y={452} s={0.9} />
      <Tree x={346} y={450} s={0.9} />

      {/* Page 2: the camp */}
      <Tent x={470} y={452} s={1} />
      <Tent x={504} y={456} s={0.8} color={C.tentBlue} shade={C.tentBlueShade} />
      <Campfire x={534} y={462} />
      <Tree x={612} y={452} s={0.9} />

      {/* Page 3 */}
      <Path d="M 760 468 C 790 458 830 454 860 456 L 852 470 C 826 470 794 474 768 478 Z" fill={C.field} />
      <Tree x={1050} y={452} s={0.9} />

      {/* Front hill in the page's own frost */}
      <Path d="M -40 486 C 50 474 140 480 210 490 C 280 500 330 480 400 484 C 480 488 560 476 640 486 C 720 496 800 478 880 486 C 960 494 1040 480 1120 486 L 1120 520 L -40 520 Z" fill={PALETTE.frost} />
    </Svg>
  );
}

function CloudShape({ width }) {
  return (
    <Svg width={width} height={width * (30 / 80)} viewBox="0 0 80 30">
      <G fill={C.cloud}>
        <Ellipse cx="40" cy="21" rx="36" ry="9" />
        <Ellipse cx="52" cy="13" rx="18" ry="11" />
        <Ellipse cx="27" cy="15" rx="13" ry="9" />
      </G>
    </Svg>
  );
}

/** The plane, nose to the right, centred in a 30 × 16 box. */
function PlaneShape({ width }) {
  return (
    <Svg width={width} height={width * (16 / 30)} viewBox="0 0 30 16">
      <G transform="translate(14 9.5)">
        <Path d="M -11 0 L 11 0 L 14.5 -1.8 L 11 -3.5 L -11 -3.5 Z" fill={C.plane} />
        <Path d="M 0 -1.8 L -6 -10 L -1.5 -10 L 6 -1.8 Z" fill={C.plane} />
        <Path d="M 0 -1.8 L -5 6 L -1.5 6 L 5 -1.8 Z" fill={C.planeShade} />
        <Path d="M -11 -1.8 L -14 -7 L -11.5 -7 L -7 -1.8 Z" fill={C.plane} />
      </G>
    </Svg>
  );
}

// ── Moving parts ─────────────────────────────────────────────────────────
function Sun({ fit, still }) {
  const R = 26 * fit.s;
  const HALO = 42 * fit.s;
  const c = fit.page(316, 182);
  const rise = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (!still) rise.value = withDelay(100, withTiming(1, { duration: 1700, easing: Easing.out(Easing.cubic) }));
  }, [still]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = fit.s;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(rise.value, [0, 0.3], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: (1 - rise.value) * 120 * s }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: c.x - HALO, top: c.y - HALO, width: HALO * 2, height: HALO * 2 }, style]}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: HALO * 2, height: HALO * 2, borderRadius: HALO, backgroundColor: C.sunHalo, opacity: 0.55 }} />
      <View style={{ position: 'absolute', top: HALO - R, left: HALO - R, width: R * 2, height: R * 2, borderRadius: R, backgroundColor: C.sun }} />
    </Animated.View>
  );
}

function Cloud({ fit, x, y, scale, drift, duration, still }) {
  const w = 80 * scale * fit.s;
  const p = fit.page(x, y);
  const t = useSharedValue(0);
  useEffect(() => {
    if (!still) t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [still]); // eslint-disable-line react-hooks/exhaustive-deps
  const dx = drift * fit.s;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * dx }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: p.x - w / 2, top: p.y - w * 0.19 }, style]}>
      <CloudShape width={w} />
    </Animated.View>
  );
}

function Dot({ x, y, at, progress, size }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [at - 0.03, at], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [at - 0.03, at, at + 0.06], [0.2, 1.5, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View
      style={[styles.dot, { left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

/** The plane at the head of the route, turned along it (and round, flying back). */
function Plane({ route, edges, progress, heading, width }) {
  const { xs, ys } = route;
  const h = width * (16 / 30);
  const style = useAnimatedStyle(() => {
    const f = progressToFrac(progress.value, edges);
    const pos = f * (xs.length - 1);
    const i = Math.min(Math.floor(pos), xs.length - 2);
    const t = pos - i;
    const x = xs[i] + (xs[i + 1] - xs[i]) * t;
    const y = ys[i] + (ys[i + 1] - ys[i]) * t;
    const a = Math.max(0, i - 3);
    const b = Math.min(xs.length - 1, i + 4);
    const angle = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]);
    return {
      // It lands on the flag at the very end.
      opacity: interpolate(progress.value, [PAGES - 0.08, PAGES], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: x - width / 2 },
        { translateY: y - h / 2 },
        { rotate: `${angle}rad` },
        { scaleX: heading.value },
      ],
    };
  });
  return (
    <Animated.View style={[styles.plane, style]}>
      <PlaneShape width={width} />
    </Animated.View>
  );
}

function Pin({ x, y, at, kind, progress }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [at - 0.04, at], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [at - 0.04, at + 0.03, at + 0.08], [0.3, 1.2, 1], Extrapolation.CLAMP) }],
  }));
  const size = kind === 'flag' ? 26 : kind === 'start' ? 16 : 20;
  return (
    <Animated.View style={[styles.pin, { left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2 }, kind === 'flag' && styles.pinFlag, style]}>
      {kind === 'flag'
        ? <Ionicons name="flag" size={12} color={PALETTE.frostLight} />
        : <View style={[styles.pinCore, kind === 'start' && styles.pinCoreSmall]} />}
    </Animated.View>
  );
}

/** Page k's little app screen, floating over its stretch of sky. */
function MiniScreen({ index, left, top, scale, at, progress }) {
  const Screen = MINIS[index];
  const style = useAnimatedStyle(() => {
    const v = interpolate(progress.value, [at, at + 0.1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: v,
      transform: [
        { translateY: (1 - v) * 18 },
        { scale: scale * (0.9 + 0.1 * v) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.mini, { left, top }, style]}>
      <Screen />
    </Animated.View>
  );
}

/** A headline with one word in orange. */
function Headline({ title, accent, style, accentStyle }) {
  const i = title.indexOf(accent);
  return (
    <Text style={style} maxFontSizeMultiplier={1.15} accessibilityRole="header">
      {title.slice(0, i)}
      <Text style={accentStyle}>{accent}</Text>
      {title.slice(i + accent.length)}
    </Text>
  );
}

/** One page's headline and line; fully shown on its page, gone by halfway. */
function PageText({ text, index, pagesX, compact }) {
  const style = useAnimatedStyle(() => {
    const d = pagesX.value - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.45], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(Math.abs(d), [0, 0.45], [0, 6], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View style={[styles.pageText, style]}>
      <Headline
        title={text.title}
        accent={text.accent}
        style={[styles.headline, compact && styles.headlineCompact]}
        accentStyle={styles.headlineAccent}
      />
      <Text style={styles.body} maxFontSizeMultiplier={1.25} numberOfLines={2}>{text.body}</Text>
    </Animated.View>
  );
}

function PageDot({ index, pagesX }) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(pagesX.value - index);
    return {
      width: interpolate(d, [0, 1], [22, 7], Extrapolation.CLAMP),
      opacity: interpolate(d, [0, 1], [1, 0.3], Extrapolation.CLAMP),
    };
  });
  return <Animated.View style={[styles.pageDot, style]} />;
}

export default function WelcomeScene({ style, paused = false, compact = false }) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState(null);
  const [page, setPage] = useState(0);
  const scrollRef = useAnimatedRef();

  const flight = useSharedValue(0);                // route fraction while it flies itself
  const manual = useSharedValue(reduceMotion ? 1 : 0); // 1 once you've swiped
  const bias = useSharedValue(0);                  // smooths the hand-over to your finger
  const scrollX = useSharedValue(0);
  const heading = useSharedValue(1);               // 1 nose forward, -1 flying back

  const textH = compact ? 98 : 108;

  // Crop maths for this box: grid → screen points.
  const layout = useMemo(() => {
    if (!area) return null;
    const W = area.width;
    const sceneH = area.height - textH;
    const s = Math.max(W / PAGE_W, sceneH / GRID_H);
    const oy = sceneH - GRID_H * s;
    const oxPage = (W - PAGE_W * s) / 2;
    const oxPan = (W * PAGES - GRID_W * s) / 2;
    const pan = (x, y) => ({ x: oxPan + x * s, y: oy + y * s });
    // Each page's stretch ends exactly at the screen's edge.
    const points = WAYPOINTS.map((w) => pan(w.edge ? (w.edge * W - oxPan) / s : w.x, w.y));
    const route = buildRoute(points, s);
    const edges = [0];
    WAYPOINTS.forEach((w, i) => { if (w.edge) edges.push(route.wpFrac[i]); });
    edges.push(1);
    const stops = WAYPOINTS
      .map((w, i) => ({ ...w, ...points[i], at: fracToProgress(route.wpFrac[i], edges) }))
      .filter((w) => w.pin);

    // The screens sit between the brand and the route, as big as fits.
    const top = insets.top + 58;
    const routeTop = Math.min(...route.ys);
    const scale = Math.min(1.1, Math.max(0.5, (routeTop - top - 14) / MINI_H));
    const minis = stops.filter((st) => st.screen !== undefined).map((st) => ({
      index: st.screen,
      // Comes in as the plane passes its pin (by mid-page at the latest, where
      // the plane rests when you swipe).
      at: Math.min(st.at - 0.02, st.screen + REST - 0.13),
      left: st.screen * W + (W - MINI_W) / 2,
      // Scaled about its centre, so shift it to keep its top edge in place.
      top: top - (MINI_H * (1 - scale)) / 2,
      scale,
    }));

    return {
      W,
      sceneH,
      fit: { s, page: (x, y) => ({ x: oxPage + x * s, y: oy + y * s }) },
      route,
      edges,
      dots: route.dots.map((d) => ({ ...d, at: fracToProgress(d.f, edges) })),
      stops,
      minis,
      flightMs: (route.total / (SPEED * s)) * 1000,
    };
  }, [area, textH, insets.top]);

  const W = layout?.W || 1;
  const edges = layout?.edges || [0, 1 / 3, 2 / 3, 1];

  // The one number everything reads.
  const shown = useDerivedValue(() => (
    manual.value
      ? swipeProgress(scrollX.value / W) + bias.value
      : fracToProgress(flight.value, edges)
  ), [W, edges]);

  // While it flies itself, the page follows the plane.
  useAnimatedReaction(
    () => (manual.value ? -1 : cameraPages(fracToProgress(flight.value, edges)) * W),
    (x, prev) => {
      if (x >= 0 && x !== prev) scrollTo(scrollRef, x, 0, false);
    },
    [W, edges],
  );

  // Turn the plane round when it flies back.
  useAnimatedReaction(
    () => shown.value,
    (cur, prev) => {
      if (prev === null) return;
      const dir = cur < prev - 0.0004 ? -1 : cur > prev + 0.0004 ? 1 : 0;
      if (dir && dir !== Math.sign(heading.value) && Math.abs(heading.value) === 1) {
        heading.value = withTiming(dir, { duration: 260 });
      }
    },
  );

  // Page number, for the screen reader label.
  useAnimatedReaction(
    () => Math.round(scrollX.value / W),
    (pg, prev) => { if (pg !== prev) runOnJS(setPage)(pg); },
    [W],
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => { scrollX.value = e.contentOffset.x; },
    onBeginDrag: (e) => {
      if (manual.value) return;
      // Hand the plane to the finger without a jump.
      const now = fracToProgress(flight.value, edges);
      cancelAnimation(flight);
      bias.value = now - swipeProgress(e.contentOffset.x / W);
      manual.value = 1;
      bias.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) });
    },
  }, [W, edges]);

  // Fly (or pause while the sign-in sheet is open, then carry on).
  useEffect(() => {
    if (!layout || reduceMotion || manual.value) return;
    if (paused) {
      cancelAnimation(flight);
      return;
    }
    const left = 1 - flight.value;
    if (left <= 0) return;
    if (flight.value === 0) {
      flight.value = withDelay(FIRST_DELAY, withTiming(1, {
        duration: layout.flightMs,
        // Eases off the ground and into the landing; even in between.
        easing: Easing.bezier(0.3, 0.12, 0.7, 0.88),
      }));
    } else {
      flight.value = withTiming(1, { duration: layout.flightMs * left, easing: Easing.out(Easing.quad) });
    }
  }, [layout, paused, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const planeW = layout ? 30 * layout.fit.s : 0;
  const dotSize = layout ? Math.max(4, 4.2 * layout.fit.s) : 0;
  const pagesX = useDerivedValue(() => scrollX.value / W, [W]);

  return (
    <View style={[styles.root, style]}>
      <View
        style={styles.area}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (!area || area.width !== width || area.height !== height) setArea({ width, height });
        }}
      >
        {!!layout && (
          <>
            {/* Fixed sky: the land scrolls under it */}
            <View style={[styles.sky, { height: layout.sceneH }]} pointerEvents="none">
              <Sky width={layout.W} height={layout.sceneH} />
              <Sun fit={layout.fit} still={reduceMotion} />
              <Cloud fit={layout.fit} x={70} y={222} scale={1} drift={22} duration={9000} still={reduceMotion} />
              <Cloud fit={layout.fit} x={196} y={168} scale={0.7} drift={-16} duration={11000} still={reduceMotion} />
              <Cloud fit={layout.fit} x={128} y={276} scale={0.5} drift={12} duration={8000} still={reduceMotion} />
            </View>

            <Animated.ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              scrollEventThrottle={16}
              onScroll={onScroll}
            >
              <View style={{ width: layout.W * PAGES, height: area.height }}>
                {/* The land, the screens and the route, all three pages wide */}
                <View
                  style={{ position: 'absolute', left: 0, top: 0, width: layout.W * PAGES, height: layout.sceneH }}
                  pointerEvents="none"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Land width={layout.W * PAGES} height={layout.sceneH} />
                  {layout.minis.map((m) => (
                    <MiniScreen key={m.index} {...m} progress={shown} />
                  ))}
                  {layout.dots.map((d, i) => (
                    <Dot key={i} x={d.x} y={d.y} at={d.at} progress={shown} size={dotSize} />
                  ))}
                  {layout.stops.map((st) => (
                    <Pin key={`p${st.x}`} x={st.x} y={st.y} at={st.at} kind={st.pin} progress={shown} />
                  ))}
                  <Plane route={layout.route} edges={layout.edges} progress={shown} heading={heading} width={planeW} />
                </View>

              </View>
            </Animated.ScrollView>

            {/* The words stay put under the scene and cross-fade as the page
                changes (touches pass through, so you can swipe here too). */}
            <View
              style={[styles.textArea, { top: layout.sceneH - 4, height: textH + 4 }]}
              pointerEvents="none"
            >
              {PAGE_TEXT.map((t, i) => (
                <PageText key={t.title} text={t} index={i} pagesX={pagesX} compact={compact} />
              ))}
            </View>
          </>
        )}
      </View>

      {/* Page dots */}
      <View style={styles.dots} accessible accessibilityLabel={`Page ${page + 1} of ${PAGES}`}>
        {PAGE_TEXT.map((t, i) => <PageDot key={t.title} index={i} pagesX={pagesX} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  area: {
    flex: 1,
  },
  sky: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: C.skyBottom,
  },
  mini: {
    position: 'absolute',
    width: MINI_W,
    height: MINI_H,
  },
  dot: {
    position: 'absolute',
    backgroundColor: PALETTE.orange,
  },
  plane: {
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: '#1C2833',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },
  pin: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  pinFlag: {
    backgroundColor: PALETTE.orange,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  pinCore: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: PALETTE.orange,
  },
  pinCoreSmall: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  textArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: PALETTE.frost,
  },
  pageText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  headline: {
    fontSize: 28,
    lineHeight: 36,
    fontFamily: 'Poppins_700Bold',
    color: PALETTE.slateInk,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  headlineCompact: {
    fontSize: 24,
    lineHeight: 31,
  },
  headlineAccent: {
    color: PALETTE.orange,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: 'Poppins_400Regular',
    color: '#4F6070',
    marginTop: 4,
    maxWidth: 320,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    height: 16,
  },
  // A round dot that stretches into a pill for the current page.
  pageDot: {
    height: 7,
    borderRadius: 3.5,
    backgroundColor: PALETTE.slateDark,
  },
});
