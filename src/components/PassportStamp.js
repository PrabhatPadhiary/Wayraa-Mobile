import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path, Circle, Ellipse, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { SIZES } from '../constants';

const W = 96;
const H = 70;

// Two inks per stamp: [frame + city, inner line + icon + selected fill].
const COMBOS = [
  ['#23407A', '#D9481C'], // navy + orange
  ['#A8783A', '#23407A'], // gold + navy
  ['#8E3B3B', '#A8783A'], // oxblood + gold
  ['#2F6B4F', '#C98A2B'], // forest + amber
  ['#5B3A8E', '#2F6B4F'], // plum + forest
  ['#C2410C', '#23407A'], // rust + navy
];

// Shapes, each with an outer frame and a thinner inner line.
const SHAPES = ['hex', 'ring', 'octagon', 'ticket', 'oval'];

function Frame({ shape, ink, accent, fill }) {
  const outer = { stroke: ink, strokeWidth: 2.2, fill, strokeLinejoin: 'round' };
  const inner = { stroke: accent, strokeWidth: 1, fill: 'none', strokeLinejoin: 'round' };
  switch (shape) {
    case 'ring':
      return (
        <>
          <Circle cx={W / 2} cy={H / 2} r={33} {...outer} />
          <Circle cx={W / 2} cy={H / 2} r={28} {...inner} />
        </>
      );
    case 'octagon':
      return (
        <>
          <Path d="M22 2 H74 L94 18 V52 L74 68 H22 L2 52 V18 Z" {...outer} />
          <Path d="M24 7 H72 L89 20 V50 L72 63 H24 L7 50 V20 Z" {...inner} />
        </>
      );
    case 'ticket':
      // Rounded corners with a notch on each side, and a dashed inner line.
      return (
        <>
          <Path
            d="M8 2 H88 A6 6 0 0 1 94 8 V27 A8 8 0 0 0 94 43 V62 A6 6 0 0 1 88 68 H8 A6 6 0 0 1 2 62 V43 A8 8 0 0 0 2 27 V8 A6 6 0 0 1 8 2 Z"
            {...outer}
          />
          <Rect x={12} y={8} width={72} height={54} rx={3} {...inner} strokeDasharray="3 3" />
        </>
      );
    case 'oval':
      return (
        <>
          <Ellipse cx={W / 2} cy={H / 2} rx={46} ry={33} {...outer} />
          <Ellipse cx={W / 2} cy={H / 2} rx={40} ry={27} {...inner} />
        </>
      );
    default: // hex
      return (
        <>
          <Path d="M18 2 H78 L94 35 L78 68 H18 L2 35 Z" {...outer} />
          <Path d="M21 7 H75 L88 35 L75 63 H21 L8 35 Z" {...inner} />
        </>
      );
  }
}

/**
 * A small passport-style stamp for a place someone has written about: the
 * city and an icon in the stamp, the full place and month underneath.
 * `index` (its position in the row) picks the shape and the two inks, so
 * neighbouring stamps never look the same.
 *
 * @param {string} city       in the stamp ("Kyoto")
 * @param {string} [place]    under it ("Kyoto, Japan")
 * @param {string} [when]     "Mar 2026"
 * @param {string} [icon]     Ionicons name
 * @param {number} [index]
 * @param {boolean} [selected]
 * @param {() => void} [onPress]
 */
export default function PassportStamp({ city, place, when, icon = 'airplane-outline', index = 0, selected, onPress, accessibilityLabel }) {
  const shape = SHAPES[index % SHAPES.length];
  const [ink, accent] = COMBOS[index % COMBOS.length];
  const round = shape === 'ring';
  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.stamp}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={styles.svg}>
          <Frame shape={shape} ink={ink} accent={accent} fill={selected ? `${accent}26` : 'none'} />
        </Svg>
        <Text
          style={[styles.city, { color: ink }, round && styles.cityRound]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {city}
        </Text>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      {!!place && <Text style={styles.place} numberOfLines={1}>{place}</Text>}
      {!!when && <Text style={styles.when} numberOfLines={1}>{when}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: W,
    alignItems: 'center',
  },
  stamp: {
    width: W,
    height: H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  city: {
    maxWidth: W - 30,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.3,
  },
  cityRound: {
    maxWidth: 50,
  },
  place: {
    marginTop: 6,
    maxWidth: W,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: '#1C2833',
    textAlign: 'center',
  },
  when: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: '#7F8D99',
    textAlign: 'center',
  },
});
