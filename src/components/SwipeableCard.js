import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

const ACTION_WIDTH = 68;
const ACTION_GAP = 8;

/**
 * One action button. It scales and fades in with the swipe progress, which
 * runs on the UI thread (Reanimated), so it tracks the finger frame by frame.
 */
function ActionButton({ action, index, count, progress, height, onPress }) {
  const style = useAnimatedStyle(() => {
    // The outer (rightmost) button appears first, the inner one just after.
    const start = (count - 1 - index) * 0.15;
    return {
      opacity: interpolate(progress.value, [start, start + 0.5], [0, 1], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(progress.value, [start, start + 0.6], [0.6, 1], Extrapolation.CLAMP) },
      ],
    };
  });
  return (
    <Reanimated.View style={style}>
      <TouchableOpacity
        style={[styles.action, { backgroundColor: action.color, height }]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        <Ionicons name={action.icon} size={20} color={COLORS.white} />
        <Text style={styles.actionText}>{action.label}</Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

/**
 * Wraps a card so it can be swiped left to reveal action buttons (e.g. Edit
 * and Delete), like iOS Mail rows.
 *
 * Uses react-native-gesture-handler's ReanimatedSwipeable: the drag runs on
 * the native UI thread, so it stays smooth even while JS is busy. Only
 * horizontal drags start a swipe; vertical scrolling of the list is untouched.
 *
 * The open state is controlled by the parent so only one card is open at a
 * time. Actions sit at the top of the card, so they stay visible even when the
 * card is partly covered by the next one in a stacked list.
 *
 * @param {boolean} isOpen
 * @param {(open: boolean) => void} onOpenChange
 * @param {Array<{ key, label, icon, color, onPress }>} actions  in display order
 * @param {boolean} [enabled]  false = plain card, no swipe
 * @param {number} [actionsHeight]  height of the action buttons
 */
export default function SwipeableCard({
  children,
  isOpen,
  onOpenChange,
  actions,
  enabled = true,
  actionsHeight = 56,
}) {
  const ref = useRef(null);
  const actionsWidth = actions.length * ACTION_WIDTH + (actions.length + 1) * ACTION_GAP;

  // Parent closed this card (another opened, the list scrolled, ...).
  useEffect(() => {
    if (!isOpen) ref.current?.close();
  }, [isOpen]);

  if (!enabled) return children;

  const renderRightActions = (progress) => (
    <View style={[styles.actions, { width: actionsWidth }]}>
      {actions.map((a, index) => (
        <ActionButton
          key={a.key}
          action={a}
          index={index}
          count={actions.length}
          progress={progress}
          height={actionsHeight}
          onPress={() => {
            ref.current?.close();
            onOpenChange(false);
            a.onPress();
          }}
        />
      ))}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      rightThreshold={actionsWidth / 3}
      overshootRight={false}
      // Leftward drag distance before the swipe starts (negative in v3).
      dragOffsetFromRight={-12}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() => onOpenChange(true)}
      onSwipeableWillClose={() => onOpenChange(false)}
    >
      <View>
        {children}
        {/* While open, a tap on the card closes it instead of opening the trip. */}
        {isOpen && (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => ref.current?.close()}
            accessibilityLabel="Close actions"
          />
        )}
      </View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: ACTION_GAP,
    paddingTop: SIZES.spacing_sm,
    paddingHorizontal: ACTION_GAP,
  },
  action: {
    width: ACTION_WIDTH,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
