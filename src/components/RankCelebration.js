import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Easing, AccessibilityInfo, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { COLORS, SIZES } from '../constants';
import RankBadge from './RankBadge';
import { RANK_LOOKS, withArticle } from '../utils/ranks';

const CONFETTI = 56;

/**
 * "You're now a Voyager": shown once after reaching a new rank. The emblem
 * pops in over slowly turning rays, confetti bursts out, and the phone gives
 * a short buzz. With Reduce Motion on, it just fades in.
 *
 * @param {number|null} level   the new rank (null = hidden)
 * @param {() => void} onClose
 * @param {() => void} [onSeeJourney]  "See your journey" (omit to just close)
 */
export default function RankCelebration({ level, onClose, onSeeJourney }) {
  const visible = level != null;
  const look = RANK_LOOKS[level ?? 0];
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);

  const pop = useRef(new Animated.Value(0)).current;      // badge
  const text = useRef(new Animated.Value(0)).current;     // words + button
  const burst = useRef(new Animated.Value(0)).current;    // confetti
  const spin = useRef(new Animated.Value(0)).current;     // rays

  // Each piece: where it flies, how it turns, its colour and size.
  const pieces = useMemo(() => {
    const colours = [...(look?.palette.slice(0, 2) || []), COLORS.accent, '#FFFFFF', '#FFD36B'];
    return Array.from({ length: CONFETTI }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * Math.min(width, 420) * 0.6;
      return {
        key: i,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        fall: 140 + Math.random() * 160,
        turn: `${Math.round(Math.random() * 720 - 360)}deg`,
        colour: colours[i % colours.length],
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        round: i % 3 === 0,
      };
    });
  }, [level, width]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    [pop, text, burst, spin].forEach((v) => v.setValue(0));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    AccessibilityInfo.announceForAccessibility?.(`New rank unlocked. You're now ${withArticle(look.name)}.`);

    if (reduceMotion) {
      Animated.parallel([
        Animated.timing(pop, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(text, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
      return undefined;
    }
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 70, delay: 120, useNativeDriver: true }),
      Animated.timing(text, { toValue: 1, duration: 450, delay: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 2200, delay: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 24000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, level, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;

  const badgeStyle = {
    opacity: pop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
    transform: [
      { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
      { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) },
    ],
  };
  const rise = (from) => ({
    opacity: text.interpolate({ inputRange: [from, Math.min(1, from + 0.5)], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{
      translateY: text.interpolate({ inputRange: [from, Math.min(1, from + 0.5)], outputRange: [10, 0], extrapolate: 'clamp' }),
    }],
  });
  const raySize = Math.max(width, height) * 1.3;
  const title = look.name === 'Legend' ? "You're a Legend" : `You're now ${withArticle(look.name)}`;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <LinearGradient colors={['#2B3F51', '#141E28']} style={styles.fill}>
        {/* Rays */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.rays,
            { width: raySize, height: raySize, marginLeft: -raySize / 2, marginTop: -raySize / 2 },
            {
              opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
              transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            },
          ]}
        >
          <Rays size={raySize} colour={look.glow} />
        </Animated.View>

        {/* Confetti */}
        {!reduceMotion && pieces.map((p) => (
          <Animated.View
            key={p.key}
            pointerEvents="none"
            style={[
              styles.piece,
              {
                width: p.w,
                height: p.h,
                borderRadius: p.round ? p.w : 2,
                backgroundColor: p.colour,
                opacity: burst.interpolate({ inputRange: [0, 0.05, 0.7, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, p.y * 0.85, p.y + p.fall] }) },
                  { rotate: burst.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.turn] }) },
                ],
              },
            ]}
          />
        ))}

        <View style={styles.content}>
          <Animated.View style={badgeStyle}>
            <RankBadge level={level} size={176} />
          </Animated.View>
          <Animated.Text style={[styles.kicker, { color: look.glow }, rise(0)]}>New rank unlocked</Animated.Text>
          <Animated.Text style={[styles.title, rise(0.1)]} accessibilityRole="header">{title}</Animated.Text>
          <Animated.Text style={[styles.sub, rise(0.2)]}>{look.cheer}</Animated.Text>
          <Animated.View style={[styles.actions, rise(0.35)]}>
            <TouchableOpacity
              style={styles.cta}
              onPress={onSeeJourney || onClose}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{onSeeJourney ? 'See your journey' : 'Nice!'}</Text>
            </TouchableOpacity>
            {onSeeJourney && (
              <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button">
                <Text style={styles.later}>Close</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      </LinearGradient>
    </Modal>
  );
}

/** Light rays from the centre, fading out toward the edge. */
function Rays({ size, colour }) {
  const r = size / 2;
  const count = 16;
  const d = Array.from({ length: count }, (_, i) => {
    const a1 = (i / count) * Math.PI * 2;
    const a2 = a1 + (Math.PI * 2) / count / 2.4;
    return `M${r} ${r} L${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} L${r + r * Math.cos(a2)} ${r + r * Math.sin(a2)} Z`;
  }).join(' ');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="rayFade" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={colour} stopOpacity="0.32" />
          <Stop offset="0.55" stopColor={colour} stopOpacity="0.08" />
          <Stop offset="1" stopColor={colour} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Path d={d} fill="url(#rayFade)" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', left: '50%', top: '42%' },
  piece: { position: 'absolute', left: '50%', top: '40%' },
  content: { alignItems: 'center', paddingHorizontal: SIZES.spacing_lg, gap: 6 },
  kicker: {
    marginTop: SIZES.spacing_base,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    textAlign: 'center',
  },
  sub: {
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: '#B6C3CF',
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: { alignItems: 'center', gap: SIZES.spacing_base, marginTop: SIZES.spacing_lg },
  cta: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 30,
    paddingVertical: 14,
  },
  ctaText: { fontSize: SIZES.md, fontFamily: 'Poppins_600SemiBold', color: COLORS.white },
  later: { fontSize: SIZES.md, fontFamily: 'Poppins_500Medium', color: '#B6C3CF' },
});
