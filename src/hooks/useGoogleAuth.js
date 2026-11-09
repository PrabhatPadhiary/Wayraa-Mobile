import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID } from '../config';
import { completeGoogleSignIn } from '../services';

// Ensures the auth browser session closes and returns control to the app.
WebBrowser.maybeCompleteAuthSession();

/**
 * Google sign-in for React Native via expo-auth-session.
 *
 * Flow: promptAsync() opens the Google consent screen in a browser -> we get a
 * Google ID token -> completeGoogleSignIn exchanges it into Firebase and then
 * the backend (/Auth/login), matching the web app.
 *
 * Works in Expo Go and in standalone/dev builds. Only the Web client ID is
 * required for the ID-token flow.
 *
 * @param {(result: { success: boolean, user?: any, error?: string }) => void} onResult
 * @returns {{ promptAsync: Function, isProcessing: boolean, isReady: boolean }}
 */
function useGoogleAuthConfigured(onResult) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  // Keep the latest callback without re-running the effect on every render.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const idToken =
        response.params?.id_token || response.authentication?.idToken;

      setIsProcessing(true);
      completeGoogleSignIn(idToken)
        .then((result) => onResultRef.current?.(result))
        .finally(() => setIsProcessing(false));
      return;
    }

    if (response.type === 'error') {
      onResultRef.current?.({
        success: false,
        error: 'Google sign-in failed. Please try again.',
      });
      return;
    }

    // 'dismiss' / 'cancel' — user backed out; stay silent.
  }, [response]);

  return {
    promptAsync,
    isProcessing,
    isReady: !!request,
  };
}

/**
 * Fallback when this platform has no Google client ID configured.
 * expo-auth-session throws during render without one, which would crash the
 * Welcome/Login screens, so instead the button reports that Google sign-in
 * isn't available here and email sign-in keeps working.
 */
function useGoogleAuthUnavailable(onResult) {
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  return {
    promptAsync: async () => {
      onResultRef.current?.({
        success: false,
        error: 'Google sign-in isn\'t available on this device yet. Please use email for now.',
      });
      return { type: 'error' };
    },
    isProcessing: false,
    isReady: true,
  };
}

// Picked once at load time (the platform never changes at runtime), so the
// same hooks always run in the same order.
const hasClientIdForPlatform = Platform.select({
  ios: !!GOOGLE_IOS_CLIENT_ID,
  android: !!GOOGLE_ANDROID_CLIENT_ID,
  default: !!GOOGLE_WEB_CLIENT_ID,
});

const useGoogleAuth = hasClientIdForPlatform ? useGoogleAuthConfigured : useGoogleAuthUnavailable;
export default useGoogleAuth;
