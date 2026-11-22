import React, { useRef } from 'react';
import Svg, {
  Defs, LinearGradient, RadialGradient, Stop, G, Circle, Polygon, Path, Ellipse, Rect,
} from 'react-native-svg';
import { RANK_LOOKS, LOCKED_PALETTE } from '../utils/ranks';

/**
 * A traveller rank's emblem. Each rank has its own shape, metal and symbol,
 * and they get grander as you climb: a stone disc (Wanderer), a bronze coin,
 * an emerald hexagon, a sapphire shield, an amethyst rosette with a ribbon,
 * and a gold starburst with laurels and a ribbon (Legend).
 *
 * @param {number} level    0–5
 * @param {number} size     width and height
 * @param {boolean} locked  greyed out, with a lock (a rank you haven't reached)
 */
export default function RankBadge({ level = 0, size = 64, locked = false }) {
  const look = RANK_LOOKS[Math.max(0, Math.min(level, RANK_LOOKS.length - 1))];
  const c = locked ? LOCKED_PALETTE : look.palette;
  const gold = locked ? '#E4E8EC' : '#FFD36B';
  const id = useBadgeId();
  const tier = level;

  return (
    <Svg width={size} height={size} viewBox="-66 -66 132 132">
      <Defs>
        <LinearGradient id={`${id}m`} x1="0" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor={c[0]} />
          <Stop offset="0.45" stopColor={c[1]} />
          <Stop offset="1" stopColor={c[2]} />
        </LinearGradient>
        <RadialGradient id={`${id}f`} cx="0.35" cy="0.3" r="0.85">
          <Stop offset="0" stopColor={c[1]} />
          <Stop offset="0.7" stopColor={c[2]} />
          <Stop offset="1" stopColor={c[3]} />
        </RadialGradient>
        <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      <G opacity={locked ? 0.75 : 1}>
        {tier >= 4 && <Ribbon c={c} />}
        {tier >= 5 && <Laurel c={c} />}
        {/* Drop shadow, rim, face */}
        <G transform="translate(0 3)" opacity={0.25}><Frame shape={look.shape} fill={c[3]} /></G>
        <Frame shape={look.shape} fill={`url(#${id}m)`} />
        <G transform="scale(1.08)" opacity={0.9}><Frame shape={look.shape} fill={c[3]} inner /></G>
        <Frame shape={look.shape} fill={`url(#${id}f)`} inner />
        <G transform={tier >= 4 ? 'translate(0 -1)' : undefined}>
          <Icon kind={look.icon} c={c} gold={gold} />
        </G>
        {/* Shine */}
        <Ellipse cx={-6} cy={-30} rx={30} ry={12} fill={`url(#${id}s)`} transform="rotate(-18)" />
        {tier >= 5 && !locked && (
          <G fill="#FFF7D6">
            <Polygon points={star(4, 7, 1.6)} transform="translate(-48 -46)" />
            <Polygon points={star(4, 5, 1.2)} transform="translate(50 -40)" />
            <Polygon points={star(4, 4, 1)} transform="translate(44 -56)" />
          </G>
        )}
      </G>

      {locked && (
        <G transform="translate(30 32)">
          <Circle r={15} fill="#2B3F51" stroke="#FFFFFF" strokeWidth={3} />
          <Rect x={-6.5} y={-2} width={13} height={10} rx={2} fill="#FFFFFF" />
          <Path d="M-4 -2 v-3.5 a4 4 0 0 1 8 0 v3.5" fill="none" stroke="#FFFFFF" strokeWidth={2.4} />
        </G>
      )}
    </Svg>
  );
}

// Gradient ids must be unique on screen (several badges show at once).
let nextId = 0;
function useBadgeId() {
  const ref = useRef(null);
  if (ref.current == null) { nextId += 1; ref.current = `rb${nextId}`; }
  return ref.current;
}

const f2 = (n) => n.toFixed(2);

/** A regular polygon's points, centred on 0,0. */
function poly(n, r, rot = -90) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180;
    return `${f2(r * Math.cos(a))},${f2(r * Math.sin(a))}`;
  }).join(' ');
}

/** A star's points: n tips at radius ro, valleys at ri. */
function star(n, ro, ri, rot = -90) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (180 / n) * i) * Math.PI) / 180;
    return `${f2(r * Math.cos(a))},${f2(r * Math.sin(a))}`;
  }).join(' ');
}

const shield = (s) => `M0 ${-52 * s} C ${18 * s} ${-44 * s}, ${34 * s} ${-44 * s}, ${46 * s} ${-46 * s} `
  + `C ${48 * s} ${-6 * s}, ${38 * s} ${28 * s}, 0 ${54 * s} `
  + `C ${-38 * s} ${28 * s}, ${-48 * s} ${-6 * s}, ${-46 * s} ${-46 * s} `
  + `C ${-34 * s} ${-44 * s}, ${-18 * s} ${-44 * s}, 0 ${-52 * s} Z`;

/** The rank's outer frame, or (inner) its face. */
function Frame({ shape, fill, inner = false }) {
  switch (shape) {
    case 'coin':
      return inner ? <Circle r={39} fill={fill} /> : <Polygon points={star(18, 54, 49)} fill={fill} />;
    case 'hex':
      return <Polygon points={poly(6, inner ? 41 : 56)} fill={fill} strokeLinejoin="round" />;
    case 'shield':
      return <Path d={shield(inner ? 0.78 : 1.06)} fill={fill} transform={inner ? 'translate(0 2)' : undefined} />;
    case 'rosette':
      return inner ? <Circle r={38} fill={fill} /> : <Polygon points={star(10, 57, 47)} fill={fill} />;
    case 'star':
      return inner ? <Circle r={37} fill={fill} /> : <Polygon points={star(12, 58, 46)} fill={fill} />;
    case 'circle':
    default:
      return <Circle r={inner ? 40 : 52} fill={fill} />;
  }
}

/** The rank's symbol, in white. */
function Icon({ kind, c, gold }) {
  const w = '#FFFFFF';
  switch (kind) {
    case 'trail': // a dotted trail to a pin
      return (
        <G>
          <Path d="M-19 17 C -6 13, -18 1, -5 -2 S 9 -6 9 -13" fill="none" stroke={w} strokeWidth={3.2} strokeLinecap="round" strokeDasharray="0.1 7" />
          <Circle cx={-19} cy={17} r={3.4} fill={w} />
          <Path d="M11 -29 a8 8 0 0 1 8 8 c0 6 -8 13 -8 13 s-8 -7 -8 -13 a8 8 0 0 1 8 -8z" fill={w} />
          <Circle cx={11} cy={-21} r={3} fill={c[2]} />
        </G>
      );
    case 'compass':
      return (
        <G>
          <Circle r={21} fill="none" stroke={w} strokeWidth={3} />
          <Path d="M0 -21v5M0 21v-5M-21 0h5M21 0h-5" stroke={w} strokeWidth={2.6} strokeLinecap="round" />
          <Polygon points="0,-15 5.5,0 -5.5,0" fill={w} />
          <Polygon points="0,15 5.5,0 -5.5,0" fill={w} opacity={0.45} />
          <Circle r={2.6} fill={c[3]} />
        </G>
      );
    case 'peak': // a mountain with a flag on top
      return (
        <G>
          <Path d="M-26 18 L-9 -6 L-1 4 L9 -14 L26 18 Z" fill={w} />
          <Path d="M9 -14 L4 -5 L9 -8 L13 -4 Z M-9 -6 L-13 0 L-9 -2 L-6 1 Z" fill={c[1]} opacity={0.55} />
          <Path d="M9 -14 V -30" stroke={w} strokeWidth={2.6} strokeLinecap="round" />
          <Path d="M9 -30 L21 -26 L9 -21 Z" fill={gold} />
        </G>
      );
    case 'sail':
      return (
        <G>
          <Path d="M1 -27 L1 7" stroke={w} strokeWidth={2.6} strokeLinecap="round" />
          <Path d="M4 -25 L22 4 H4 Z" fill={w} />
          <Path d="M-2 -17 L-17 4 H-2 Z" fill={w} opacity={0.8} />
          <Path d="M-22 9 H22 L14 19 H-14 Z" fill={w} />
          <Path d="M-24 25 q6 -4 12 0 t12 0 t12 0 t12 0" fill="none" stroke={w} strokeWidth={2.4} strokeLinecap="round" opacity={0.75} />
        </G>
      );
    case 'globe': // a globe with a plane circling it
      return (
        <G>
          <Circle r={19} fill="none" stroke={w} strokeWidth={3} />
          <Ellipse rx={8} ry={19} fill="none" stroke={w} strokeWidth={2.4} />
          <Path d="M-19 0 H19 M-16 -10 Q0 -6 16 -10 M-16 10 Q0 6 16 10" fill="none" stroke={w} strokeWidth={2.2} />
          <Ellipse rx={31} ry={10} fill="none" stroke={gold} strokeWidth={2.4} strokeDasharray="5 4" transform="rotate(-22)" />
          <Path d="M0 -4 L9 0 L0 4 L2 0 Z" fill={gold} transform="rotate(-22) translate(27 -5) rotate(-15)" />
        </G>
      );
    case 'crown':
    default:
      return (
        <G>
          <Path d="M-22 10 L-25 -14 L-11 -3 L0 -21 L11 -3 L25 -14 L22 10 Z" fill={w} stroke={w} strokeWidth={2} strokeLinejoin="round" />
          <Rect x={-22} y={13} width={44} height={7} rx={3} fill={w} />
          <Circle cx={-25} cy={-14} r={3.4} fill={w} />
          <Circle cx={25} cy={-14} r={3.4} fill={w} />
          <Circle cx={0} cy={-22} r={3.6} fill={w} />
          <Polygon points={star(5, 7, 3)} fill={c[2]} transform="translate(0 2)" />
        </G>
      );
  }
}

/** Two ribbon tails behind the badge (Globetrotter, Legend). */
function Ribbon({ c }) {
  return (
    <G>
      <Polygon points="-30,26 -13,30 -9,64 -20,56 -31,63" fill={c[2]} />
      <Polygon points="30,26 13,30 9,64 20,56 31,63" fill={c[2]} />
      <Polygon points="-30,26 -13,30 -12,40 -29,36" fill={c[3]} opacity={0.5} />
      <Polygon points="30,26 13,30 12,40 29,36" fill={c[3]} opacity={0.5} />
    </G>
  );
}

/** A laurel wreath around the badge (Legend). */
const LAUREL = (() => {
  const leaves = [];
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 7; i++) {
      const a = ((side < 0 ? 118 + i * 17 : 62 - i * 17) * Math.PI) / 180;
      const x = 61 * Math.cos(a);
      const y = 61 * Math.sin(a);
      const rot = (Math.atan2(y, x) * 180) / Math.PI + (side < 0 ? -90 : 90) + side * 30;
      leaves.push({ key: `${side}${i}`, x, y, rot, alt: i % 2 === 1 });
    }
  });
  return leaves;
})();

function Laurel({ c }) {
  return (
    <G>
      {LAUREL.map((l) => (
        <Ellipse
          key={l.key}
          cx={f2(l.x)}
          cy={f2(l.y)}
          rx={7.5}
          ry={3.4}
          fill={l.alt ? c[1] : c[0]}
          transform={`rotate(${f2(l.rot)} ${f2(l.x)} ${f2(l.y)})`}
        />
      ))}
    </G>
  );
}
