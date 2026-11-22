import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, PALETTE } from '../constants/theme';

/**
 * What a screen shows when there's nothing in it yet: what goes here, and
 * the one thing to do next. Same look as SignInPrompt, so empty and guest
 * screens feel like one family.
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
      <View style={[styles.iconCircle, compact && styles.iconCircleCompact]}>
        <Ionicons
          name={icon}
          size={compact ? 26 : 36}
          color={compact ? COLORS.primaryLight : COLORS.accent}
        />
      </View>
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

const styles = StyleSheet.create({
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
