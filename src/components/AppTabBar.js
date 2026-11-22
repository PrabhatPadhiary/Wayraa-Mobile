import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import useFloatingBarBottom from '../hooks/useFloatingBarBottom';
import { COLORS, SIZES, MAIN_TABS } from '../constants';
import GlassSurface from './GlassSurface';
import { useBlurTarget } from '../context/BlurTargetContext';
import { useBottomBar } from '../context/BottomBarContext';
import { GlassView } from 'expo-glass-effect';
import { GestureDetector } from 'react-native-gesture-handler';
import usePillDrag, { tick } from '../hooks/usePillDrag';
import { useGlassMode } from '../utils/glass';

/**
 * The sliding pill behind the selected tab. While you drag it (usePillDrag)
 * it lifts a little, and on iOS 26 becomes a Liquid Glass lens.
 */
function DragCapsule({ x, width, dragAnim, dragging, liquid }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.capsule,
        {
          left: x,
          width,
          transform: [{ scale: dragAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
        },
      ]}
    >
      {liquid && (
        <GlassView
          style={[StyleSheet.absoluteFill, styles.capsuleGlass]}
          glassEffectStyle={{ style: dragging ? 'clear' : 'none', animate: true, animationDuration: 0.2 }}
          colorScheme="light"
        />
      )}
    </Animated.View>
  );
}

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
/**
 * Section tabs (trip screen) drawn inside the main glass pill in place of the
 * app tabs, with their own sliding capsule.
 */
function SectionTabs({ tabs, width }) {
  const [layouts, setLayouts] = useState({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const active = layouts[tabs.activeKey];

  useEffect(() => {
    if (!active) return;
    if (!placed.current) {
      x.setValue(active.x);
      w.setValue(active.width);
      placed.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(x, { toValue: active.x, useNativeDriver: false, friction: 18, tension: 60 }),
      Animated.spring(w, { toValue: active.width, useNativeDriver: false, friction: 18, tension: 60 }),
    ]).start();
  }, [active, x, w]);

  // Drag the pill between the trip's sections.
  const liquid = useGlassMode() === 'liquid';
  const { gesture: pillGesture, dragKey, dragAnim } = usePillDrag({
    x,
    width: w,
    layouts,
    keys: tabs.items.map((t) => t.key),
    activeKey: tabs.activeKey,
    onSelect: tabs.onChange,
  });

  return (
    <GestureDetector gesture={pillGesture}>
    <View style={[styles.fullTabsRow, { width }]} collapsable={false}>
      {active && <DragCapsule x={x} width={w} dragAnim={dragAnim} dragging={!!dragKey} liquid={liquid} />}
      {tabs.items.map((tab) => {
        const isActive = tab.key === (dragKey ?? tabs.activeKey);
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.item}
            onLayout={(e) => {
              const { x: lx, width } = e.nativeEvent.layout;
              setLayouts((prev) => (
                prev[tab.key]?.x === lx && prev[tab.key]?.width === width
                  ? prev
                  : { ...prev, [tab.key]: { x: lx, width } }
              ));
            }}
            onPress={() => {
              if (tab.key !== tabs.activeKey) tick();
              tabs.onChange(tab.key);
            }}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
          >
            {tab.iconFamily === 'feather' ? (
              // Line icon in both states; the active one is just orange.
              <Feather
                name={tab.icon}
                size={22}
                color={isActive ? COLORS.accent : COLORS.textPrimary}
              />
            ) : (
              <Ionicons
                name={tab.icon}
                size={22}
                color={isActive ? COLORS.accent : COLORS.textPrimary}
              />
            )}
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
    </GestureDetector>
  );
}

export default function AppTabBar({ state, navigation }) {
  const { collapsed, cta, tabs, hidden } = useBottomBar();
  // Above Android's three-button navigation bar when it's on; as before otherwise.
  const barBottom = useFloatingBarBottom();

  // Slide the whole bar down off screen while `hidden` (and back up).
  const [barHeight, setBarHeight] = useState(110);
  const hideAnim = useRef(new Animated.Value(hidden ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(hideAnim, {
      toValue: hidden ? 1 : 0,
      duration: hidden ? 260 : 320,
      easing: hidden ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hidden, hideAnim]);

  // Section tabs replace the app tabs inside the same full-width pill, with a
  // crossfade. The last tabs are kept during the fade-out after they clear.
  const lastTabs = useRef(null);
  if (tabs) lastTabs.current = tabs;
  const shownTabs = tabs || lastTabs.current;
  const tabsAnim = useRef(new Animated.Value(tabs ? 1 : 0)).current; // 1 = section tabs
  useEffect(() => {
    Animated.timing(tabsAnim, {
      toValue: tabs ? 1 : 0,
      duration: 260,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [tabs, tabsAnim]);

  const activeKey = state.routes[state.index].name;
  const activeTab = MAIN_TABS.find((t) => t.key === activeKey) || MAIN_TABS[0];

  // Android: blur the screen of the tab that's showing (see BlurTargetContext).
  const blur = useBlurTarget(activeKey);
  const glassProps = blur ? { blurTarget: blur.ref, blurKey: `${activeKey}-${blur.version}` } : {};

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

  // Drag the pill between the app's tabs (not while it's a circle or
  // showing a trip's sections).
  const liquid = useGlassMode() === 'liquid';
  const { gesture: pillGesture, dragKey, dragAnim } = usePillDrag({
    x: capsuleX,
    width: capsuleW,
    layouts,
    keys: MAIN_TABS.map((t) => t.key),
    activeKey,
    onSelect: (key) => onPressTab(key),
    enabled: !collapsed && !tabs,
  });

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
    if (!isFocused) tick();
    const route = state.routes.find((r) => r.name === key);
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(key);
    }
  };

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          paddingBottom: barBottom,
          transform: [{
            translateY: hideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, barHeight + 12] }),
          }],
        },
      ]}
      pointerEvents={hidden ? 'none' : 'box-none'}
      onLayout={(e) => {
        setRowWidth(e.nativeEvent.layout.width - SIZES.spacing_lg * 2);
        setBarHeight(e.nativeEvent.layout.height);
      }}
    >
      <View style={styles.row}>
        {/* Morphing glass pill: full tab bar -> active-tab circle. */}
        <Animated.View style={[styles.morphBar, { width: barWidth }]}>
          <GlassSurface radius={38} contentStyle={styles.morphContent} {...glassProps}>
            {/* Full tab row — fixed width so items don't reflow while shrinking. */}
            <Animated.View
              style={[
                styles.fullTabs,
                { width: rowWidth || 320, opacity: collapseAnim.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' }) },
              ]}
              pointerEvents={collapsed ? 'none' : 'box-none'}
            >
              <GestureDetector gesture={pillGesture}>
              <Animated.View
                style={[
                  styles.fullTabsRow,
                  { width: rowWidth || 320, opacity: tabsAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
                ]}
                // Takes touches itself so the drag can start anywhere on the pill.
                pointerEvents={tabs ? 'none' : 'auto'}
                collapsable={false}
              >
              {activeLayout && (
                <DragCapsule x={capsuleX} width={capsuleW} dragAnim={dragAnim} dragging={!!dragKey} liquid={liquid} />
              )}
              {MAIN_TABS.map((tab) => {
                // While dragging, the tab under the pill shows as selected.
                const isActive = tab.key === (dragKey ?? activeKey);
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={styles.item}
                    onLayout={handleLayout(tab.key)}
                    onPress={() => onPressTab(tab.key)}
                    activeOpacity={0.8}
                  >
                    {/* Filled icons on every tab, so they read clearly on glass;
                        the selected one is orange. */}
                    <Ionicons
                      name={tab.activeIcon || tab.icon}
                      size={24}
                      color={isActive ? COLORS.accent : COLORS.textPrimary}
                    />
                    <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              </Animated.View>
              </GestureDetector>

              {!!shownTabs && (
                <Animated.View
                  style={[styles.sectionLayer, { opacity: tabsAnim }]}
                  pointerEvents={tabs ? 'box-none' : 'none'}
                >
                  <SectionTabs tabs={shownTabs} width={rowWidth || 320} />
                </Animated.View>
              )}
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
              <GlassSurface radius={38} contentStyle={styles.ctaContent} interactive {...glassProps}>
                {!!cta.icon && <Ionicons name={cta.icon} size={20} color={COLORS.accent} />}
                <Text style={styles.ctaText} numberOfLines={1}>{cta.label}</Text>
              </GlassSurface>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </Animated.View>
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
  // Holder for the stacked tab rows (fixed width so nothing reflows while the pill shrinks).
  fullTabs: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 64,
  },
  capsule: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(217, 72, 28, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(217, 72, 28, 0.25)',
  },
  capsuleGlass: {
    borderRadius: SIZES.radius_full,
  },
  iconOnly: {
    ...StyleSheet.absoluteFill,
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
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  labelActive: {
    color: COLORS.accentDeep,
    fontFamily: 'Poppins_600SemiBold',
  },
  // One row of tabs (app tabs or section tabs), stacked for the crossfade.
  fullTabsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 64,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_sm,
  },
  sectionLayer: {
    ...StyleSheet.absoluteFill,
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
    color: COLORS.accentDeep,
  },
});
