import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, PALETTE } from '../constants/theme';

/**
 * What a screen shows when there's nothing in it yet: what goes here, and
 * the one thing to do next. Same look as SignInPrompt, so empty and guest
 * screens feel like one family.
 *
 * A little life on the full-size one (a first visit, mostly): the icon
 * floats gently and a soft ring ripples out of its circle every few seconds,
 * like the sun in the logo. Compact ones (no matches) stay still, and so
 * does everything when motion is reduced.
 *
 * @param {string} icon - Ionicons name
 * @param {string} title
 * @param {string} [text]
 * @param {string} [actionLabel] - main button (orange)
 * @param {() => void} [onAction]
 * @param {string} [secondaryLabel] - quiet link under the button
 * @param {() => void} [onSecondary]
 * @param {boolean} [compact] - smaller and quieter, for "nothing matches this
 *   filter / search" (the list isn't really empty)
 * @param {object} [style] - the screen's own positioning (padding, flex)
 */
export default function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  compact = false,
  style,
}) {
  return (
    <View style={[styles.container, style]}>
      {compact ? (
        <View style={[styles.iconCircle, styles.iconCircleCompact]}>
          <Ionicons name={icon} size={26} color={COLORS.primaryLight} />
        </View>
      ) : (
        <LivelyIcon icon={icon} />
      )}
      <Text style={[styles.title, compact && styles.titleCompact]} accessibilityRole="header">
        {title}
      </Text>
      {!!text && <Text style={styles.text}>{text}</Text>}
      {!!actionLabel && !!onAction && (
        <TouchableOpacity
          style={styles.button}
          onPress={onAction}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
      {!!secondaryLabel && !!onSecondary && (
        <TouchableOpacity
          style={styles.secondary}
          onPress={onSecondary}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** The orange icon circle: a ripple ring behind it, the icon floating. */
function LivelyIcon({ icon }) {
  const reduceMotion = useReducedMotion();
  const ripple = useSharedValue(0);
  const float = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    ripple.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
        withDelay(1400, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
    float.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - ripple.value),
    transform: [{ scale: 1 + ripple.value * 0.5 }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -3 + float.value * 6 }],
  }));

  return (
    <View style={styles.iconWrap}>
      {!reduceMotion && <Animated.View style={[styles.ring, ringStyle]} pointerEvents="none" />}
      <View style={[styles.iconCircle, styles.iconCircleInWrap]}>
        <Animated.View style={reduceMotion ? null : iconStyle}>
          <Ionicons name={icon} size={36} color={COLORS.accent} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 80,
    height: 80,
    marginBottom: SIZES.spacing_base,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(217, 72, 28, 0.35)',
  },
  iconCircleInWrap: {
    marginBottom: 0,
  },
  container: {
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(217, 72, 28, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.spacing_base,
  },
  iconCircleCompact: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PALETTE.slatePale,
    marginBottom: SIZES.spacing_md,
  },
  title: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
  },
  text: {
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.spacing_sm,
    maxWidth: 300,
  },
  button: {
    marginTop: SIZES.spacing_lg,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
  },
  buttonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  secondary: {
    marginTop: SIZES.spacing_base,
  },
  secondaryText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
});
