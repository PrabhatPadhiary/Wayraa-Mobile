import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { markSeenOnAccount } from '../services/seenService';

const KEY = (uid) => `wayraa.rankSeen.${uid}`;
let showing = false; // one celebration at a time, across screens

/**
 * A new rank to celebrate, once ever. What's been celebrated is kept with
 * your account (`profile.celebratedRank`, from GET /api/users/me), so a
 * reinstall or a new phone doesn't repeat it; this phone also remembers, in
 * case the account can't be told straight away. Only a rank higher than
 * both is celebrated (the first time ever, anything above Wanderer).
 * Dropping a rank (say, a story was deleted) celebrates nothing.
 *
 * @param {object|null} profile  GET /api/users/me (with `rank` and `celebratedRank`)
 * @param {string|null} uid      the signed-in account
 * @returns {[number|null, () => void]}  [level to celebrate, dismiss]
 */
export default function useRankUp(profile, uid) {
  const [level, setLevel] = useState(null);
  const current = profile?.rank?.level;
  const onAccount = Number.isFinite(profile?.celebratedRank) ? profile.celebratedRank : null;

  useEffect(() => {
    if (current == null || !uid) return;
    (async () => {
      let here = null;
      try {
        const raw = await AsyncStorage.getItem(KEY(uid));
        here = raw == null ? null : Number(raw);
      } catch {
        return; // can't remember what was shown: better not to repeat it
      }
      // The highest rank already celebrated, by the account or this phone.
      const known = [here, onAccount].filter((n) => Number.isFinite(n));
      const celebrated = known.length ? Math.max(...known) : null;
      // This phone knew of a higher one than the account: tell the account.
      if (Number.isFinite(here) && (onAccount == null || here > onAccount) && here > 0) {
        markSeenOnAccount({ celebratedRank: here });
      }
      const celebrate = current > 0 && (celebrated == null || current > celebrated);
      if (!celebrate) {
        if (here !== current && (celebrated == null || current >= celebrated)) {
          AsyncStorage.setItem(KEY(uid), String(current)).catch(() => {});
        }
        return;
      }
      // Remember first, so it never shows twice (even if the app closes now).
      try { await AsyncStorage.setItem(KEY(uid), String(current)); } catch { return; }
      markSeenOnAccount({ celebratedRank: current });
      if (!showing) {
        showing = true;
        setLevel(current);
      }
    })();
  }, [current, onAccount, uid]);

  const dismiss = useCallback(() => {
    showing = false;
    setLevel(null);
  }, []);

  return [level, dismiss];
}
