import React, { useRef } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

/** How long to hold before an item lifts (ms). */
export const LIFT_DELAY = 280;

/**
 * Makes its child draggable after a long press. The drag itself is drawn by
 * the itinerary's overlay (a "ghost" that follows the finger); this only
 * reports where the finger is, in window coordinates.
 *
 * A quick tap still reaches the child (e.g. to expand an item), and a swipe
 * before the long press still scrolls the list.
 *
 * @param {object} payload       what is being dragged (passed back as is)
 * @param {boolean} enabled
 * @param {(payload, x, y) => void} onStart
 * @param {(x, y) => void} onMove
 * @param {(x, y, canceled) => void} onEnd
 */
export function DragSource({ payload, enabled = true, onStart, onMove, onEnd, children, style }) {
  // Latest callbacks/payload without rebuilding the gesture on every render.
  const ref = useRef({});
  ref.current = { payload, onStart, onMove, onEnd };

  const pan = usePanGesture({
    runOnJS: true,
    enabled,
    activateAfterLongPress: LIFT_DELAY,
    onActivate: (e) => ref.current.onStart?.(ref.current.payload, e.absoluteX, e.absoluteY),
    onUpdate: (e) => ref.current.onMove?.(e.absoluteX, e.absoluteY),
    onDeactivate: (e) => ref.current.onEnd?.(e.absoluteX, e.absoluteY, e.canceled),
  });

  return (
    <GestureDetector gesture={pan}>
      <View style={style} collapsable={false}>{children}</View>
    </GestureDetector>
  );
}

/**
 * Drop targets measured in window coordinates when a drag starts.
 * Keys: "dock-bin", "item:<id>", "hour:<slot>:<hour>", "slot:<slot>".
 */
export function createZones() {
  const rects = new Map();
  const refs = new Map();
  const callbacks = new Map(); // one stable ref callback per key
  return {
    /** ref callback for a View that is a drop target */
    register(key) {
      if (!callbacks.has(key)) {
        callbacks.set(key, (node) => {
          if (node) refs.set(key, node);
          else { refs.delete(key); rects.delete(key); }
        });
      }
      return callbacks.get(key);
    },
    /** measure every registered target (call when a drag starts) */
    measureAll() {
      rects.clear();
      refs.forEach((node, key) => {
        node?.measureInWindow?.((x, y, w, h) => {
          if (w || h) rects.set(key, { x, y, w, h });
        });
      });
    },
    /** A measured target's rect (window coordinates), if any. */
    rect(key) {
      return rects.get(key) || null;
    },
    measure(key) {
      refs.get(key)?.measureInWindow?.((x, y, w, h) => {
        if (w || h) rects.set(key, { x, y, w, h });
      });
    },
    /**
     * The target under (x, y): the remove bar first, then an item (with
     * whether the finger is on its lower half), then an hour row, then a
     * part of the day.
     * @returns {{ key: string, after?: boolean } | null}
     */
    hit(x, y) {
      const inside = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
      // Hours and cards inside the scrolling timeline only count where the
      // timeline is visible (rows scrolled out of it still have positions).
      const clip = rects.get('timeline');
      const visible = !clip || inside(clip);
      let item = null;
      let hour = null;
      let slot = null;
      for (const [key, r] of rects) {
        if (!inside(r)) continue;
        if (key.startsWith('dock')) return { key };
        if (!visible) continue;
        if (key.startsWith('item:')) item = { key, after: y > r.y + r.h / 2 };
        else if (key.startsWith('hour:')) hour = { key };
        else if (key.startsWith('slot:')) slot = { key };
      }
      return item || hour || slot;
    },
  };
}
