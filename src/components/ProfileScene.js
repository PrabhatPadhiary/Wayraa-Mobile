import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path, G, Ellipse } from 'react-native-svg';

/*
 * Profile's header scene: a bright countryside (sky, sun, mountains, rolling
 * hills, a windmill, a little farm), drawn in code with soft shading for a
 * bit of depth.
 *
 * It comes in two layers so the screen can put your name BETWEEN them, like
 * the iPhone Lock Screen's depth effect (the picture in front of the clock):
 *
 *   <ProfileSceneBack />   sky, sun, clouds, mountains, far hills
 *   …your big name…
 *   <ProfileSceneFront />  near hills, farm and the windmill (its blades turn)
 *
 * Both draw on a SCENE_W × SCENE_H grid scaled to the box's width (the box
 * should be width × SCENE_H / SCENE_W tall), so `sceneY(y, width)` turns a
 * grid height into points for placing things between the layers.
 */
export const SCENE_W = 400;
export const SCENE_H = 340;
export const sceneY = (y, width) => (y * width) / SCENE_W;

const C = {
  skyTop: '#7CC6EE',
  skyBottom: '#D9F0FA',
  sun: '#FFC93C',
  sunHalo: '#FFE7A3',
  far: '#9DB7D5',
  farShade: '#84A0C2',
  snow: '#FFFFFF',
  hillBackTop: '#A9DA88',
  hillBackBottom: '#86C66C',
  hillMidTop: '#7CC466',
  hillMidBottom: '#56A653',
  field: '#C9E58C',
  fieldLine: '#B4D877',
  hillNearTop: '#4FAA55',
  hillNearBottom: '#2F8545',
  hillFrontTop: '#2E8243',
  hillFrontBottom: '#1E6233',
  wall: '#FFF4E3',
  wallShade: '#EAD6B8',
  roof: '#E5533C',
  roofDark: '#B83A28',
  door: '#8A4B2A',
  window: '#7FC8EE',
  tower: '#F6EBDD',
  towerShade: '#DCC8AE',
  cap: '#D94A35',
  blade: '#FFFFFF',
  bladeLine: '#D8CFC4',
  trunk: '#8A5A34',
  tree: '#2F8F45',
  treeLight: '#4DAF5A',
};

// Windmill hub, on the grid (the blades turn around it).
const HUB = { x: 348, y: 128 };
const BLADE_R = 44;      // blade drawing size (grid units)
const BLADE_SHOWN = 70;  // how big the blades are shown: they sweep over the title
const TOWER_S = 1.45;    // tower scale, to match

function House({ x, y, s = 1, flip = false }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <Rect x="-14" y="-16" width="28" height="18" fill={C.wall} />
      <Rect x="5" y="-16" width="9" height="18" fill={C.wallShade} />
      <Path d="M -18 -15 L 0 -31 L 18 -15 Z" fill={C.roof} />
      <Path d="M 0 -31 L 18 -15 L 8 -15 Z" fill={C.roofDark} />
      <Rect x="-9" y="-9" width="6" height="11" fill={C.door} />
      <Rect x="1" y="-11" width="7" height="6" fill={C.window} />
    </G>
  );
}

function Tree({ x, y, s = 1 }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x="-1.6" y="-6" width="3.2" height="8" fill={C.trunk} />
      <Circle cx="0" cy="-13" r="8.5" fill={C.tree} />
      <Circle cx="-2.8" cy="-15.5" r="4.2" fill={C.treeLight} />
    </G>
  );
}

/** Size the SVG to the box's width (height follows the grid's ratio). */
function useBox(width) {
  return { width, height: (width * SCENE_H) / SCENE_W };
}

export function ProfileSceneBack({ width }) {
  const box = useBox(width);
  return (
    <Svg width={box.width} height={box.height} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="pSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.skyTop} />
          <Stop offset="1" stopColor={C.skyBottom} />
        </LinearGradient>
        <LinearGradient id="pBackHill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.hillBackTop} />
          <Stop offset="1" stopColor={C.hillBackBottom} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={SCENE_W} height={SCENE_H} fill="url(#pSky)" />

      {/* Sun and clouds */}
      <Circle cx="92" cy="96" r="40" fill={C.sunHalo} opacity="0.6" />
      <Circle cx="92" cy="96" r="25" fill={C.sun} />
      <G fill="#FFFFFF">
        <Ellipse cx="236" cy="78" rx="30" ry="10" />
        <Ellipse cx="254" cy="70" rx="18" ry="12" />
        <Ellipse cx="224" cy="72" rx="13" ry="8" />
        <Ellipse cx="350" cy="58" rx="20" ry="7" opacity="0.9" />
      </G>

      {/* Mountains (behind the name) */}
      <Path d="M -10 200 L 70 118 L 128 176 L 196 106 L 268 182 L 332 132 L 410 196 L 410 340 L -10 340 Z" fill={C.far} />
      <Path d="M 196 106 L 268 182 L 226 182 Z" fill={C.farShade} />
      <Path d="M 70 118 L 128 176 L 98 176 Z" fill={C.farShade} />
      <Path d="M 70 118 L 86 134 L 76 132 L 68 138 L 60 128 Z" fill={C.snow} />
      <Path d="M 196 106 L 216 126 L 204 124 L 194 132 L 184 119 Z" fill={C.snow} />
      <Path d="M 332 132 L 346 144 L 337 143 L 330 148 L 322 140 Z" fill={C.snow} />

      {/* Far hills */}
      <Path d="M -10 214 C 50 188 120 194 176 208 C 236 224 290 194 350 196 C 380 197 400 204 410 210 L 410 340 L -10 340 Z" fill="url(#pBackHill)" />
    </Svg>
  );
}

export function ProfileSceneFront({ width }) {
  const box = useBox(width);
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 16000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const scale = width / SCENE_W;
  const bladeBox = BLADE_SHOWN * 2 * scale;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={box.width} height={box.height} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="pMid" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.hillMidTop} />
            <Stop offset="1" stopColor={C.hillMidBottom} />
          </LinearGradient>
          <LinearGradient id="pNear" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.hillNearTop} />
            <Stop offset="1" stopColor={C.hillNearBottom} />
          </LinearGradient>
          <LinearGradient id="pFront" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.hillFrontTop} />
            <Stop offset="1" stopColor={C.hillFrontBottom} />
          </LinearGradient>
        </Defs>

        {/* Mid hill: rises over the lower part of the name (the depth effect) */}
        <Path d="M -10 186 C 40 168 96 170 150 182 C 200 193 240 196 280 186 C 320 176 370 178 410 186 L 410 340 L -10 340 Z" fill="url(#pMid)" />
        {/* Field rows on it, for perspective */}
        <Path d="M 40 214 C 80 200 140 202 180 214 L 172 226 C 132 216 84 216 50 228 Z" fill={C.field} />
        <Path d="M 52 220 C 90 209 136 210 176 220" stroke={C.fieldLine} strokeWidth="2" fill="none" />

        {/* Farm */}
        <House x={100} y={196} s={1} />
        <House x={140} y={200} s={0.8} />
        <Tree x={70} y={200} s={1} />
        <Tree x={168} y={204} s={0.85} />

        {/* Windmill tower (blades are drawn separately, turning) */}
<G transform={`translate(${HUB.x} ${HUB.y}) scale(${TOWER_S}) translate(${-HUB.x} ${-HUB.y})`}>
                  <Path d={`M ${HUB.x - 13} ${HUB.y + 4} L ${HUB.x + 13} ${HUB.y + 4} L ${HUB.x + 21} ${HUB.y + 92} L ${HUB.x - 21} ${HUB.y + 92} Z`} fill={C.tower} />
          <Path d={`M ${HUB.x + 2} ${HUB.y + 4} L ${HUB.x + 13} ${HUB.y + 4} L ${HUB.x + 21} ${HUB.y + 92} L ${HUB.x + 6} ${HUB.y + 92} Z`} fill={C.towerShade} />
          <Rect x={HUB.x - 5} y={HUB.y + 66} width="10" height="18" rx="5" fill={C.door} />
          <Rect x={HUB.x - 4} y={HUB.y + 32} width="8" height="9" fill={C.window} />
          <Path d={`M ${HUB.x - 18} ${HUB.y + 6} L ${HUB.x} ${HUB.y - 14} L ${HUB.x + 18} ${HUB.y + 6} Z`} fill={C.cap} />
        </G>

        {/* Near hills */}
        <Path d="M -10 248 C 60 226 140 232 210 246 C 280 260 340 236 410 242 L 410 340 L -10 340 Z" fill="url(#pNear)" />
        <Tree x={36} y={246} s={1.3} />
        <Tree x={300} y={250} s={1.2} />

        {/* Front hills (dark, for text and the stats card) */}
        <Path d="M -10 282 C 70 266 150 274 210 284 C 280 296 340 272 410 278 L 410 340 L -10 340 Z" fill="url(#pFront)" />
      </Svg>

      {/* Windmill blades, turning slowly around the hub */}
      <Animated.View
        style={{
          position: 'absolute',
          width: bladeBox,
          height: bladeBox,
          left: (HUB.x - BLADE_SHOWN) * scale,
          top: (HUB.y - BLADE_SHOWN) * scale,
          transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
        }}
      >
        <Svg width={bladeBox} height={bladeBox} viewBox={`${-BLADE_R} ${-BLADE_R} ${BLADE_R * 2} ${BLADE_R * 2}`}>
          {[0, 90, 180, 270].map((a) => (
            <G key={a} transform={`rotate(${a})`}>
              <Rect x="-2" y={-BLADE_R + 4} width="4" height={BLADE_R - 6} fill={C.bladeLine} />
              <Rect x="2" y={-BLADE_R + 4} width="13" height={BLADE_R - 14} fill={C.blade} stroke={C.bladeLine} strokeWidth="1" />
              <Path d={`M 2 ${-BLADE_R + 16} L 15 ${-BLADE_R + 16} M 2 ${-BLADE_R + 28} L 15 ${-BLADE_R + 28} M 2 ${-BLADE_R + 40} L 15 ${-BLADE_R + 40}`} stroke={C.bladeLine} strokeWidth="1" />
            </G>
          ))}
          <Circle cx="0" cy="0" r="5" fill={C.roofDark} />
        </Svg>
      </Animated.View>
    </View>
  );
}
