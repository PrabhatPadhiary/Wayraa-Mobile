import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomBar } from '../context/BottomBarContext';

const SCROLL_SLOP = 12;   // ignore jitters smaller than this
const TOP_ZONE = 80;      // always show the bar this close to the top

/**
 * The tab bar slides away while you scroll down and comes back as soon as you
 * scroll up (or near the top), like Home. Returns an onScroll handler (stable,
 * so memoised lists don't re-render) to pass to a ScrollView / FlatList, along
 * with scrollEventThrottle={16}. The bar always comes back when the screen
 * loses focus.
 *
 *   const onBarScroll = useHideTabBarOnScroll();
 *   <FlatList onScroll={onBarScroll} scrollEventThrottle={16} … />
 *
 * `resetKey`: when it changes (e.g. the screen switches section), the bar comes back.
 */
export default function useHideTabBarOnScroll(resetKey) {
  const { setHidden } = useBottomBar();
  const hiddenRef = useRef(false);
  const lastY = useRef(0);

  const setOnce = useCallback((hide) => {
    if (hiddenRef.current === hide) return;
    hiddenRef.current = hide;
    setHidden(hide);
  }, [setHidden]);

  // A new section starts with the bar showing.
  useEffect(() => { lastY.current = 0; setOnce(false); }, [resetKey, setOnce]);

  // Bring it back when leaving the screen (and reset for next time).
  useFocusEffect(useCallback(() => () => { lastY.current = 0; setOnce(false); }, [setOnce]));

  return useCallback((e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    // Ignore the bounce past the bottom edge (it reads as scrolling up).
    if (y > contentSize.height - layoutMeasurement.height) return;
    const dy = y - lastY.current;
    if (y < TOP_ZONE) {
      setOnce(false);
      lastY.current = y;
    } else if (Math.abs(dy) > SCROLL_SLOP) {
      setOnce(dy > 0);
      lastY.current = y;
    }
  }, [setOnce]);
}
