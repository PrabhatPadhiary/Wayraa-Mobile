import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsOffline } from '../hooks/useNetwork';
import useFloatingBarBottom from '../hooks/useFloatingBarBottom';
import { COLORS } from '../constants/theme';

/**
 * "You're offline" pill when the internet goes away.
 *
 * Sits near the bottom, just above the floating tab bar, so it never covers a
 * header's buttons; touches pass through it. It stays for as long as you're
 * offline and goes when the connection is back. The words fit everyone,
 * signed in or not (guests also see saved copies, e.g. Home).
 */

const TAB_BAR_HEIGHT = 64;

export default function OfflineBanner() {
  const offline = useIsOffline();
  const barBottom = useFloatingBarBottom();
  const anim = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false); // showing now
  const [mounted, setMounted] = useState(false); // in the tree (incl. fading out)

  // Shown while offline; hidden when the connection is back.
  useEffect(() => { setVisible(offline); }, [offline]);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => { if (finished && !visible) setMounted(false); });
  }, [visible, anim]);

  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        {
          bottom: barBottom + TAB_BAR_HEIGHT + 12,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      <View style={styles.pill}>
        <Ionicons name="cloud-offline-outline" size={15} color={COLORS.white} />
        <Text style={styles.text} maxFontSizeMultiplier={1.3}>You're offline · showing what's saved</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(28, 40, 51, 0.92)',
  },
  text: {
    color: COLORS.white,
    fontSize: 12.5,
    fontFamily: 'Poppins_500Medium',
  },
});
