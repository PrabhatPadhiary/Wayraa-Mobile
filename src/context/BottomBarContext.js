import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * BottomBarContext — shared state for the single persistent app tab bar.
 *
 * Screens (e.g. DestinationDetailScreen) can:
 *   - toggle `collapsed` as the user scrolls, so the tab bar animates from a
 *     full bar into a Home-only circle;
 *   - register a `cta` ({ label, icon, onPress }) that appears beside the
 *     circle when collapsed.
 *
 * When no screen registers anything, the tab bar just renders normally.
 */
const BottomBarContext = createContext(null);

export function BottomBarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [cta, setCta] = useState(null); // { label, icon, onPress } | null

  // Screens call this on unmount / blur to clear their bar customizations.
  const reset = useCallback(() => {
    setCollapsed(false);
    setCta(null);
  }, []);

  const value = useMemo(
    () => ({ collapsed, setCollapsed, cta, setCta, reset }),
    [collapsed, cta, reset]
  );

  return <BottomBarContext.Provider value={value}>{children}</BottomBarContext.Provider>;
}

export function useBottomBar() {
  const ctx = useContext(BottomBarContext);
  if (!ctx) {
    // Safe no-op fallback so components don't crash if used outside a provider.
    return {
      collapsed: false,
      setCollapsed: () => {},
      cta: null,
      setCta: () => {},
      reset: () => {},
    };
  }
  return ctx;
}

export default BottomBarContext;
