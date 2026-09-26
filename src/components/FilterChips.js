import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { COLORS, SIZES } from '../constants';

/**
 * Horizontal filter selector built exactly like the bottom GlassTabBar:
 * one floating glass bar with a single rounded capsule that slides to the
 * active filter.
 *
 * @param {Array<{ key, label, icon?, }>} filters
 * @param {string} activeKey
 * @param {(key: string) => void} onChange
 * @param {(filter) => number} [countFor] - optional count badge per chip
 */
export default function FilterChips({ filters, activeKey, onChange, countFor, embedded = false }) {
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
        const count = countFor ? countFor(filter) : null;
        return (
          <TouchableOpacity
            key={filter.key}
            style={styles.item}
            onLayout={handleLayout(filter.key)}
            onPress={() => onChange(filter.key)}
            activeOpacity={0.8}
          >
            {!!filter.icon && (
              <Ionicons
                name={filter.icon}
                size={16}
                color={isActive ? COLORS.accent : COLORS.textPrimary}
              />
            )}
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {filter.label}
            </Text>
            {count != null && (
              <Text style={[styles.count, isActive && styles.countActive]}>{count}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </>
  );

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
  count: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  countActive: {
    color: COLORS.accent,
  },
});
