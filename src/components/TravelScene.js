import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path, G, Ellipse } from 'react-native-svg';

/*
 * A bright, flat travel illustration (sky, sun, mountains, green hills, a
 * lake, a little village, a plane), drawn in code: shown where there's no
 * photo yet, e.g. Create trip before a destination is picked. Like photos,
 * illustrations carry their own colours; the app's interface stays in its
 * three (frost, slate, blood orange).
 *
 * Drawn on a 400 × 300 grid and cropped to fill its box (anchored to the
 * bottom, so the land always shows and the sky gives way on short boxes).
 * The front hills are deep green, so white text can sit on them.
 */

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
  hillFront: '#2C7A3C',
  wall: '#FFF4E3',
  wallShade: '#F2DFC2',
  roof: '#E5533C',
  roofDark: '#C23E2B',
  door: '#8A4B2A',
  window: '#7FC8EE',
  trunk: '#8A5A34',
  tree: '#2F8F45',
  treeLight: '#4DAF5A',
  plane: '#FFFFFF',
  trail: '#FFFFFF',
};

/** A small house: walls, a red roof, a door and a window. */
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

/** A round tree. */
function Tree({ x, y, s = 1 }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x="-1.5" y="-6" width="3" height="8" fill={C.trunk} />
      <Circle cx="0" cy="-12" r="8" fill={C.tree} />
      <Circle cx="-2.5" cy="-14" r="4" fill={C.treeLight} />
    </G>
  );
}

export default function TravelScene({ style }) {
  // Measured box: the drawing needs exact sizes (percentages don't fill
  // reliably inside absolutely positioned layouts).
  const [size, setSize] = useState(null);
  return (
    <View
      style={style}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (!size || size.width !== width || size.height !== height) setSize({ width, height });
      }}
    >
      {!!size && (
    <Svg width={size.width} height={size.height} viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.skyTop} />
          <Stop offset="1" stopColor={C.skyBottom} />
        </LinearGradient>
      </Defs>

      {/* Sky (taller than the grid, for tall boxes) */}
      <Rect x="-200" y="-300" width="800" height="600" fill="url(#sky)" />

      {/* Sun */}
      <Circle cx="290" cy="82" r="44" fill={C.sunHalo} opacity="0.55" />
      <Circle cx="290" cy="82" r="28" fill={C.sun} />

      {/* Clouds */}
      <G fill={C.cloud}>
        <Ellipse cx="86" cy="66" rx="34" ry="11" />
        <Ellipse cx="106" cy="58" rx="20" ry="13" />
        <Ellipse cx="74" cy="60" rx="14" ry="9" />
        <Ellipse cx="200" cy="40" rx="22" ry="7" opacity="0.9" />
        <Ellipse cx="212" cy="35" rx="12" ry="7" opacity="0.9" />
      </G>

      {/* A plane on a dashed trail */}
      <Path d="M 30 132 Q 100 96 168 106" stroke={C.trail} strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" fill="none" />
      <G transform="translate(174 104) rotate(-8) scale(1.2)">
        <Path d="M -9 0 L 10 0 L 13 -1.6 L 10 -3 L -9 -3 Z" fill={C.plane} />
        <Path d="M 0 -1.5 L -5 -9 L -1 -9 L 5 -1.5 Z" fill={C.plane} />
        <Path d="M 0 -1.5 L -4 6 L -1 6 L 4 -1.5 Z" fill="#E6EEF5" />
        <Path d="M -9 -1.5 L -12 -6 L -10 -6 L -6 -1.5 Z" fill={C.plane} />
      </G>

      {/* Far mountains with snow */}
      <Path d="M -20 196 L 58 120 L 118 182 L 186 108 L 256 186 L 330 128 L 420 200 L 420 300 L -20 300 Z" fill={C.farMountain} />
      <Path d="M 186 108 L 256 186 L 214 186 Z" fill={C.farShade} />
      <Path d="M 58 120 L 118 182 L 86 182 Z" fill={C.farShade} />
      <Path d="M 58 120 L 74 136 L 64 134 L 56 140 L 48 130 Z" fill={C.snow} />
      <Path d="M 186 108 L 206 128 L 194 126 L 184 134 L 174 121 Z" fill={C.snow} />
      <Path d="M 330 128 L 346 141 L 336 140 L 328 146 L 320 137 Z" fill={C.snow} />

      {/* Back hills */}
      <Path d="M -20 214 C 40 186 110 192 160 208 C 220 226 270 188 330 192 C 370 195 400 204 420 212 L 420 300 L -20 300 Z" fill={C.hillBack} />

      {/* Lake, field and village, mirrored so the village sits on the right
          and the lake on the left, under the screen's title text. */}
      <G transform="translate(400 0) scale(-1 1)">
        {/* Lake */}
        <Path d="M 214 222 C 240 212 300 212 336 220 C 352 224 350 236 330 240 C 296 246 236 244 214 236 C 202 232 202 226 214 222 Z" fill={C.lake} />
        <Path d="M 236 224 L 268 224 M 290 230 L 320 230" stroke={C.lakeLight} strokeWidth="2.5" strokeLinecap="round" />

        {/* Mid hill with a field */}
        <Path d="M -20 238 C 30 214 90 214 150 230 C 180 238 196 246 210 252 L -20 262 Z" fill={C.hillMid} />
        <Path d="M 40 236 C 70 226 104 228 130 236 L 118 246 C 94 240 66 240 46 246 Z" fill={C.field} />

        {/* Village */}
        <House x={80} y={232} s={1} />
        <House x={110} y={236} s={0.85} />
        <Tree x={58} y={236} s={1} />
        <Tree x={132} y={238} s={0.9} />
      </G>

      {/* Near hills */}
      <Path d="M -20 262 C 60 240 140 248 200 258 C 260 268 320 244 420 252 L 420 300 L -20 300 Z" fill={C.hillNear} />

      {/* Front hills (deep green, for text on top) */}
      <Path d="M -20 276 C 60 262 140 270 200 280 C 270 292 340 268 420 274 L 420 300 L -20 300 Z" fill={C.hillFront} />
    </Svg>
      )}
    </View>
  );
}
