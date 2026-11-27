import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../constants';

/**
 * A torn paper edge: a strip whose free side is ragged. Put `side="bottom"`
 * under a piece of paper and `side="top"` over the next one with the same
 * `seed`, and the two edges match like halves torn from one sheet.
 *
 * @param {'bottom'|'top'} side   which edge of the paper this is
 * @param {string} [color]        the paper's colour
 * @param {number} [height]       how deep the tears go (pt)
 * @param {number} [teeth]        how many jags across
 * @param {number} [seed]         same seed = matching edges
 */
export default function TornEdge({ side = 'bottom', color = COLORS.white, height = 9, teeth = 46, seed = 7, style }) {
  // Small, repeatable randomness (so both halves get the same jags).
  let r = seed * 9301 + 49297;
  const rand = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  const W = 100;
  const pts = [];
  for (let i = 0; i <= teeth; i += 1) {
    const x = (i / teeth) * W + (i > 0 && i < teeth ? (rand() - 0.5) * (W / teeth) * 0.6 : 0);
    // Alternate up and down, by uneven amounts: torn, not sawn.
    const base = i % 2 ? 0.72 : 0.28;
    const y = Math.max(0.6, Math.min(height - 0.6, (base + (rand() - 0.5) * 0.4) * height));
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  // Bottom edge: paper above the tear. Top edge: paper below it.
  const d = side === 'bottom'
    ? `M0,0 L${W},0 L${pts.slice().reverse().join(' L')} Z`
    : `M0,${height} L${W},${height} L${pts.slice().reverse().join(' L')} Z`;
  return (
    <View style={[{ height }, style]} pointerEvents="none">
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <Path d={d} fill={color} />
      </Svg>
    </View>
  );
}
