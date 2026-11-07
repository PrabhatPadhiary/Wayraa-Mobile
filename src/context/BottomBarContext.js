import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * BottomBarContext — shared state for the single persistent app tab bar.
 *
 * Screens (e.g. DestinationDetailScreen) can:
 *   - toggle `collapsed` as the user scrolls, so the tab bar animates from a
 *     full bar into a Home-only circle;
 *   - register a `cta` ({ label, icon, onPress }) that appears beside the
 *     circle when collapsed;
 *   - register `tabs` (the trip screen's section tabs) that appear beside the
 *     circle instead. Tabs keep the bar collapsed while registered.
 *
 * `tabs` is owned: { owner, items: [{ key, label, icon }], activeKey, onChange }.
 * `clearTabs(owner)` only clears tabs registered by that owner, so a screen
 * that is leaving can't wipe tabs the next screen has already registered.
 *
 * When no screen registers anything, the tab bar just renders normally.
 */
const BottomBarContext = createContext(null);

export function BottomBarProvider({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [cta, setCta] = useState(null); // { label, icon, onPress } | null
  const [tabs, setTabs] = useState(null);

  // Screens call this on unmount / blur to clear their collapse + CTA.
  const reset = useCallback(() => {
    setCollapsed(false);
    setCta(null);
  }, []);

  const clearTabs = useCallback((owner) => {
    setTabs((current) => (current && current.owner === owner ? null : current));
  }, []);

  const value = useMemo(
    () => ({ collapsed, setCollapsed, cta, setCta, tabs, setTabs, clearTabs, reset }),
    [collapsed, cta, tabs, reset, clearTabs]
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
      tabs: null,
      setTabs: () => {},
      clearTabs: () => {},
      reset: () => {},
    };
  }
  return ctx;
}

export default BottomBarContext;
