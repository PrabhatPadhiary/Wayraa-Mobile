import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { getUnreadNotificationCount } from '../services/inboxService';

/**
 * Unread count for the bell on Home. Refreshed when the screen comes into
 * view (e.g. back from the notifications list), when the app returns from
 * the background, and when a push arrives while the app is open.
 * 0 while `enabled` is false (signed out).
 */
export default function useUnreadNotifications(enabled) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    getUnreadNotificationCount().then(setCount);
  }, [enabled]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    if (!enabled) return undefined;
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    // A push while the app is open: it's in the bell too (saved just before).
    const received = Platform.OS === 'web'
      ? null
      : Notifications.addNotificationReceivedListener((n) => {
        if (n?.request?.content?.data?.type !== 'reminder') refresh();
      });
    return () => {
      appState.remove();
      received?.remove();
    };
  }, [enabled, refresh]);

  return count;
}
