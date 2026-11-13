import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Wayraa's Privacy Policy and Terms of Use live on the website (one copy for
 * the app, the website, Google's sign-in screen and the store listings). The
 * app opens them in an in-app browser sheet, so you stay in Wayraa.
 */
export const PRIVACY_URL = 'https://wayraa.com/privacy';
export const TERMS_URL = 'https://wayraa.com/terms';

export async function openLegalPage(url) {
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    Linking.openURL(url).catch(() => {});
  }
}

export const openPrivacyPolicy = () => openLegalPage(PRIVACY_URL);
export const openTerms = () => openLegalPage(TERMS_URL);
