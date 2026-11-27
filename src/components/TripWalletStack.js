import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES } from '../constants';

// How much of each card behind shows above the one in front.
const PEEK = 30;
// Cards drawn behind the front one (more are kept, just not shown).
const MAX_BEHIND = 2;
const SETTLE = { duration: 420, dampingRatio: 0.82 };
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * One card in the stack. `depth` 0 is the front; each step back moves it up
 * by PEEK, shrinks it a little and shades it. The front card follows the finger sideways, turning as it goes,
 * like a pass pulled out of a wallet; thrown far or fast enough, it's tucked
 * behind the others (`onSendBack`) and slides back in from the side.
 */
function StackCard({ depth, isFront, width, reduced, onBringFront, onSendBack, onHeight, children, label }) {
  const d = useSharedValue(depth);
  const x = useSharedValue(0);
  useEffect(() => {
    d.set(reduced ? depth : withSpring(depth, SETTLE));
    // Just tucked behind: come back from where it was thrown.
    if (!isFront) x.set(reduced ? 0 : withSpring(0, { duration: 460, dampingRatio: 0.85 }));
  }, [depth, isFront, reduced, d, x]);

  const throwAt = width * 0.55;
  const pan = usePanGesture({
    enabled: isFront,
    // Sideways only, so the page still scrolls up and down.
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      x.set(e.translationX);
    },
    onDeactivate: (e) => {
      'worklet';
      const tx = e.translationX;
      const v = e.velocityX;
      // Far enough, or a flick.
      if (Math.abs(tx) > width * 0.28 || Math.abs(v) > 800) {
        const dir = tx + v * 0.1 >= 0 ? 1 : -1;
        if (reduced) {
          x.set(0);
          scheduleOnRN(onSendBack);
          return;
        }
        x.set(withTiming(dir * throwAt, { duration: 160, easing: EASE_OUT }, (done) => {
          if (done) scheduleOnRN(onSendBack);
        }));
      } else {
        x.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: v }));
      }
    },
  });

  const style = useAnimatedStyle(() => {
    const depthNow = d.get();
    const xNow = x.get();
    const turn = interpolate(xNow, [-width, 0, width], [-10, 0, 10], Extrapolation.CLAMP);
    const lift = interpolate(Math.abs(xNow), [0, width], [0, -14], Extrapolation.CLAMP);
    return {
      opacity: interpolate(depthNow, [MAX_BEHIND, MAX_BEHIND + 0.6], [1, 0], Extrapolation.CLAMP),
      // Flat on purpose: a 3D tilt (rotateX / rotateY) lets a card's lower
      // half come forward through the card in front of it on iOS.
      transform: [
        { translateX: xNow },
        { translateY: -depthNow * PEEK + lift },
        { scale: 1 - depthNow * 0.05 },
        { rotateZ: `${turn}deg` },
      ],
    };
  });
  const shade = useAnimatedStyle(() => ({
    opacity: interpolate(d.get(), [0, 1, MAX_BEHIND], [0, 0.16, 0.28], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      style={[styles.card, { zIndex: 100 - depth }, style]}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      pointerEvents={depth > MAX_BEHIND ? 'none' : 'box-none'}
    >
      <GestureDetector gesture={pan}>
        <View>{children}</View>
      </GestureDetector>
      <Animated.View style={[styles.shade, shade]} pointerEvents="none" />
      {/* Behind: the visible strip brings this card to the front. */}
      {!isFront && (
        <Pressable
          style={styles.peekHit}
          onPress={onBringFront}
          accessibilityRole="button"
          accessibilityLabel={`Show ${label}`}
        />
      )}
    </Animated.View>
  );
}

/**
 * Several cards (the trips you're on right now) stacked like passes in a
 * wallet: the front one whole, the next ones peeking out above it. Swipe the front card sideways to tuck it behind the others
 * (a flick is enough), or tap a peeking card to pull it forward. Dots under
 * the stack say how many there are and which one is in front.
 *
 * @param {Array<{ key: string, label: string }>} items
 * @param {(item, { isFront: boolean }) => React.ReactNode} renderItem
 */
export default function TripWalletStack({ items, renderItem }) {
  const { width: screenW } = useWindowDimensions();
  const reduced = useReducedMotion();
  const n = items.length;
  // Front first: the order the cards are stacked in.
  const [order, setOrder] = useState(() => items.map((i) => i.key));
  const [cardH, setCardH] = useState(0);

  // Keep the order in step with the trips (new ones go to the back).
  useEffect(() => {
    setOrder((cur) => {
      const keys = items.map((i) => i.key);
      const kept = cur.filter((k) => keys.includes(k));
      const next = [...kept, ...keys.filter((k) => !kept.includes(k))];
      return next.length === cur.length && next.every((k, i) => k === cur[i]) ? cur : next;
    });
  }, [items]);

  const sendFrontBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setOrder((cur) => [...cur.slice(1), cur[0]]);
  };
  const bringFront = (key) => {
    Haptics.selectionAsync().catch(() => {});
    setOrder((cur) => [key, ...cur.filter((k) => k !== key)]);
  };

  const behind = Math.min(n - 1, MAX_BEHIND);
  const byKey = new Map(items.map((i) => [i.key, i]));

  return (
    <View style={styles.wrap}>
      <View style={styles.hintRow}>
        <Text style={styles.hint}>{n} trips on right now</Text>
        <Text style={styles.hintSub}>Swipe to switch</Text>
      </View>
      <View
        style={[
          styles.stack,
          { height: cardH ? cardH + behind * PEEK : 320, opacity: cardH ? 1 : 0 },
        ]}
      >
        {/* Drawn back to front, so the front card is always on top. */}
        {order.map((key, depth) => ({ key, depth })).reverse().map(({ key, depth }) => {
          const item = byKey.get(key);
          if (!item) return null;
          const isFront = depth === 0;
          return (
            <StackCard
              key={key}
              depth={depth}
              isFront={isFront}
              width={screenW}
              reduced={reduced}
              label={item.label}
              onBringFront={() => bringFront(key)}
              onSendBack={sendFrontBack}
              onHeight={(h) => { if (isFront && h && Math.abs(h - cardH) > 1) setCardH(h); }}
            >
              {renderItem(item, { isFront })}
            </StackCard>
          );
        })}
      </View>
      <View style={styles.dots} accessibilityLabel={`Trip ${items.findIndex((i) => i.key === order[0]) + 1} of ${n}`}>
        {items.map((i) => (
          <View key={i.key} style={[styles.dot, order[0] === i.key && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SIZES.spacing_base,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: SIZES.spacing_sm,
  },
  hint: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  hintSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  stack: {
    position: 'relative',
  },
  // Every card sits at the stack's top (under the peek space); the front
  // one sets the height.
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  shade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 26,
    backgroundColor: '#0E161D',
  },
  peekHit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: PEEK + 4,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: SIZES.spacing_md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  dotOn: {
    width: 18,
    backgroundColor: COLORS.accent,
  },
});
