import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient as Gradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { PALETTE } from '../constants/theme';

/*
 * Small, drawn-in-code versions of three Wayraa screens for the welcome
 * pages: a day's plan, the trip budget, and a published story. Not
 * screenshots, so they stay sharp, match the app's colours and need no
 * loading. Drawn at a fixed size (MINI_W × MINI_H); the welcome scene
 * scales them to fit the phone.
 *
 * They're frosted glass over the landscape: a real blur on iPhone, a
 * see-through frost on Android (its blur needs a target view behind, which
 * a scrolling scene can't give it), with a bright rim and a top sheen.
 * Rows inside are lighter glass, so the scene still shows between them.
 */

export const MINI_W = 176;
export const MINI_H = 220;

const INK = PALETTE.slateInk;
const MUTED = '#7F8D99';
const T = { maxFontSizeMultiplier: 1, allowFontScaling: false, numberOfLines: 1 };

function Frame({ children }) {
  return (
    <View style={styles.shadow}>
      <View style={styles.frame}>
        {Platform.OS === 'ios' && (
          <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, styles.frost]} />
        <Gradient
          colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.6, y: 0.55 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>{children}</View>
        <View style={styles.notch} />
      </View>
    </View>
  );
}

// ── 1. A day's plan ──────────────────────────────────────────────────────
const STOPS = [
  { time: '08:30', title: 'Sunrise at the lake', icon: 'sunny-outline', tint: '#FFF3D6', bar: '#F2A541' },
  { time: '11:00', title: 'Old town walk', icon: 'walk-outline', tint: '#E3F1FB', bar: '#4FB3E8' },
  { time: '19:30', title: 'Dinner by the beach', icon: 'restaurant-outline', tint: PALETTE.orangeTint, bar: PALETTE.orange },
];

export function MiniItinerary() {
  return (
    <Frame>
      <Text style={styles.title} {...T}>Goa with the crew</Text>
      <Text style={styles.meta} {...T}>12 – 15 Mar · 4 people</Text>
      <View style={styles.chips}>
        {['Day 1', 'Day 2', 'Day 3'].map((d, i) => (
          <View key={d} style={[styles.chip, i === 0 && styles.chipOn]}>
            <Text style={[styles.chipText, i === 0 && styles.chipTextOn]} {...T}>{d}</Text>
          </View>
        ))}
      </View>
      {STOPS.map((s) => (
        <View key={s.title} style={styles.row}>
          <View style={[styles.rowBar, { backgroundColor: s.bar }]} />
          <View style={[styles.rowIcon, { backgroundColor: s.tint }]}>
            <Ionicons name={s.icon} size={10} color={s.bar} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTime} {...T}>{s.time}</Text>
            <Text style={styles.rowTitle} {...T}>{s.title}</Text>
          </View>
        </View>
      ))}
    </Frame>
  );
}

// ── 2. The budget ────────────────────────────────────────────────────────
const PEOPLE = [
  { name: 'Aarav', color: '#5E9FD6', text: 'owes ₹600', owes: true },
  { name: 'Meera', color: '#E58A5C', text: 'gets ₹1,200', owes: false },
  { name: 'Kabir', color: '#6DBB5A', text: 'owes ₹600', owes: true },
];

export function MiniBudget() {
  return (
    <Frame>
      <Text style={styles.title} {...T}>Trip budget</Text>
      <View style={styles.amountRow}>
        <Text style={styles.amount} {...T}>₹18,400</Text>
        <Text style={styles.amountOf} {...T}> of ₹25,000</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: '74%' }]} />
      </View>
      <Text style={styles.label} {...T}>WHO OWES WHAT</Text>
      {PEOPLE.map((p) => (
        <View key={p.name} style={styles.personRow}>
          <View style={[styles.avatar, { backgroundColor: p.color }]}>
            <Text style={styles.avatarText} {...T}>{p.name[0]}</Text>
          </View>
          <Text style={styles.personName} {...T}>{p.name}</Text>
          <Text style={[styles.personAmount, { color: p.owes ? PALETTE.orangeDeep : '#3E8E63' }]} {...T}>{p.text}</Text>
        </View>
      ))}
      <View style={styles.settle}>
        <Text style={styles.settleText} {...T}>Settle up</Text>
      </View>
    </Frame>
  );
}

// ── 3. A story ───────────────────────────────────────────────────────────
function StoryPhoto() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 160 84" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="miniSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F9B16E" />
          <Stop offset="1" stopColor="#FCE3C4" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="160" height="84" fill="url(#miniSky)" />
      <Circle cx="112" cy="40" r="11" fill="#FFE7A3" />
      <Path d="M 0 62 L 34 30 L 58 52 L 86 24 L 122 58 L 160 36 L 160 84 L 0 84 Z" fill="#7D8FB3" />
      <Path d="M 86 24 L 96 34 L 90 33 L 84 37 L 79 31 Z M 34 30 L 42 38 L 37 37 L 32 40 L 28 35 Z" fill="#FFFFFF" />
      <Path d="M 0 70 C 40 60 90 64 160 58 L 160 84 L 0 84 Z" fill="#3E9A4B" />
    </Svg>
  );
}

export function MiniStory() {
  return (
    <Frame>
      <View style={styles.photo}>
        <StoryPhoto />
      </View>
      <Text style={[styles.title, styles.storyTitle]} {...T}>Three days in the hills</Text>
      <View style={styles.author}>
        <View style={[styles.avatar, styles.avatarSmall, { backgroundColor: '#E58A5C' }]}>
          <Text style={styles.avatarText} {...T}>R</Text>
        </View>
        <Text style={styles.meta} {...T}>Riya · 5 min read</Text>
      </View>
      <Text style={styles.excerpt} numberOfLines={2} maxFontSizeMultiplier={1} allowFontScaling={false}>
        We took the long way up, and it was worth every bend in the road.
      </Text>
      <View style={styles.footer}>
        <Ionicons name="heart" size={10} color={PALETTE.orange} />
        <Text style={styles.footerText} {...T}>128</Text>
        <Ionicons name="chatbubble-outline" size={9} color={MUTED} style={styles.footerGap} />
        <Text style={styles.footerText} {...T}>24</Text>
        <View style={styles.flex} />
        <Ionicons name="bookmark-outline" size={10} color={MUTED} />
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  shadow: {
    width: MINI_W,
    height: MINI_H,
    borderRadius: 22,
    shadowColor: '#1C2833',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
  },
  frame: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  },
  frost: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(255,255,255,0.22)' : 'rgba(246,248,250,0.42)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 14,
  },
  notch: {
    position: 'absolute',
    top: 5,
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  title: {
    fontSize: 11.5,
    fontFamily: 'Poppins_700Bold',
    color: INK,
    letterSpacing: -0.2,
  },
  meta: {
    fontSize: 7.5,
    fontFamily: 'Poppins_400Regular',
    color: MUTED,
  },
  chips: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 7,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  chipOn: {
    backgroundColor: PALETTE.orange,
    borderColor: PALETTE.orange,
  },
  chipText: {
    fontSize: 7,
    fontFamily: 'Poppins_600SemiBold',
    color: PALETTE.slate,
  },
  chipTextOn: {
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingRight: 6,
    marginBottom: 5,
    overflow: 'hidden',
  },
  rowBar: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: 6,
  },
  rowIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  rowBody: {
    flex: 1,
  },
  rowTime: {
    fontSize: 6.5,
    fontFamily: 'Poppins_500Medium',
    color: MUTED,
  },
  rowTitle: {
    fontSize: 8.5,
    fontFamily: 'Poppins_600SemiBold',
    color: INK,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  amount: {
    fontSize: 17,
    fontFamily: 'Poppins_700Bold',
    color: INK,
    letterSpacing: -0.4,
  },
  amountOf: {
    fontSize: 7.5,
    fontFamily: 'Poppins_400Regular',
    color: MUTED,
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 5,
    borderRadius: 3,
    backgroundColor: PALETTE.orange,
  },
  label: {
    fontSize: 6.5,
    fontFamily: 'Poppins_600SemiBold',
    color: MUTED,
    letterSpacing: 0.8,
    marginTop: 9,
    marginBottom: 4,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 9,
    paddingVertical: 4,
    paddingHorizontal: 5,
    marginBottom: 4,
  },
  avatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  avatarSmall: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    marginRight: 4,
  },
  avatarText: {
    fontSize: 7,
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  personName: {
    flex: 1,
    fontSize: 8,
    fontFamily: 'Poppins_600SemiBold',
    color: INK,
  },
  personAmount: {
    fontSize: 7.5,
    fontFamily: 'Poppins_600SemiBold',
  },
  settle: {
    alignSelf: 'center',
    marginTop: 3,
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: PALETTE.orange,
  },
  settleText: {
    fontSize: 7.5,
    fontFamily: 'Poppins_600SemiBold',
    color: '#FFFFFF',
  },
  photo: {
    height: 84,
    marginHorizontal: -10,
    marginTop: -14,
    marginBottom: 8,
  },
  storyTitle: {
    fontSize: 11,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  excerpt: {
    fontSize: 7.5,
    lineHeight: 11,
    fontFamily: 'Poppins_400Regular',
    color: '#4F6070',
    marginTop: 5,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  footerText: {
    fontSize: 7.5,
    fontFamily: 'Poppins_500Medium',
    color: MUTED,
    marginLeft: 3,
  },
  footerGap: {
    marginLeft: 10,
  },
  flex: {
    flex: 1,
  },
});
