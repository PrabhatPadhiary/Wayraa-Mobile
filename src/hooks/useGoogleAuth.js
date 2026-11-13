import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID } from '../config';
import { completeGoogleSignIn } from '../services';

// Ensures the auth browser session closes and returns control to the app.
WebBrowser.maybeCompleteAuthSession();

/**
 * Google sign-in, two ways depending on the platform:
 *  - iOS: expo-auth-session opens Google's consent screen in a browser sheet,
 *    which returns to the app via com.wayraa.mobile:/oauthredirect.
 *  - Android: Google's native sign-in (@react-native-google-signin), the
 *    account picker that lists the phone's Google accounts. No browser and no
 *    return link: Google only allows that link on Android for verified apps.
 *
 * Either way we get a Google ID token -> completeGoogleSignIn exchanges it into
 * Firebase and then the backend (/Auth/login), matching the web app. Neither
 * works in Expo Go (it isn't our app id): test Google sign-in in a real build.
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
 * Android: Google's native account picker. The ID token is issued for our Web
 * client ID (what Firebase checks); Google matches the app by its Android
 * client (package com.wayraa.mobile + the EAS signing key's SHA-1), which must
 * exist in the same Google Cloud project as Firebase.
 */
function useGoogleAuthNative(onResult) {
  const [isProcessing, setIsProcessing] = useState(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const promptAsync = async () => {
    // Loaded only when used: Expo Go doesn't include this native module, and
    // importing it there would crash the Welcome / Login screens.
    let lib;
    try {
      lib = require('@react-native-google-signin/google-signin');
    } catch {
      onResultRef.current?.({
        success: false,
        error: 'Google sign-in works in the Wayraa app, not in Expo Go. Please use email here.',
      });
      return { type: 'error' };
    }
    const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = lib;

    setIsProcessing(true);
    try {
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Always show the account picker, not the account used last time
      // (e.g. after logging out to switch accounts).
      await GoogleSignin.signOut().catch(() => {});
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return { type: 'cancel' }; // backed out

      const idToken = response.data?.idToken;
      const result = await completeGoogleSignIn(idToken);
      onResultRef.current?.(result);
      return { type: result?.success ? 'success' : 'error' };
    } catch (e) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return { type: 'cancel' };
      if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return { type: 'cancel' };
      const message = isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE
        ? 'Google Play services is needed for Google sign-in. Please update it, or use email.'
        : 'Google sign-in failed. Please try again.';
      onResultRef.current?.({ success: false, error: message });
      return { type: 'error' };
    } finally {
      setIsProcessing(false);
    }
  };

  return { promptAsync, isProcessing, isReady: true };
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

const useGoogleAuth = !hasClientIdForPlatform
  ? useGoogleAuthUnavailable
  : Platform.OS === 'android'
    ? useGoogleAuthNative
    : useGoogleAuthConfigured;
export default useGoogleAuth;
