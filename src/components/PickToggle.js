import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/**
 * Add / added toggle shown on a card while picking places for a trip.
 * Added state is a green gradient badge with a white ring and tick that pops in.
 */
export default function PickToggle({ picked, pending, onPress, label }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevPicked = useRef(picked);

  useEffect(() => {
    if (picked && !prevPicked.current) {
      scale.setValue(0.6);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
    }
    prevPicked.current = picked;
  }, [picked, scale]);

  return (
    <TouchableOpacity
      style={styles.pickToggle}
      onPress={onPress}
      disabled={pending}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: picked }}
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Animated.View style={[styles.pickToggleInner, { transform: [{ scale }] }]}>
        {picked ? (
          <LinearGradient
            colors={['#2a9157', '#126b37']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.pickBadge, styles.pickBadgeAdded]}
          >
            {pending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Ionicons name="checkmark-outline" size={18} color={COLORS.white} />
            )}
          </LinearGradient>
        ) : (
          <View style={[styles.pickBadge, styles.pickBadgeIdle]}>
            {pending ? (
              <ActivityIndicator size="small" color={COLORS.textPrimary} />
            ) : (
              <Ionicons name="add" size={18} color={COLORS.textPrimary} />
            )}
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pickToggle: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    right: SIZES.spacing_sm,
  },
  pickToggleInner: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pickBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickBadgeAdded: {
    shadowColor: '#126b37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
  },
  pickBadgeIdle: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
});
