import { useEffect, useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { usePanGesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

/** A light tick, like iOS's own pickers (not on the web). */
export function tick() {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
}

/**
 * Drag a sliding selection pill along a row of options: press on the pill
 * and slide. It follows your finger (kept inside the row), the option under
 * it is reported as `dragKey` (with a tick each time it changes), and letting
 * go springs it onto that option and calls `onSelect(key)`. Taps on the
 * options keep working: only a sideways drag that began on the pill counts.
 *
 * Built on react-native-gesture-handler (like the itinerary's drag), which
 * handles touches natively, so the drag reliably wins over the taps.
 *
 *   const { gesture, dragKey, dragAnim } = usePillDrag({...});
 *   <GestureDetector gesture={gesture}><View>{row}</View></GestureDetector>
 *
 * Used by the filter pills (FilterChips) and the bottom bar (AppTabBar).
 *
 * @param {object} p
 * @param {Animated.Value} p.x       the pill's left (also driven by the caller's springs)
 * @param {Animated.Value} p.width   the pill's width
 * @param {object} p.layouts         { [key]: { x, width } } of each option, in the row
 * @param {string[]} p.keys          the options, left to right
 * @param {string} p.activeKey       the selected option
 * @param {(key: string) => void} p.onSelect
 * @param {boolean} [p.enabled=true]
 */
export default function usePillDrag({ x, width, layouts, keys, activeKey, onSelect, enabled = true }) {
  const [dragKey, setDragKey] = useState(null);
  const dragAnim = useRef(new Animated.Value(0)).current;

  // Current values of the springs (Animated values can't be read directly).
  const xNow = useRef(0);
  const wNow = useRef(0);
  useEffect(() => {
    const a = x.addListener(({ value }) => { xNow.current = value; });
    const b = width.addListener(({ value }) => { wNow.current = value; });
    return () => { x.removeListener(a); width.removeListener(b); };
  }, [x, width]);

  // Latest values for the gesture callbacks.
  const live = useRef({});
  live.current = { layouts, keys, activeKey, onSelect };
  const drag = useRef({ on: false, startX: 0, hover: null });

  const optionAt = (center) => {
    const { layouts: ls, keys: ks } = live.current;
    let best = null;
    let bestDist = Infinity;
    ks.forEach((k) => {
      const l = ls[k];
      if (!l) return;
      const dist = center < l.x ? l.x - center : center > l.x + l.width ? center - (l.x + l.width) : 0;
      if (dist < bestDist) { bestDist = dist; best = k; }
    });
    return best;
  };

  const start = (e) => {
    const { layouts: ls, activeKey: current } = live.current;
    const l = ls[current];
    // Where the finger first touched, in the row (x now, minus how far it moved).
    const touchX = e.x - e.translationX;
    if (!l || touchX < l.x - 10 || touchX > l.x + l.width + 10) return; // not on the pill
    x.stopAnimation();
    width.stopAnimation();
    drag.current = { on: true, startX: xNow.current, hover: current };
    setDragKey(current);
    Animated.spring(dragAnim, { toValue: 1, useNativeDriver: false, friction: 7 }).start();
    move(e);
  };

  const move = (e) => {
    if (!drag.current.on) return;
    const { layouts: ls, keys: ks } = live.current;
    const first = ls[ks[0]];
    const last = ls[ks[ks.length - 1]];
    if (!first || !last) return;
    const w = wNow.current;
    const nx = Math.max(first.x, Math.min(last.x + last.width - w, drag.current.startX + e.translationX));
    x.setValue(nx);
    const over = optionAt(nx + w / 2);
    if (over && over !== drag.current.hover) {
      drag.current.hover = over;
      setDragKey(over);
      tick();
      Animated.spring(width, { toValue: ls[over].width, useNativeDriver: false, friction: 18, tension: 80 }).start();
    }
  };

  const end = () => {
    if (!drag.current.on) return;
    const { layouts: ls, activeKey: current, onSelect: select } = live.current;
    const target = drag.current.hover || current;
    drag.current = { on: false, startX: 0, hover: null };
    const l = ls[target];
    if (l) {
      Animated.parallel([
        Animated.spring(x, { toValue: l.x, useNativeDriver: false, friction: 18, tension: 60 }),
        Animated.spring(width, { toValue: l.width, useNativeDriver: false, friction: 18, tension: 60 }),
      ]).start();
    }
    Animated.spring(dragAnim, { toValue: 0, useNativeDriver: false, friction: 9 }).start();
    setDragKey(null);
    if (target && target !== current) select(target);
  };

  const gesture = usePanGesture({
    runOnJS: true,
    enabled,
    // Sideways only: a vertical move lets the page scroll instead.
    activeOffsetX: [-8, 8],
    failOffsetY: [-14, 14],
    onActivate: (e) => start(e),
    onUpdate: (e) => move(e),
    onDeactivate: () => end(),
    onFinalize: () => end(),
  });

  return { gesture, dragKey, dragAnim };
}
