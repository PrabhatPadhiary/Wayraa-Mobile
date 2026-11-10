import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/**
 * Filters bottom sheet (Airbnb / Flipkart style): the options as a grid of
 * tappable cards with icons, one choice at a time, then "Show places" to
 * apply or "Clear" to go back to everything. Nothing changes until applied.
 *
 * @param {boolean} visible
 * @param {string} title             e.g. "Food filters"
 * @param {string} [subtitle]
 * @param {Array<{ label: string, icon: string }>} options  (Ionicons names; 'All' excluded)
 * @param {string} selected          current choice, 'All' for none
 * @param {(choice: string) => void} onApply   'All' when cleared
 * @param {() => void} onClose
 */
export default function FilterSheet({ visible, title, subtitle, options, selected, onApply, onClose }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(selected);

  // Start from the applied choice each time it opens.
  useEffect(() => {
    if (visible) setDraft(selected);
  }, [visible, selected]);

  const apply = (choice) => {
    onApply(choice);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close filters" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>{title}</Text>
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
              <Feather name="x" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {options.map((o) => {
              const on = draft === o.label;
              return (
                <TouchableOpacity
                  key={o.label}
                  style={[styles.option, on && styles.optionOn]}
                  onPress={() => setDraft(on ? 'All' : o.label)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={o.label}
                >
                  <Ionicons name={o.icon} size={24} color={on ? COLORS.accentDeep : COLORS.textPrimary} />
                  <Text style={[styles.optionText, on && styles.optionTextOn]} numberOfLines={1}>{o.label}</Text>
                  {on && (
                    <View style={styles.check}>
                      <Feather name="check" size={12} color={COLORS.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => apply('All')}
              disabled={selected === 'All' && draft === 'All'}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={[styles.clear, selected === 'All' && draft === 'All' && styles.clearOff]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.show}
              onPress={() => apply(draft)}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              <Text style={styles.showText}>{draft === 'All' ? 'Show all places' : `Show ${draft.toLowerCase()}`}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    maxHeight: '85%',
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SIZES.spacing_md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginBottom: SIZES.spacing_base,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SIZES.spacing_md,
    paddingBottom: SIZES.spacing_base,
  },
  option: {
    width: '48%',
    minHeight: 84,
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    padding: SIZES.spacing_base,
    borderRadius: SIZES.radius_md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  optionOn: {
    borderColor: COLORS.accent,
    backgroundColor: '#fff8f3',
  },
  optionText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  optionTextOn: {
    color: COLORS.accentDeep,
  },
  check: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    right: SIZES.spacing_sm,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_base,
    paddingTop: SIZES.spacing_base,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  clear: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textDecorationLine: 'underline',
  },
  clearOff: {
    color: COLORS.textMuted,
  },
  show: {
    flex: 1,
    maxWidth: 220,
    height: 50,
    borderRadius: SIZES.radius_full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accentDeep,
  },
  showText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
