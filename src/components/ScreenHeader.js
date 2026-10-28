import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';

/**
 * ScreenHeader - the shared floating header panel used across the main tabs
 * (My Trips, Favorites, Community, ...).
 *
 * A solid white panel pinned to the top with a centered title + subtitle,
 * rounded bottom corners and a drop shadow. Content below is expected to
 * scroll beneath it, so the panel is absolutely positioned by default.
 *
 * On scroll (driven by the `collapsed` prop) the title + subtitle gently
 * shrink away, leaving just the children (e.g. the filter capsules) visible —
 * matching the collapsing greeting on the Explore/Home screen.
 *
 * Props:
 * - title:      main heading text (required)
 * - subtitle:   secondary line below the title (optional)
 * - onLayout:   forwarded layout handler so screens can measure the header
 *               height and offset their scroll content (optional)
 * - floating:   when true (default) the panel is absolutely positioned over
 *               the content. Set false to render it inline in normal flow.
 * - collapsed:  when true, animate the title block away leaving only children.
 * - children:   optional extra content rendered under the title (e.g. a
 *               FilterChips row). Wrapped in a full-width container.
 * - style:      extra style applied to the outer panel (optional)
 */
export default function ScreenHeader({
  title,
  subtitle,
  onLayout,
  floating = true,
  collapsed = false,
  children,
  style,
}) {
  const insets = useSafeAreaInsets();

  // 0 = expanded (title shown), 1 = collapsed (title hidden).
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: collapsed ? 1 : 0,
      duration: 420,
      easing: Easing.out(Easing.cubic), // gentle, decelerating
      useNativeDriver: false, // animating height
    }).start();
  }, [collapsed, anim]);

  return (
    <View
      style={[
        styles.header,
        floating ? styles.floating : styles.inline,
        { paddingTop: insets.top + SIZES.spacing_base },
        style,
      ]}
      onLayout={onLayout}
    >
      <Animated.View
        style={{
          // Snap the opacity over a short window so the text reads as a clean
          // slide/wipe rather than lingering at partial opacity the whole way.
          opacity: anim.interpolate({
            inputRange: [0, 0.25],
            outputRange: [1, 0],
            extrapolate: 'clamp',
          }),
          maxHeight: anim.interpolate({ inputRange: [0, 1], outputRange: [64, 0] }),
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          ],
          overflow: 'hidden',
        }}
      >
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </Animated.View>

      {children ? (
        <Animated.View
          style={[
            styles.childrenWrap,
            {
              // Pull the capsules up to fill the gap as the title collapses.
              marginTop: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [SIZES.spacing_lg, 0],
              }),
            },
          ]}
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_md,
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: SIZES.radius_xl,
    borderBottomRightRadius: SIZES.radius_xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
  floating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  inline: {
    // Renders in normal document flow.
  },
  titleBlock: {
    alignItems: 'center',
  },
  title: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  childrenWrap: {
    marginHorizontal: -SIZES.spacing_lg, // let a scroll row span full width
  },
});
