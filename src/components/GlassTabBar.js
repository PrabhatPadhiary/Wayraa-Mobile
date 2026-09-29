import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { COLORS, SIZES } from '../constants';

/**
 * The app's shared floating "liquid glass" bottom navigation bar.
 *
 * Renders whatever tab items it's given and animates a rounded capsule
 * (Apple Music style) to sit behind the active item.
 *
 * @param {Array<{ key: string, label: string, icon: string, activeIcon?: string }>} items
 * @param {string} activeKey - key of the currently active item
 * @param {(key: string) => void} onTabPress
 */
export default function GlassTabBar({ items, activeKey, onTabPress }) {
  // Measured layout (x + width) of each tab, keyed by tab key.
  const [layouts, setLayouts] = useState({});
  const capsuleX = useRef(new Animated.Value(0)).current;
  const capsuleW = useRef(new Animated.Value(0)).current;
  // Whether the capsule has been placed at least once. The first placement
  // snaps instantly (so it doesn't float in from the left edge on mount);
  // every move after that animates.
  const hasPlaced = useRef(false);

  const activeLayout = layouts[activeKey];

  // Position the capsule on the active tab. Snap on first placement,
  // spring smoothly for later tab changes.
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

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <BlurView intensity={40} tint="light" style={styles.bar}>
        {/* Sliding capsule behind the active tab */}
        {activeLayout && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.capsule,
              { left: capsuleX, width: capsuleW },
            ]}
          />
        )}

        {items.map((item) => {
          const isActive = item.key === activeKey;
          const iconName = isActive ? (item.activeIcon || item.icon) : item.icon;
          return (
            <TouchableOpacity
              key={item.key}
              style={styles.item}
              onLayout={handleLayout(item.key)}
              onPress={() => onTabPress(item.key)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={iconName}
                size={22}
                color={isActive ? COLORS.accent : COLORS.textPrimary}
              />
              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Floating container that positions the glass bar above content.
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: Platform.OS === 'ios' ? 28 : SIZES.spacing_lg,
  },
  // Rounded floating liquid glass bar, highly transparent.
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_sm,
    borderRadius: SIZES.radius_full,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  // The moving highlight pill behind the active item.
  capsule: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    bottom: SIZES.spacing_sm,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(232, 93, 4, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 4, 0.25)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 8,
  },
  label: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  labelActive: {
    color: COLORS.accent,
    fontFamily: 'Poppins_600SemiBold',
  },
});
