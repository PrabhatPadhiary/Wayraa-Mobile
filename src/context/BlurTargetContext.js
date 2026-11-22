import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Android's real blur (expo-blur) blurs a BlurTargetView: the content behind
 * the glass, which must sit beside the glass, not around it. Each tab's
 * screens are wrapped in one (MainTabs), registered here by tab name, and the
 * floating bottom bar blurs the target of the tab that's showing.
 *
 * `version` changes whenever a target appears or goes, so glass that mounted
 * before its target can pick it up (see GlassSurface's blurKey).
 * On iPhone this is harmless: BlurTargetView is a plain View there.
 */
const BlurTargetContext = createContext(null);

export function BlurTargetProvider({ children }) {
  const refs = useRef({}); // name -> { current: View | null }
  const [version, setVersion] = useState(0);

  const refFor = useCallback((name) => {
    if (!refs.current[name]) refs.current[name] = { current: null };
    return refs.current[name];
  }, []);

  // Callback ref for a target: keeps the ref object and tells the glass.
  const registerFns = useRef({});
  const register = useCallback((name) => {
    if (!registerFns.current[name]) {
      registerFns.current[name] = (node) => {
        const ref = refFor(name);
        if (ref.current === node) return;
        ref.current = node;
        setVersion((v) => v + 1);
      };
    }
    return registerFns.current[name];
  }, [refFor]);

  const value = useMemo(() => ({ refFor, register, version }), [refFor, register, version]);
  return <BlurTargetContext.Provider value={value}>{children}</BlurTargetContext.Provider>;
}

/** Callback ref for the BlurTargetView of `name` (a tab). */
export function useRegisterBlurTarget(name) {
  return useContext(BlurTargetContext)?.register(name);
}

/** { ref, version } of the target named `name`, or null outside the provider. */
export function useBlurTarget(name) {
  const ctx = useContext(BlurTargetContext);
  if (!ctx || !name) return null;
  return { ref: ctx.refFor(name), version: ctx.version };
}
