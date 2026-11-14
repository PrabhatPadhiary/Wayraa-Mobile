import React, { useEffect } from 'react';
import { Animated, Easing } from 'react-native';
import { SIZES } from '../constants';

// One pulse shared by every skeleton on screen, so they all fade in sync and
// only a single animation runs no matter how many placeholders are mounted.
// The loop starts with the first mounted skeleton and stops with the last.
const pulse = new Animated.Value(1);
let mounted = 0;
let loop = null;

function startPulse() {
  mounted += 1;
  if (mounted === 1) {
    loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
  }
}

function stopPulse() {
  mounted = Math.max(0, mounted - 1);
  if (mounted === 0 && loop) {
    loop.stop();
    loop = null;
    pulse.setValue(1);
  }
}

/**
 * A pulsing placeholder block used while content loads.
 *
 * @param {number|string} width
 * @param {number|string} height
 * @param {number} [radius]
 * @param {object} [style]
 */
export default function Skeleton({ width = '100%', height = 16, radius = SIZES.radius_sm, style }) {
  useEffect(() => {
    startPulse();
    return stopPulse;
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: '#E4E8EB', opacity: pulse },
        style,
      ]}
    />
  );
}
