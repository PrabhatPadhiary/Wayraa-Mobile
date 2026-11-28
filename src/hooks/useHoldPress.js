import { useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

/** How long to hold before a card's menu opens. */
export const HOLD_MS = 350;

/**
 * Press feedback for cards that open a menu when held (trip tickets): while
 * held, the card presses in a little more until the menu opens, then a
 * haptic tick says it worked; let go and it springs back. A quick tap only
 * dips it slightly.
 *
 *   const hold = useHoldPress();
 *   <Animated.View style={hold.style}>
 *     <Pressable onPressIn={hold.onPressIn} onPressOut={hold.onPressOut}
 *       onLongPress={hold.held(openMenu)} delayLongPress={HOLD_MS} />
 *
 * Put `style` on the card's outer view, so its frame shrinks with it.
 * With Reduce Motion it doesn't move; the haptic stays.
 */
export default function useHoldPress() {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();

  const onPressIn = () => {
    if (reduced) return;
    Animated.timing(scale, {
      toValue: 0.96,
      duration: HOLD_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 6, useNativeDriver: true }).start();
  };
  // The menu opening: a tick, then the menu.
  const held = (fn) => (fn ? (...args) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    fn(...args);
  } : undefined);

  return { style: { transform: [{ scale }] }, onPressIn, onPressOut, held };
}
