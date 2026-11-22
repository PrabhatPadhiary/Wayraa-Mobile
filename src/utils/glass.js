import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect';

/**
 * Which glass this phone gets:
 *
 *  - 'liquid'  iPhone on iOS 26+: Apple's own Liquid Glass (expo-glass-effect).
 *  - 'blur'    older iPhones, and Android 12+: a real blur of what's behind
 *              (expo-blur), with our frost and sheen on top.
 *  - 'frost'   Android 11 and older: no blur (too slow there), a dense frost.
 *
 * "Reduce transparency" (iPhone accessibility) turns Liquid Glass off, as
 * Apple asks, so those users get the blur instead.
 */

// Both checks, as the expo-glass-effect docs advise: some iOS 26 betas
// report Liquid Glass but lack the API and crash.
function liquidGlassSupported() {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

const LIQUID_SUPPORTED = liquidGlassSupported();
/** Android 12+: real blur (older Android gets a dense frost instead). */
export const ANDROID_BLUR = Platform.OS === 'android' && Platform.Version >= 31;

/** Android blur method: a real blur on 12+, nothing on older (matches ANDROID_BLUR). */
export const ANDROID_BLUR_METHOD = 'dimezisBlurViewSdk31Plus';

export function useGlassMode() {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    if (!LIQUID_SUPPORTED) return undefined;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((on) => { if (mounted) setReduceTransparency(!!on); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (on) => setReduceTransparency(!!on));
    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  if (LIQUID_SUPPORTED && !reduceTransparency) return 'liquid';
  if (Platform.OS === 'android') return ANDROID_BLUR ? 'blur' : 'frost';
  return 'blur';
}
