import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

export const MAX_TRAVELLERS = 50;

/**
 * − [ 4 ] + for the number of travellers. The number itself is a field: tap
 * it to type a count (handy for big groups); it's kept between 1 and
 * MAX_TRAVELLERS when you finish typing.
 *
 * @param {number} value
 * @param {(n: number) => void} onChange
 */
export default function TravellerStepper({ value, onChange }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow the buttons (and any outside change) while not typing.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const clamp = (n) => Math.min(MAX_TRAVELLERS, Math.max(1, n));

  const onType = (t) => {
    const digits = t.replace(/\D/g, '').slice(0, 2);
    setText(digits);
    const n = parseInt(digits, 10);
    if (Number.isFinite(n) && n >= 1) onChange(clamp(n));
  };

  const finish = () => {
    setFocused(false);
    const n = parseInt(text, 10);
    const next = Number.isFinite(n) ? clamp(n) : value;
    onChange(next);
    setText(String(next));
  };

  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={[styles.stepButton, value <= 1 && styles.stepDisabled]}
        onPress={() => onChange(clamp(value - 1))}
        disabled={value <= 1}
        accessibilityLabel="Fewer travellers"
        activeOpacity={0.8}
      >
        <Ionicons name="remove" size={20} color={COLORS.textPrimary} />
      </TouchableOpacity>

      <TextInput
        style={[styles.value, focused && styles.valueFocused]}
        value={text}
        onChangeText={onType}
        onFocus={() => setFocused(true)}
        onBlur={finish}
        onSubmitEditing={finish}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        maxLength={2}
        accessibilityLabel={`Travellers: ${value}. Tap to type a number`}
      />

      <TouchableOpacity
        style={[styles.stepButton, value >= MAX_TRAVELLERS && styles.stepDisabled]}
        onPress={() => onChange(clamp(value + 1))}
        disabled={value >= MAX_TRAVELLERS}
        accessibilityLabel="More travellers"
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={20} color={COLORS.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  stepDisabled: {
    opacity: 0.4,
  },
  // The count: looks like a number, with a light box hinting you can type.
  value: {
    width: 64,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    textAlign: 'center',
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  valueFocused: {
    borderColor: COLORS.accent,
    borderWidth: 1.5,
  },
});
