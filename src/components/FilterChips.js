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
 * @param {boolean} [compact] - "pills" only: force tight sizing (defaults to
 *   true when there are more than 3 filters)
 * @param {boolean} [fullWidth] - "pills" only: stretch the bar to the full
 *   width of its parent, with equal-width segments
 * @param {boolean} [tinted] - "pills" + fullWidth only: warm orange track
 *   (default) instead of the standard grey one
 */
export default function FilterChips({
  filters,
  activeKey,
  onChange,
  variant = 'text',
  embedded = false,
  compact: compactProp,
  fullWidth = false,
  tinted = true,
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

  // "pills" variant: a connected SEGMENTED CONTROL — one rounded container
  // holding all segments, the active one filled solid accent. This reads as a
  // single primary-navigation bar, visually distinct from the loose secondary
  // filter chips elsewhere.
  if (variant === 'pills') {
    // More than 3 tabs (My Trips, Favorites) use tighter sizing so they fit.
    const compact = compactProp ?? filters.length > 3;
    if (fullWidth) {
      return (
        <View style={[styles.segment, styles.segmentFull, tinted && styles.segmentTinted]}>
          {activeLayout && (
            <Animated.View
              pointerEvents="none"
              style={[styles.segmentCapsule, { left: capsuleX, width: capsuleW }]}
            />
          )}
          {filters.map((filter) => {
            const isActive = filter.key === activeKey;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.segmentItem, styles.segmentItemFull, compact && styles.segmentItemFullCompact]}
                onLayout={handleLayout(filter.key)}
                onPress={() => onChange(filter.key)}
                activeOpacity={0.8}
              >
                {/* With 4+ tabs only the selected one shows its icon, so long
                    labels like "Activities" aren't squeezed. */}
                {!!filter.icon && (!compact || isActive) && (
                  <Ionicons
                    name={filter.icon}
                    size={15}
                    color={isActive ? COLORS.white : COLORS.accent}
                  />
                )}
                <Text
                  style={[
                    styles.segmentLabel,
                    styles.segmentLabelFull,
                    compact && styles.segmentLabelFullCompact,
                    isActive && styles.segmentLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }

    return (
      // Horizontal scroller as a safety net: centers the control when it fits
      // and scrolls instead of overflowing on narrow screens.
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.segmentScroll}
        contentContainerStyle={styles.segmentScrollContent}
      >
        <View style={styles.segment}>
          {/* Single sliding orange capsule behind the active segment. Uses the
              shared capsuleX/capsuleW springs so it glides between tabs. */}
          {activeLayout && (
            <Animated.View
              pointerEvents="none"
              style={[styles.segmentCapsule, { left: capsuleX, width: capsuleW }]}
            />
          )}
          {filters.map((filter) => {
            const isActive = filter.key === activeKey;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.segmentItem, compact && styles.segmentItemCompact]}
                onLayout={handleLayout(filter.key)}
                onPress={() => onChange(filter.key)}
                activeOpacity={0.8}
              >
                {/* In compact rows only the active tab shows its icon, which
                    keeps 4+ tabs from being squeezed. */}
                {!!filter.icon && (!compact || isActive) && (
                  <Ionicons
                    name={filter.icon}
                    size={compact ? 16 : 18}
                    color={isActive ? COLORS.white : COLORS.textSecondary}
                  />
                )}
                <Text
                  style={[
                    styles.segmentLabel,
                    compact && styles.segmentLabelCompact,
                    isActive && styles.segmentLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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

  // "pills" variant — a connected SEGMENTED CONTROL. One rounded track holds
  // all segments; the active segment is a solid accent fill. The single track
  // with a tinted background makes this read as one primary-nav bar, clearly
  // different from the loose, separate secondary filter chips.
  segmentScroll: {
    alignSelf: 'stretch',
    flexGrow: 0,
  },
  // flexGrow + center keeps the control centered when it fits.
  segmentScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: SIZES.spacing_sm,
  },
  segment: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: COLORS.cardBackground,
    borderRadius: SIZES.radius_full,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  // Sliding orange fill behind the active segment. Absolutely positioned
  // inside the track (top/bottom:4 clears the track's 4px padding) and driven
  // by the shared capsuleX/capsuleW springs so it glides between tabs.
  segmentCapsule: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 3,
  },
  segmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_lg,
    borderRadius: SIZES.radius_full,
    // Sit above the sliding capsule so labels/icons stay visible.
    zIndex: 1,
  },
  // Full-width bar: track stretches, segments share the width equally.
  segmentFull: {
    alignSelf: 'stretch',
  },
  segmentTinted: {
    backgroundColor: '#fff1e8',
    borderColor: '#ffd9c2',
  },
  segmentLabelFull: {
    fontSize: 14,
  },
  segmentItemFull: {
    flex: 1,
    paddingHorizontal: 4,
    gap: 4,
  },
  // 4+ tabs: each tab sizes to its label (then shares the spare room), so
  // a long label gets the space it needs.
  segmentItemFullCompact: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    paddingHorizontal: 10,
  },
  segmentLabelFullCompact: {
    fontSize: 13,
  },
  // Tighter segment for rows with more than 3 tabs.
  segmentItemCompact: {
    gap: 5,
    paddingHorizontal: 14,
  },
  segmentLabel: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  segmentLabelCompact: {
    fontSize: 15,
  },
  segmentLabelActive: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
  },
});
