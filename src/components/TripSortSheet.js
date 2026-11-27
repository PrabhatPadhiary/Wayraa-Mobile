import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES } from '../constants';

export const GROUP_OPTIONS = [
  { key: 'year', label: 'Year', icon: 'calendar-outline' },
  { key: 'place', label: 'Place', icon: 'location-outline' },
];

export const SORT_OPTIONS = [
  { key: 'upcoming', label: 'Recommended', hint: 'Next trips soonest first, memories newest first', icon: 'airplane-outline' },
  { key: 'newest', label: 'Newest dates first', icon: 'arrow-down-outline' },
  { key: 'oldest', label: 'Oldest dates first', icon: 'arrow-up-outline' },
  { key: 'created', label: 'Recently added', icon: 'sparkles-outline' },
  { key: 'name', label: 'Name A–Z', icon: 'text-outline' },
];

/**
 * Bottom sheet for My Trips: group passes by year or place, and how to order
 * them. Each tap applies straight away (the list updates behind the sheet).
 */
export default function TripSortSheet({ visible, group, sort, onChangeGroup, onChangeSort, onClose }) {
  const insets = useSafeAreaInsets();
  const pick = (fn, key) => {
    Haptics.selectionAsync().catch(() => {});
    fn(key);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Arrange trips</Text>
            <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Done" hitSlop={8}>
              <Feather name="x" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.section}>GROUP BY</Text>
          <View style={styles.groupRow} accessibilityRole="radiogroup">
            {GROUP_OPTIONS.map((o) => {
              const on = group === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.groupOption, on && styles.groupOptionOn]}
                  onPress={() => pick(onChangeGroup, o.key)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Group by ${o.label}`}
                >
                  <Ionicons name={on ? o.icon.replace('-outline', '') : o.icon} size={20} color={on ? COLORS.accentDeep : COLORS.primaryLight} />
                  <Text style={[styles.groupLabel, on && styles.groupLabelOn]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.section}>SORT BY</Text>
          <View accessibilityRole="radiogroup">
            {SORT_OPTIONS.map((o) => {
              const on = sort === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  style={styles.sortRow}
                  onPress={() => pick(onChangeSort, o.key)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={o.label}
                >
                  <View style={[styles.sortIcon, on && styles.sortIconOn]}>
                    <Ionicons name={o.icon} size={17} color={on ? COLORS.white : COLORS.primaryLight} />
                  </View>
                  <View style={styles.sortText}>
                    <Text style={[styles.sortLabel, on && styles.sortLabelOn]}>{o.label}</Text>
                    {!!o.hint && <Text style={styles.sortHint}>{o.hint}</Text>}
                  </View>
                  {on && <Ionicons name="checkmark" size={20} color={COLORS.accent} />}
                </TouchableOpacity>
              );
            })}
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
    backgroundColor: 'rgba(16, 24, 32, 0.45)',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
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
    justifyContent: 'space-between',
    marginBottom: SIZES.spacing_sm,
  },
  title: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
  },
  groupRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
  },
  groupOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    height: 52,
    borderRadius: SIZES.radius_md + 4,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.backgroundWarm,
  },
  groupOptionOn: {
    borderColor: COLORS.accent,
    backgroundColor: '#FDEFEA',
  },
  groupLabel: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primaryLight,
  },
  groupLabelOn: { color: COLORS.accentDeep },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_sm + 2,
  },
  sortIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortIconOn: { backgroundColor: COLORS.accent },
  sortText: { flex: 1 },
  sortLabel: {
    fontSize: SIZES.md + 1,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  sortLabelOn: { fontFamily: 'Poppins_600SemiBold' },
  sortHint: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
});
