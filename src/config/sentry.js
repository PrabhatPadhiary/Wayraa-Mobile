import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting (Sentry): when the app crashes or hits an unhandled error
 * on someone's phone, the error and its stack trace are sent to Sentry, so
 * we hear about it without anyone having to tell us.
 *
 * Off unless EXPO_PUBLIC_SENTRY_DSN is set (an EAS environment variable),
 * and off in development. Errors only: no session replay (it would record
 * screens, including other people's stories), no performance tracing, and
 * no personal data (sendDefaultPii off: no IP address).
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const sentryEnabled = !!DSN && !__DEV__;

export function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Which build it came from (preview APK vs Play release).
    environment: process.env.EXPO_PUBLIC_APP_ENV || 'production',
  });
}

/** The root component, wrapped so Sentry catches render errors (as is when off). */
export function withSentry(App) {
  return sentryEnabled ? Sentry.wrap(App) : App;
}
