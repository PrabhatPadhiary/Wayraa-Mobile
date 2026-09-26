import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  StatusBar,
  Image,
  Dimensions,
  FlatList,
  Animated,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SIZES } from '../constants';
import { Ionicons } from '@expo/vector-icons';
import { signInWithGoogle, checkEmailExists } from '../services';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ONBOARDING_SLIDES = [
  {
    id: '1',
    title: 'Plan Your Next Adventure',
    subtitle: 'Create detailed trip itineraries, manage budgets, and coordinate with friends — all in one place.',
    icon: '🗺️',
    bgColor: '#0d1b2a',
    cardTitle: 'Bali, Indonesia',
    cardSubtitle: '7 days • 3 travelers',
    cardRating: '4.8',
  },
  {
    id: '2',
    title: 'Discover Destinations',
    subtitle: 'Explore curated places, read real traveler reviews, and find hidden gems around the world.',
    icon: '🧭',
    bgColor: '#1a2f3f',
    cardTitle: 'Santorini, Greece',
    cardSubtitle: '143 reviews',
    cardRating: '5.0',
  },
  {
    id: '3',
    title: 'Share Your Story',
    subtitle: 'Write travel journals, share photos, and inspire a community of wanderers with your experiences.',
    icon: '✍️',
    bgColor: '#2d1b0e',
    cardTitle: 'My Japan Journey',
    cardSubtitle: '12 photos • 3 min read',
    cardRating: '4.9',
  },
];

/**
 * WelcomeScreen - Splash intro that fades into onboarding carousel.
 */
export default function WelcomeScreen({ navigation }) {
  const [showSplash, setShowSplash] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const flatListRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const bottomSlideAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  // Splash animations
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashScale = useRef(new Animated.Value(0.8)).current;
  const splashLogoOpacity = useRef(new Animated.Value(0)).current;
  const splashTextOpacity = useRef(new Animated.Value(0)).current;
  const splashTaglineOpacity = useRef(new Animated.Value(0)).current;
  const carouselOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Step 1: Logo fades in and scales up
    Animated.timing(splashLogoOpacity, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    Animated.timing(splashScale, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();

    // Step 2: Text fades in 1 second after mount (logo is fully visible by then)
    const textTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(splashTextOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(splashTaglineOpacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start();
    }, 1000);

    // After 3 seconds, fade out splash and show carousel
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(carouselOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowSplash(false);
      });
    }, 3000);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(timer);
    };
  }, []);

  const handleSignUp = () => {
    setShowAuthSheet(true);
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
        toValue: SCREEN_HEIGHT,
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

  const handleSignIn = () => {
    // TODO: Navigate to Sign In screen
  };

  const handleCreateAccount = async () => {
    if (!emailInput.trim()) {
      showToast('Please enter your email address.');
      return;
    }
    setIsLoading(true);
    const result = await checkEmailExists(emailInput.trim());
    setIsLoading(false);

    if (result.error) {
      showToast('Please enter a valid email address.');
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
    setIsLoading(true);
    setAuthError(null);
    const result = await signInWithGoogle();
    setIsLoading(false);
    if (result.success) {
      navigation.replace('Main', { user: result.user });
    } else {
      showToast(result.error);
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

  const handleNext = () => {
    if (currentIndex < ONBOARDING_SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index ?? 0;
      setCurrentIndex(newIndex);
      if (newIndex === ONBOARDING_SLIDES.length - 1) {
        Animated.spring(bottomSlideAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 60,
          friction: 9,
        }).start();
      } else {
        bottomSlideAnim.setValue(0);
      }
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderSlide = ({ item }) => (
    <View style={styles.slide}>
      <View style={[styles.previewCard, { backgroundColor: item.bgColor }]}>
        <View style={styles.cardContent}>
          <Text style={styles.cardIcon}>{item.icon}</Text>
          <View style={styles.cardInfo}>
            <Text style={styles.cardTitle}>{item.cardTitle}</Text>
            <Text style={styles.cardSubtitle}>{item.cardSubtitle}</Text>
          </View>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingText}>⭐ {item.cardRating}</Text>
          </View>
        </View>
        <View style={styles.cardDecoration}>
          <View style={styles.decorCircle} />
          <View style={styles.decorCircleSmall} />
        </View>
      </View>

      <View style={styles.textContent}>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
      </View>
    </View>
  );

  const isLastSlide = currentIndex === ONBOARDING_SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundWarm} />

      {/* Splash Screen */}
      {showSplash && (
        <Animated.View style={[styles.splashContainer, {
          opacity: splashOpacity,
        }]}>
          <Animated.View style={{ transform: [{ scale: splashScale }], opacity: splashLogoOpacity }}>
            <Image
              source={require('../../assets/wayraa_logo.png')}
              style={styles.splashLogo}
              resizeMode="contain"
            />
          </Animated.View>
          <Animated.Text style={[styles.splashBrand, { opacity: splashTextOpacity }]}>
            Wayraa
          </Animated.Text>
          <Animated.Text style={[styles.splashTagline, { opacity: splashTaglineOpacity }]}>
            Plan. Explore. Share.
          </Animated.Text>
        </Animated.View>
      )}

      {/* Main Content (Carousel) */}
      <Animated.View style={[styles.mainContent, { opacity: carouselOpacity }]}>
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/wayraa_logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
            accessibilityLabel="Wayraa logo"
          />
          <Text style={styles.headerBrand}>Wayraa</Text>
        </View>

        {/* Carousel */}
        <View style={styles.carouselContainer}>
          <FlatList
            ref={flatListRef}
            data={ONBOARDING_SLIDES}
            renderItem={renderSlide}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            decelerationRate="fast"
            snapToInterval={SCREEN_WIDTH}
            snapToAlignment="start"
            style={{ flex: 1 }}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: false }
            )}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        </View>

        {/* Dot Indicators */}
        <View style={styles.pagination}>
          {ONBOARDING_SLIDES.map((_, index) => {
            const inputRange = [
              (index - 1) * SCREEN_WIDTH,
              index * SCREEN_WIDTH,
              (index + 1) * SCREEN_WIDTH,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={index}
                style={[styles.dot, { width: dotWidth, opacity: dotOpacity }]}
              />
            );
          })}
        </View>

        {/* Bottom Actions */}
        <View style={styles.bottomSection}>
          {isLastSlide ? (
            <Animated.View style={{
              opacity: bottomSlideAnim,
              transform: [{
                translateY: bottomSlideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [40, 0],
                }),
              }],
            }}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleSignUp}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Create a new account"
              >
                <Text style={styles.primaryButtonText}>Get Started</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleExplore}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Browse without an account"
              >
                <Text style={styles.secondaryButtonText}>Just Looking Around</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleNext}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Next slide"
            >
              <Text style={styles.nextButtonText}>Next →</Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
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
            style={[styles.authSheet, { transform: [{ translateY: sheetAnim }] }]}
          >
            <View style={styles.sheetHandle} />

            {/* Back button */}
            <TouchableOpacity
              style={styles.sheetBackButton}
              onPress={handleCloseSheet}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={styles.sheetBackText}>←</Text>
            </TouchableOpacity>

            <Text style={styles.sheetTitle}>What's your email?</Text>
            <Text style={styles.sheetSubtitle}>We'll check if you already have an account.</Text>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.emailInput}
                placeholder="name@email.com"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={emailInput}
                onChangeText={setEmailInput}
                accessibilityLabel="Email address"
              />
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={styles.sheetPrimaryButton}
              onPress={handleCreateAccount}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
            >
              <Text style={styles.sheetPrimaryButtonText}>Continue</Text>
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Buttons */}
            <TouchableOpacity
              style={styles.socialButton}
              onPress={handleGoogleSignIn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue with Google"
            >
              <Ionicons name="logo-google" size={20} color={COLORS.white} />
              <Text style={styles.socialButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.socialButton}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue with Apple"
            >
              <Ionicons name="logo-apple" size={20} color={COLORS.white} />
              <Text style={styles.socialButtonText}>Continue with Apple</Text>
            </TouchableOpacity>

            {/* Terms */}
            <Text style={styles.termsText}>
              By continuing, you agree to Wayraa's Terms and Privacy Policy.
            </Text>

            {/* Loading Overlay */}
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={COLORS.accent} />
                <Text style={styles.loadingText}>Signing you in...</Text>
              </View>
            )}
          </Animated.View>
        </>
      )}
      {/* Error Toast */}
      {authError && (
        <Animated.View style={[styles.toast, {
          opacity: toastOpacity,
          transform: [{ translateY: toastTranslateY }],
        }]}>
          <Text style={styles.toastText}>{authError}</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    overflow: 'hidden',
    maxHeight: '100vh',
  },
  // Splash styles
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundWarm,
    zIndex: 10,
  },
  splashLogo: {
    width: 200,
    height: 200,
    marginBottom: SIZES.spacing_lg,
  },
  splashBrand: {
    fontSize: 52,
    fontFamily: 'PlayfairDisplay_800ExtraBold',
    color: COLORS.primary,
    letterSpacing: 1,
    marginBottom: SIZES.spacing_sm,
  },
  splashTagline: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  // Main content styles
  mainContent: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
    paddingVertical: SIZES.spacing_base,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  headerBrand: {
    fontSize: SIZES.xl,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.primary,
    marginLeft: SIZES.spacing_sm,
  },
  carouselContainer: {
    flex: 1,
    overflow: 'hidden',
    width: '100%',
  },
  slide: {
    width: SCREEN_WIDTH,
    paddingHorizontal: SIZES.spacing_lg,
    justifyContent: 'center',
  },
  previewCard: {
    borderRadius: SIZES.radius_lg,
    padding: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_xl,
    height: SCREEN_HEIGHT * 0.35,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: SIZES.radius_md,
    padding: SIZES.spacing_base,
  },
  cardIcon: {
    fontSize: 28,
    marginRight: SIZES.spacing_md,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: SIZES.base,
    fontWeight: '700',
    color: COLORS.white,
  },
  cardSubtitle: {
    fontSize: SIZES.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  ratingBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_xs,
    borderRadius: SIZES.radius_sm,
  },
  ratingText: {
    fontSize: SIZES.sm,
    color: COLORS.white,
    fontWeight: '600',
  },
  cardDecoration: {
    position: 'absolute',
    top: -20,
    right: -20,
  },
  decorCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  decorCircleSmall: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.03)',
    position: 'absolute',
    bottom: -30,
    left: -40,
  },
  textContent: {
    paddingHorizontal: SIZES.spacing_sm,
  },
  slideTitle: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_md,
    letterSpacing: -0.5,
  },
  slideSubtitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SIZES.spacing_lg,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  bottomSection: {
    paddingHorizontal: SIZES.spacing_xl,
    paddingBottom: SIZES.spacing_xl,
    gap: SIZES.spacing_base,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: SIZES.lg,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: SIZES.spacing_sm,
    alignItems: 'center',
    marginTop: SIZES.spacing_sm,
  },
  secondaryButtonText: {
    color: COLORS.textMuted,
    fontSize: SIZES.md,
    fontWeight: '500',
  },
  nextButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
  },
  nextButtonText: {
    color: COLORS.white,
    fontSize: SIZES.lg,
    fontWeight: '700',
  },
  // Auth Bottom Sheet
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 20,
  },
  authSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.8,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: SIZES.spacing_xl,
    paddingTop: SIZES.spacing_base,
    zIndex: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
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
    marginBottom: SIZES.spacing_lg,
  },
  sheetBackText: {
    fontSize: 24,
    color: COLORS.textSecondary,
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
  termsText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SIZES.spacing_base,
    lineHeight: 18,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
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
  errorContainer: {
    // unused — kept for reference
  },
  errorText: {
    // unused
  },
  toast: {
    position: 'absolute',
    bottom: 40,
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
