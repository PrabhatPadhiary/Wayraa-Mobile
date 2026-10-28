import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, MAIN_TABS } from '../constants';
import GlassSurface from './GlassSurface';
import { useBottomBar } from '../context/BottomBarContext';

const CIRCLE = 66; // collapsed circle diameter (matches the pill outer height)

/**
 * AppTabBar — the single persistent bottom tab bar for the whole app, rendered
 * by the Tab.Navigator (so it never remounts and the capsule can slide between
 * tabs). It merges two behaviors:
 *
 *  1. Normal tab bar: a floating glass pill with a sliding capsule behind the
 *     active tab.
 *  2. Collapsible: when a screen sets `collapsed` (via BottomBarContext) — e.g.
 *     the destination detail screen on scroll — the pill's WIDTH animates down
 *     to a circle showing only the active tab's icon, and a registered CTA
 *     (`cta`) grows in beside it.
 *
 * Receives the standard React Navigation bottom-tab props (state, navigation).
 */
export default function AppTabBar({ state, navigation }) {
  const { collapsed, cta } = useBottomBar();

  const activeKey = state.routes[state.index].name;
  const activeTab = MAIN_TABS.find((t) => t.key === activeKey) || MAIN_TABS[0];

  // Capsule slide (only relevant in the expanded state).
  const [layouts, setLayouts] = useState({});
  const capsuleX = useRef(new Animated.Value(0)).current;
  const capsuleW = useRef(new Animated.Value(0)).current;
  const hasPlaced = useRef(false);
  const activeLayout = layouts[activeKey];

  useEffect(() => {
    if (!activeLayout) return;
    if (!hasPlaced.current) {
      capsuleX.setValue(activeLayout.x);
      capsuleW.setValue(activeLayout.width);
      hasPlaced.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(capsuleX, { toValue: activeLayout.x, useNativeDriver: false, friction: 18, tension: 50 }),
      Animated.spring(capsuleW, { toValue: activeLayout.width, useNativeDriver: false, friction: 18, tension: 50 }),
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

  // Collapse animation (width morph). JS driver required for width/flex.
  const [rowWidth, setRowWidth] = useState(0);
  const collapseAnim = useRef(new Animated.Value(0)).current; // 0 = full, 1 = circle

  useEffect(() => {
    Animated.timing(collapseAnim, {
      toValue: collapsed ? 1 : 0,
      duration: 360,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [collapsed, collapseAnim]);

  const barWidth = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [rowWidth || 320, CIRCLE],
  });
  const ctaGap = collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [0, SIZES.spacing_sm] });

  const onPressTab = (key) => {
    const isFocused = activeKey === key;
    const route = state.routes.find((r) => r.name === key);
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(key);
    }
  };

  return (
    <View
      style={[styles.wrapper, { paddingBottom: Platform.OS === 'ios' ? 28 : SIZES.spacing_lg }]}
      pointerEvents="box-none"
      onLayout={(e) => setRowWidth(e.nativeEvent.layout.width - SIZES.spacing_lg * 2)}
    >
      <View style={styles.row}>
        {/* Morphing glass pill: full tab bar -> active-tab circle. */}
        <Animated.View style={[styles.morphBar, { width: barWidth }]}>
          <GlassSurface radius={38} contentStyle={styles.morphContent}>
            {/* Full tab row — fixed width so items don't reflow while shrinking. */}
            <Animated.View
              style={[
                styles.fullTabs,
                { width: rowWidth || 320, opacity: collapseAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' }) },
              ]}
              pointerEvents={collapsed ? 'none' : 'box-none'}
            >
              {activeLayout && (
                <Animated.View pointerEvents="none" style={[styles.capsule, { left: capsuleX, width: capsuleW }]} />
              )}
              {MAIN_TABS.map((tab) => {
                const isActive = tab.key === activeKey;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={styles.item}
                    onLayout={handleLayout(tab.key)}
                    onPress={() => onPressTab(tab.key)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isActive ? (tab.activeIcon || tab.icon) : tab.icon}
                      size={22}
                      color={isActive ? COLORS.accent : COLORS.textPrimary}
                    />
                    <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>

            {/* Collapsed: active-tab icon only, centered, fades in. */}
            <Animated.View
              style={[styles.iconOnly, { opacity: collapseAnim.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' }) }]}
              pointerEvents={collapsed ? 'box-none' : 'none'}
            >
              <TouchableOpacity
                style={styles.iconOnlyBtn}
                onPress={() => onPressTab(activeKey)}
                activeOpacity={0.8}
                accessibilityLabel={activeTab.label}
              >
                <Ionicons name={activeTab.activeIcon || activeTab.icon} size={26} color={COLORS.accent} />
              </TouchableOpacity>
            </Animated.View>
          </GlassSurface>
        </Animated.View>

        {/* CTA grows in beside the collapsed pill (glass, to match). */}
        {cta && (
          <Animated.View style={{ flex: collapseAnim, opacity: collapseAnim, marginLeft: ctaGap, overflow: 'hidden' }}>
            <TouchableOpacity onPress={cta.onPress} activeOpacity={0.85}>
              <GlassSurface radius={38} contentStyle={styles.ctaContent}>
                {!!cta.icon && <Ionicons name={cta.icon} size={20} color={COLORS.accent} />}
                <Text style={styles.ctaText} numberOfLines={1}>{cta.label}</Text>
              </GlassSurface>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIZES.spacing_lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
  },
  morphBar: {
    height: 64,
  },
  morphContent: {
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fullTabs: {
    position: 'absolute',
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_sm,
  },
  capsule: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(232, 93, 4, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 4, 0.25)',
  },
  iconOnly: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOnlyBtn: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
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
  ctaContent: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
  },
  ctaText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accent,
  },
});
