import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  StatusBar,
  Image,
  Animated,
  Easing,
  TextInput,
  ActivityIndicator,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { Ionicons } from '@expo/vector-icons';
import { checkEmailExists } from '../services';
import useGoogleAuth from '../hooks/useGoogleAuth';
import { openPrivacyPolicy, openTerms } from '../utils/legal';
import WayraaLoader from '../components/WayraaLoader';

/*
 * First screen for signed-out users: full-screen travel photos that slowly
 * drift and cross-fade, with the brand line and the sign-up buttons over a
 * navy fade at the bottom. Tapping the photo skips to the next one.
 *
 * The photos are bundled (assets/welcome) so they show instantly, offline.
 */
const PHOTOS = [
  { id: 'road', source: require('../../assets/welcome/road.jpg'), caption: 'The long way round' },
  { id: 'beach', source: require('../../assets/welcome/beach.jpg'), caption: 'Salt, sand & sea' },
  { id: 'campfire', source: require('../../assets/welcome/campfire.jpg'), caption: 'Nights under the stars' },
];

const PHOTO_MS = 5500;   // how long each photo stays
const FADE_MS = 1100;    // cross-fade between photos
const DRIFT_SCALE = 1.12; // slow zoom ("Ken Burns") over a photo's time

const NAVY = 'rgba(4,50,71,';


export default function WelcomeScreen({ navigation }) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = screenHeight < 720; // short phones

  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState(null);
  const [reduceMotion, setReduceMotion] = useState(false);

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
        navigation.replace('Main', { user: result.user });
      } else {
        showToast(result.error);
      }
    });

  // One opacity + zoom per photo.
  const layers = useRef(
    PHOTOS.map((_, i) => ({
      opacity: new Animated.Value(i === 0 ? 1 : 0),
      scale: new Animated.Value(1),
    })),
  ).current;
  // One fill (0-1) per progress bar, animated on the native side so a bar
  // can never be left half-lit when the photo changes.
  const fills = useRef(PHOTOS.map(() => new Animated.Value(0))).current;
  const intro = useRef(new Animated.Value(0)).current;
  const captionOpacity = useRef(new Animated.Value(1)).current;

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const sheetAnim = useRef(new Animated.Value(screenHeight)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

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

  // Show the active photo: fade it in over the previous one, drift, and run
  // its progress bar. When the bar fills, move on (unless the sheet is open).
  useEffect(() => {
    const layer = layers[active];
    // Only the outgoing photo stays under the incoming one; the new one
    // always fades in from clear (even after quick taps).
    layers.forEach((l, i) => {
      if (i !== active && i !== previous) {
        l.opacity.stopAnimation();
        l.opacity.setValue(0);
      }
    });
    if (previous !== null) {
      layer.opacity.stopAnimation();
      layer.opacity.setValue(0);
    }
    layer.scale.stopAnimation();
    layer.scale.setValue(1);
    const animations = [
      Animated.timing(layer.opacity, {
        toValue: 1,
        duration: previous === null ? 0 : FADE_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ];
    if (!reduceMotion) {
      animations.push(Animated.timing(layer.scale, {
        toValue: DRIFT_SCALE,
        duration: PHOTO_MS + FADE_MS * 2,
        easing: Easing.linear,
        useNativeDriver: true,
      }));
    }
    Animated.parallel(animations).start();

    captionOpacity.setValue(0);
    Animated.timing(captionOpacity, {
      toValue: 1, duration: 600, delay: 300, useNativeDriver: true,
    }).start();

    // Once the new photo covers it, hide the old one.
    const hide = setTimeout(() => {
      if (previous !== null) layers[previous].opacity.setValue(0);
    }, FADE_MS + 50);
    return () => clearTimeout(hide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const activeRef = useRef(0);
  const next = useCallback(() => {
    const cur = activeRef.current;
    activeRef.current = (cur + 1) % PHOTOS.length;
    setPrevious(cur);
    setActive(activeRef.current);
  }, []);

  // Bars before the active photo are full, after it empty; the active one
  // fills over the photo's time, then we move on.
  useEffect(() => {
    fills.forEach((f, i) => {
      if (i !== active) {
        f.stopAnimation();
        f.setValue(i < active ? 1 : 0);
      }
    });
    fills[active].setValue(0);
  }, [active, fills]);

  // Run (or pause, while the sign-in sheet is open) the active bar, picking
  // up from wherever it was.
  const runRef = useRef(null);
  useEffect(() => {
    const fill = fills[active];
    if (showAuthSheet) {
      fill.stopAnimation();
      return undefined;
    }
    let cancelled = false;
    fill.stopAnimation((value) => {
      if (cancelled) return;
      const run = Animated.timing(fill, {
        toValue: 1,
        duration: Math.max(0, PHOTO_MS * (1 - value)),
        easing: Easing.linear,
        useNativeDriver: true,
      });
      runRef.current = run;
      run.start(({ finished }) => { if (finished && !cancelled) next(); });
    });
    return () => {
      cancelled = true;
      runRef.current?.stop();
    };
  }, [active, showAuthSheet, fills, next]);

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
    navigation.replace('Main', { user: null });
  };

  const rise = (offset) => ({
    opacity: intro,
    transform: [{
      translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }),
    }],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Photos (last shown on top) */}
      {PHOTOS.map((photo, i) => (
        <Animated.View
          key={photo.id}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              zIndex: i === active ? 2 : i === previous ? 1 : 0,
              opacity: layers[i].opacity,
              transform: [{ scale: layers[i].scale }],
            },
          ]}
        >
          <Image source={photo.source} style={styles.photo} resizeMode="cover" />
        </Animated.View>
      ))}

      {/* Shade: a little at the top for the status bar, navy at the bottom for the text */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        style={[styles.topShade, { height: insets.top + 110 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${NAVY}0)`, `${NAVY}0.55)`, `${NAVY}0.92)`, 'rgba(2,28,40,0.98)']}
        locations={[0, 0.3, 0.65, 1]}
        style={styles.bottomShade}
      />

      {/* Tap the photo to see the next one */}
      <Pressable
        style={[StyleSheet.absoluteFill, { zIndex: 4 }]}
        onPress={next}
        accessibilityRole="button"
        accessibilityLabel="Next photo"
      />

      {/* Top: progress bars, brand, caption */}
      <View style={[styles.top, { paddingTop: insets.top + SIZES.spacing_sm }]} pointerEvents="none">
        <View style={styles.bars}>
          {PHOTOS.map((photo, i) => (
            <View key={photo.id} style={styles.bar}>
              <Animated.View style={[styles.barFill, { transform: [{ scaleX: fills[i] }] }]} />
            </View>
          ))}
        </View>

        <Animated.View style={[styles.brandWrap, rise(-10)]}>
          <View style={styles.brandRow}>
            <Image source={require('../../assets/wayraa_logo.png')} style={styles.brandLogo} />
            <Text style={styles.brandName} maxFontSizeMultiplier={1.2}>Wayraa</Text>
          </View>
        </Animated.View>
      </View>

      {/* Bottom: line, buttons */}
      <View
        style={[styles.bottom, { paddingBottom: insets.bottom + (compact ? SIZES.spacing_base : SIZES.spacing_lg) }]}
        pointerEvents="box-none"
      >
        <Animated.Text
          style={[styles.caption, { opacity: captionOpacity }]}
          maxFontSizeMultiplier={1.2}
        >
          {PHOTOS[active].caption.toUpperCase()}
        </Animated.Text>

        <Animated.View style={rise(30)}>
          <View>
            <View pointerEvents="none">
              <Text
                style={[styles.headline, compact && styles.headlineCompact]}
                maxFontSizeMultiplier={1.15}
                accessibilityRole="header"
              >
                Plan it <Text style={styles.headlineAccent}>together.</Text>
                {'\n'}Live it. Share it.
              </Text>
              <Text style={styles.subline} maxFontSizeMultiplier={1.3}>
                Build trips with your crew, map out every day, and share the stories after.
              </Text>
            </View>

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
                maxHeight: screenHeight * 0.85,
                paddingBottom: insets.bottom + SIZES.spacing_lg,
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
    backgroundColor: COLORS.primary,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  topShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '68%',
    zIndex: 3,
  },

  // ── Top ──────────────────────────────────────────────────────────────
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SIZES.spacing_lg,
    zIndex: 5,
  },
  bars: {
    flexDirection: 'row',
    gap: 5,
    // A soft shadow keeps the bars visible on bright skies.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  bar: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.32)',
    overflow: 'hidden',
  },
  barFill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 2,
    backgroundColor: COLORS.white,
    transformOrigin: 'left',
  },
  brandWrap: {
    alignSelf: 'flex-start',
    marginTop: SIZES.spacing_base,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 40,
    height: 40,
  },
  brandName: {
    fontSize: 27,
    fontFamily: 'PlayfairDisplay_800ExtraBold',
    color: COLORS.white,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  // ── Bottom ───────────────────────────────────────────────────────────
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIZES.spacing_lg,
    zIndex: 5,
  },
  caption: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 2.2,
    marginBottom: SIZES.spacing_sm,
    textAlign: 'center',
  },
  headline: {
    fontSize: 40,
    lineHeight: 48,
    fontFamily: 'PlayfairDisplay_800ExtraBold',
    color: COLORS.white,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headlineCompact: {
    fontSize: 33,
    lineHeight: 40,
  },
  headlineAccent: {
    color: '#ff8a3d',
  },
  subline: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.82)',
    marginTop: SIZES.spacing_md,
    maxWidth: 320,
    alignSelf: 'center',
    textAlign: 'center',
  },
  actions: {
    marginTop: SIZES.spacing_lg,
    gap: 12,
    width: '80%',
    maxWidth: 320,
    alignSelf: 'center',
  },
  actionsCompact: {
    marginTop: SIZES.spacing_base,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    backgroundColor: COLORS.accent,
    height: 58,
    borderRadius: 29,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  secondaryButtonText: {
    color: COLORS.white,
    fontSize: SIZES.md + 1,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.2,
  },
  signInLink: {
    alignSelf: 'center',
    marginTop: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_xs,
  },
  signInText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.75)',
  },
  signInBold: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
    textDecorationLine: 'underline',
  },

  // ── Auth bottom sheet ────────────────────────────────────────────────
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    backgroundColor: '#2a2a2a',
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
    ...StyleSheet.absoluteFill,
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
    backgroundColor: '#1a1a1a',
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
