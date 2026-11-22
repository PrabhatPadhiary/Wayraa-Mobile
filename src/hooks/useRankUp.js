import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = (uid) => `wayraa.rankSeen.${uid}`;
let showing = false; // one celebration at a time, across screens

/**
 * A new rank to celebrate, once. Remembers (per account, on this phone) the
 * last rank you were shown; when your profile says you're higher, it returns
 * that level until you dismiss it. The first time ever, any rank above
 * Wanderer is celebrated. Dropping a rank (say, a story was deleted) just
 * updates what's remembered.
 *
 * @param {object|null} profile  GET /api/users/me (with `rank`)
 * @param {string|null} uid      the signed-in account
 * @returns {[number|null, () => void]}  [level to celebrate, dismiss]
 */
export default function useRankUp(profile, uid) {
  const [level, setLevel] = useState(null);
  const current = profile?.rank?.level;

  useEffect(() => {
    if (current == null || !uid) return;
    (async () => {
      let seen = null;
      try {
        const raw = await AsyncStorage.getItem(KEY(uid));
        seen = raw == null ? null : Number(raw);
      } catch {
        return; // can't remember what was shown: better not to repeat it
      }
      if (seen === current) return;
      const celebrate = current > 0 && (seen == null || current > seen);
      // Remember first, so it never shows twice (even if the app closes now).
      try { await AsyncStorage.setItem(KEY(uid), String(current)); } catch { return; }
      if (celebrate && !showing) {
        showing = true;
        setLevel(current);
      }
    })();
  }, [current, uid]);

  const dismiss = useCallback(() => {
    showing = false;
    setLevel(null);
  }, []);

  return [level, dismiss];
}
