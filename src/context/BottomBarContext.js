import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

/**
 * BottomBarContext — shared state for the single persistent app tab bar.
 *
 * Screens (e.g. DestinationDetailScreen) can:
 *   - toggle `collapsed` as the user scrolls, so the tab bar animates from a
 *     full bar into a Home-only circle;
 *   - register a `cta` ({ label, icon, onPress }) that appears beside the
 *     circle when collapsed;
 *   - register `tabs` (the trip screen's section tabs) that appear beside the
 *     circle instead. Tabs keep the bar collapsed while registered;
 *   - set `hidden` to slide the whole bar down off screen (Home hides it
 *     while you scroll down and brings it back when you scroll up);
 *   - claimBar(owner, { cta }) / releaseBar(owner): collapse with a CTA on
 *     behalf of one screen (owner = its route key). releaseBar only clears it
 *     if that screen still owns it, so a screen going into the background
 *     can't wipe the bar the next screen has just set up.
 *
 * `tabs` is owned: { owner, items: [{ key, label, icon, iconFamily? }], activeKey, onChange }.
 * `iconFamily: 'feather'` draws a Feather line icon; otherwise Ionicons
 * (filled when active, `-outline` when not).
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
  const [hidden, setHidden] = useState(false);

  // Screens call this on unmount / blur to clear their collapse + CTA.
  const owner = useRef(null);
  const reset = useCallback(() => {
    owner.current = null;
    setCollapsed(false);
    setCta(null);
    setHidden(false);
  }, []);

  const claimBar = useCallback((who, { cta: nextCta = null } = {}) => {
    owner.current = who;
    setCollapsed(true);
    setCta(nextCta);
  }, []);

  const releaseBar = useCallback((who) => {
    if (owner.current !== who) return;
    owner.current = null;
    setCollapsed(false);
    setCta(null);
  }, []);

  const clearTabs = useCallback((owner) => {
    setTabs((current) => (current && current.owner === owner ? null : current));
  }, []);

  const value = useMemo(
    () => ({ collapsed, setCollapsed, cta, setCta, tabs, setTabs, clearTabs, hidden, setHidden, reset, claimBar, releaseBar }),
    [collapsed, cta, tabs, hidden, reset, clearTabs, claimBar, releaseBar]
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
      hidden: false,
      setHidden: () => {},
      reset: () => {},
      claimBar: () => {},
      releaseBar: () => {},
    };
  }
  return ctx;
}

export default BottomBarContext;
