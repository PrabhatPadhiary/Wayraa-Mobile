import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { COLORS, SIZES } from '../constants';

/**
 * Horizontal filter selector built like the bottom GlassTabBar: one floating
 * glass bar with a single rounded capsule that slides to the active filter.
 *
 * Two layout variants:
 *  - "text" (default): text-only chips (used where labels are short).
 *  - "icon-selective": every chip shows its icon; only the ACTIVE chip also
 *    reveals its label. Keeps the row compact while labelling the selection.
 *
 * @param {Array<{ key, label, icon? }>} filters
 * @param {string} activeKey
 * @param {(key: string) => void} onChange
 * @param {'text'|'icon-selective'} [variant]
 * @param {boolean} [embedded] - render without the glass chrome (for headers)
 */
export default function FilterChips({
  filters,
  activeKey,
  onChange,
  variant = 'text',
  embedded = false,
}) {
  // Measured layout (x + width) of each item, keyed by filter key.
  const [layouts, setLayouts] = useState({});
  const capsuleX = useRef(new Animated.Value(0)).current;
  const capsuleW = useRef(new Animated.Value(0)).current;
  const hasPlaced = useRef(false);

  const activeLayout = layouts[activeKey];

  // Position the capsule on the active item. Snap on first placement,
  // spring smoothly for later changes.
  useEffect(() => {
    if (!activeLayout) return;

    if (!hasPlaced.current) {
      capsuleX.setValue(activeLayout.x);
      capsuleW.setValue(activeLayout.width);
      hasPlaced.current = true;
      return;
    }

    Animated.parallel([
      Animated.spring(capsuleX, {
        toValue: activeLayout.x,
        useNativeDriver: false,
        friction: 18,
        tension: 50,
      }),
      Animated.spring(capsuleW, {
        toValue: activeLayout.width,
        useNativeDriver: false,
        friction: 18,
        tension: 50,
      }),
    ]).start();
  }, [activeLayout, capsuleX, capsuleW]);

  const handleLayout = (key) => (e) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const existing = prev[key];
      if (existing && existing.x === x && existing.width === width) return prev;
      return { ...prev, [key]: { x, width } };
    });
  };

  const items = (
    <>
      {/* Sliding capsule behind the active item */}
      {activeLayout && (
        <Animated.View
          pointerEvents="none"
          style={[styles.capsule, { left: capsuleX, width: capsuleW }]}
        />
      )}

      {filters.map((filter) => {
        const isActive = filter.key === activeKey;
        // icon-selective: always show icon; show label only when active.
        // text: always show label, never an icon.
        const showIcon = variant === 'icon-selective' && !!filter.icon;
        const showLabel = variant === 'text' || isActive;
        return (
          <TouchableOpacity
            key={filter.key}
            style={styles.item}
            onLayout={handleLayout(filter.key)}
            onPress={() => onChange(filter.key)}
            activeOpacity={0.8}
          >
            {showIcon && (
              <Ionicons
                name={filter.icon}
                size={16}
                color={isActive ? COLORS.accent : COLORS.textPrimary}
              />
            )}
            {showLabel && (
              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {filter.label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </>
  );

  // "pills" variant: each filter is its own separate rounded pill (icon +
  // label always visible). Horizontally scrollable so any number of pills fit;
  // the row centers itself when the pills don't overflow.
  if (variant === 'pills') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillsScrollContent}
        style={styles.pillsScroll}
      >
        {filters.map((filter) => {
          const isActive = filter.key === activeKey;
          return (
            <TouchableOpacity
              key={filter.key}
              style={[styles.pill, isActive ? styles.pillActive : styles.pillInactive]}
              onPress={() => onChange(filter.key)}
              activeOpacity={0.8}
            >
              {!!filter.icon && (
                <Ionicons
                  name={filter.icon}
                  size={18}
                  color={isActive ? COLORS.accent : COLORS.textPrimary}
                />
              )}
              <Text
                style={[styles.pillLabel, isActive && styles.pillLabelActive]}
                numberOfLines={1}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  // Embedded: no glass chrome — just the row + capsule, for use inside a
  // parent panel (e.g. a combined header). The capsule x is relative to
  // this row, so the parent must not add left padding between here and the row.
  if (embedded) {
    return <View style={styles.embeddedRow}>{items}</View>;
  }

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <BlurView intensity={40} tint="light" style={styles.bar}>
        {items}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Container that positions the floating glass bar (mirrors GlassTabBar).
  wrapper: {
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
  },
  // Row used when embedded inside another panel (no glass chrome).
  embeddedRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: 40,
  },
  // Rounded floating liquid glass bar, highly transparent.
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: SIZES.spacing_xs,
    paddingHorizontal: SIZES.spacing_xs,
    borderRadius: SIZES.radius_full,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  // The moving highlight pill behind the active item.
  capsule: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(232, 93, 4, 0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(232, 93, 4, 0.55)',
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_sm,
  },
  label: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  labelActive: {
    color: COLORS.accent,
    fontFamily: 'Poppins_600SemiBold',
  },

  // "pills" variant — separate rounded pills (Airbnb-style), horizontally
  // scrollable. The content centers when it fits and scrolls when it overflows.
  pillsScroll: {
    alignSelf: 'stretch',
    flexGrow: 0,
  },
  pillsScrollContent: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
  },
  // Inactive: raised white pill with a soft shadow.
  pillInactive: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  // Active: pressed/inset look — flat grey, no shadow, subtle inner border.
  pillActive: {
    backgroundColor: '#ececec',
    borderWidth: 1,
    borderColor: '#dcdcdc',
  },
  pillLabel: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  pillLabelActive: {
    color: COLORS.accent,
    fontFamily: 'Poppins_600SemiBold',
  },
});
