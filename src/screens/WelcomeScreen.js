import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  Animated,
  Easing,
  TextInput,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import { Ionicons } from '@expo/vector-icons';
import { checkEmailExists } from '../services';
import useGoogleAuth from '../hooks/useGoogleAuth';
import { openPrivacyPolicy, openTerms } from '../utils/legal';
import WayraaLoader from '../components/WayraaLoader';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import { finishSignIn, continueAsGuest } from '../utils/authNavigation';
import WelcomeScene from '../components/WelcomeScene';

/*
 * First screen for signed-out users: three pages of one wide illustration
 * (see WelcomeScene: a plane flies a dotted route across them, each page with
 * its own headline), then the sign-up buttons on the frost page below.
 */

export default function WelcomeScreen({ navigation }) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = screenHeight < 720; // short phones
  // The sign-in sheet sits on top of the keyboard (Android doesn't move it: the
  // app is drawn edge to edge, so the window isn't resized for the keyboard).
  const keyboardHeight = useKeyboardHeight();

  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const [sheetMode, setSheetMode] = useState('start'); // 'start' | 'signin'
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [emailInput, setEmailInput] = useState('');

  // Google sign-in (expo-auth-session). onResult fires after the browser flow
  // completes and the Firebase + backend exchange finishes.
  const { promptAsync: promptGoogle, isProcessing: isGoogleProcessing } =
    useGoogleAuth((result) => {
      setIsLoading(false);
      if (result.success) {
        finishSignIn(navigation, result.user);
      } else {
        showToast(result.error);
      }
    });

  const intro = useRef(new Animated.Value(0)).current;

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const sheetAnim = useRef(new Animated.Value(screenHeight)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // Content rises in once.
  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 800,
      delay: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  const openSheet = (mode) => {
    setSheetMode(mode);
    setShowAuthSheet(true);
    sheetAnim.setValue(screenHeight);
    Animated.parallel([
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleCloseSheet = () => {
    Animated.parallel([
      Animated.timing(sheetAnim, {
        toValue: screenHeight,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowAuthSheet(false);
    });
  };

  const handleContinueWithEmail = async () => {
    if (!emailInput.trim()) {
      showToast('Please enter your email address.');
      return;
    }
    setIsLoading(true);
    const result = await checkEmailExists(emailInput.trim());
    setIsLoading(false);

    if (result.error) {
      // Invalid email, or a network problem — the service says which.
      showToast(result.error);
      return;
    }

    if (result.exists) {
      if (result.methods.includes('google.com')) {
        navigation.navigate('Login', { email: emailInput.trim(), method: 'google' });
      } else {
        navigation.navigate('Login', { email: emailInput.trim(), method: 'password' });
      }
    } else {
      navigation.navigate('SignUp', { email: emailInput.trim() });
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsLoading(true);
    // Opens the Google consent screen. The useGoogleAuth onResult callback
    // handles success/failure once the browser flow returns.
    const result = await promptGoogle();
    // If the browser was dismissed/cancelled, no onResult fires — clear loading.
    if (result?.type !== 'success') {
      setIsLoading(false);
    }
  };

  const showToast = (message) => {
    setAuthError(message);
    toastOpacity.setValue(0);
    toastTranslateY.setValue(20);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(toastTranslateY, { toValue: 20, duration: 400, useNativeDriver: true }),
        ]).start(() => setAuthError(null));
      }, 3000);
    });
  };

  const handleExplore = () => {
    continueAsGuest(navigation);
  };

  const rise = (offset) => ({
    opacity: intro,
    transform: [{
      translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }),
    }],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <WelcomeScene style={styles.scene} paused={showAuthSheet} compact={compact} />

      {/* Brand, over the sky */}
      <Animated.View
        style={[styles.brandWrap, { top: insets.top + SIZES.spacing_sm }, rise(-10)]}
        pointerEvents="none"
      >
        <View style={styles.brandRow}>
          <Image source={require('../../assets/wayraa_logo.png')} style={styles.brandLogo} />
          <Text style={styles.brandName} maxFontSizeMultiplier={1.2}>
            wayraa<Text style={styles.brandDot}>.</Text>
          </Text>
        </View>
      </Animated.View>

      {/* Bottom: line, buttons */}
      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + (compact ? SIZES.spacing_base : SIZES.spacing_lg) }]}
        pointerEvents="box-none"
      >
        <Animated.View style={rise(30)}>
          <View>
            <View style={[styles.actions, compact && styles.actionsCompact]}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => openSheet('start')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Get started"
              >
                <Text style={styles.primaryButtonText} maxFontSizeMultiplier={1.3}>Get started</Text>
                <Ionicons name="arrow-forward" size={16} color={COLORS.white} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleExplore}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Browse without an account"
              >
                <Text style={styles.secondaryButtonText} maxFontSizeMultiplier={1.3}>Just looking around</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => openSheet('signin')}
            style={styles.signInLink}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            accessibilityRole="button"
            accessibilityLabel="Sign in to an existing account"
          >
            <Text style={styles.signInText} maxFontSizeMultiplier={1.3}>
              Already have an account? <Text style={styles.signInBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Auth Bottom Sheet */}
      {showAuthSheet && (
        <>
          <Animated.View
            style={[styles.overlay, { opacity: overlayOpacity }]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={handleCloseSheet}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.authSheet,
              {
                bottom: keyboardHeight,
                maxHeight: Math.max(240, screenHeight * 0.85 - keyboardHeight),
                paddingBottom: keyboardHeight ? SIZES.spacing_base : insets.bottom + SIZES.spacing_lg,
                transform: [{ translateY: sheetAnim }],
              },
            ]}
          >
            <View style={styles.sheetHandle} />

            <TouchableOpacity
              style={styles.sheetBackButton}
              onPress={handleCloseSheet}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>

            <Text style={styles.sheetTitle}>
              {sheetMode === 'signin' ? 'Welcome back' : "What's your email?"}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {sheetMode === 'signin'
                ? 'Enter your email and we\'ll take you to your account.'
                : 'We\'ll check if you already have an account.'}
            </Text>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.emailInput}
                placeholder="name@email.com"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                value={emailInput}
                onChangeText={setEmailInput}
                onSubmitEditing={handleContinueWithEmail}
                returnKeyType="next"
                accessibilityLabel="Email address"
              />
            </View>

            <TouchableOpacity
              style={styles.sheetPrimaryButton}
              onPress={handleContinueWithEmail}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
            >
              <Text style={styles.sheetPrimaryButtonText}>Continue</Text>
            </TouchableOpacity>

            {/* While typing the email only the field and Continue matter: the
                Google option and terms come back when the keyboard closes, so
                the sheet fits above the keyboard on every phone. */}
            {!keyboardHeight && (
            <>
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.socialButton, (isLoading || isGoogleProcessing) && { opacity: 0.6 }]}
              onPress={handleGoogleSignIn}
              activeOpacity={0.85}
              disabled={isLoading || isGoogleProcessing}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <Ionicons name="logo-google" size={20} color={COLORS.white} />
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            <Text style={styles.termsText}>
              By continuing, you agree to Wayraa's{' '}
              <Text style={styles.termsLink} onPress={openTerms} accessibilityRole="link">Terms</Text>
              {' '}and{' '}
              <Text style={styles.termsLink} onPress={openPrivacyPolicy} accessibilityRole="link">Privacy Policy</Text>.
            </Text>
            </>
            )}

            {isLoading && (
              <View style={styles.loadingOverlay}>
                <WayraaLoader size={112} />
                <Text style={styles.loadingText}>Signing you in…</Text>
              </View>
            )}
          </Animated.View>
        </>
      )}

      {/* Error Toast */}
      {authError && (
        <Animated.View style={[styles.toast, {
          bottom: insets.bottom + 40,
          opacity: toastOpacity,
          transform: [{ translateY: toastTranslateY }],
        }]}>
          <Text style={styles.toastText}>{authError}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
  },
  // The illustration takes whatever height the text and buttons leave.
  scene: {
    flex: 1,
  },

  // ── Brand ────────────────────────────────────────────────────────────
  brandWrap: {
    position: 'absolute',
    left: SIZES.spacing_lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandLogo: {
    width: 34,
    height: 34,
  },
  brandName: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    letterSpacing: -0.6,
  },
  brandDot: {
    color: COLORS.accent,
  },

  // ── Bottom ───────────────────────────────────────────────────────────
  bottom: {
    paddingHorizontal: SIZES.spacing_lg,
  },
  actions: {
    marginTop: SIZES.spacing_md,
    gap: 10,
    width: '84%',
    maxWidth: 330,
    alignSelf: 'center',
  },
  actionsCompact: {
    marginTop: SIZES.spacing_sm,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    backgroundColor: COLORS.accent,
    height: 54,
    borderRadius: 27,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: SIZES.md + 1,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.2,
  },
  signInLink: {
    alignSelf: 'center',
    marginTop: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_xs,
  },
  signInText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  signInBold: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },

  // ── Auth bottom sheet ────────────────────────────────────────────────
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(28,40,51,0.5)',
    zIndex: 20,
  },
  authSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SIZES.spacing_xl,
    paddingTop: SIZES.spacing_base,
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SIZES.spacing_base,
  },
  sheetBackButton: {
    alignSelf: 'flex-start',
    marginBottom: SIZES.spacing_lg,
  },
  sheetTitle: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_sm,
  },
  sheetSubtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginBottom: SIZES.spacing_xl,
  },
  inputContainer: {
    marginBottom: SIZES.spacing_base,
  },
  emailInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_base,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  sheetPrimaryButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    marginBottom: SIZES.spacing_lg,
  },
  sheetPrimaryButtonText: {
    color: COLORS.white,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.spacing_lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    paddingHorizontal: SIZES.spacing_base,
    fontSize: SIZES.md,
    color: COLORS.textMuted,
    fontFamily: 'Poppins_400Regular',
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#272B2D',
    borderRadius: SIZES.radius_full,
    paddingVertical: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
    gap: SIZES.spacing_sm,
  },
  socialButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },
  termsLink: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primaryLight,
    textDecorationLine: 'underline',
  },
  termsText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SIZES.spacing_base,
    lineHeight: 18,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: SIZES.spacing_base,
  },
  loadingText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#1C2833',
    paddingVertical: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_lg,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },
});
