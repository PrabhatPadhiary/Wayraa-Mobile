import React, { useEffect, useRef, useState } from 'react';
import { Animated, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

/**
 * The pull-to-refresh spinner on iPhone, where you can see it.
 *
 * iOS draws RefreshControl's spinner just above the list's content: behind
 * our floating headers (iOS ignores progressViewOffset), or under the notch
 * on screens that start at the very top. So while a refresh runs, this shows
 * a small round spinner just below the header instead. Android's own spinner
 * already sits below the header (progressViewOffset), so this shows nothing
 * there.
 *
 *   <RefreshSpinner refreshing={refreshing} top={headerHeight} />
 *
 * Put it after the list (and before or after the header: it sits on top).
 */
export default function RefreshSpinner({ refreshing, top = 0 }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (refreshing) setMounted(true);
    Animated.timing(opacity, {
      toValue: refreshing ? 1 : 0,
      duration: refreshing ? 150 : 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !refreshing) setMounted(false);
    });
  }, [refreshing, opacity]);

  if (Platform.OS !== 'ios' || !mounted) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          top: top + 10,
          opacity,
          transform: [{ scale: opacity.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
        },
      ]}
      accessibilityLabel="Refreshing"
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="small" color={COLORS.accent} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: '50%',
    marginLeft: -18,
    zIndex: 30,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    shadowColor: '#2B3F51',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
});
