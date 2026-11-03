import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  Image,
  Dimensions,
  FlatList,
  Animated,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { Ionicons } from '@expo/vector-icons';
import { checkEmailExists } from '../services';
import useGoogleAuth from '../hooks/useGoogleAuth';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ONBOARDING_SLIDES = [
  {
    id: '1',
    title: 'Craft Your Perfect Trip',
    subtitle: 'Build detailed itineraries, track budgets, and collaborate with your travel crew — all in one place.',
    type: 'itinerary',
    gradientColors: ['#ff6b35', '#f7931e'],
    cardTitle: 'Bali Adventure',
    cardSubtitle: '7 days • 3 travelers',
    itinerary: [
      { day: 'Day 1', place: 'Seminyak Beach', done: true },
      { day: 'Day 2', place: 'Tegalalang Rice Terrace', done: true },
      { day: 'Day 3', place: 'Mount Batur Sunrise', done: false },
    ],
  },
  {
    id: '2',
    title: 'Discover Hidden Gems',
    subtitle: 'Explore curated destinations, read authentic traveler reviews, and uncover places you\'ll love.',
    type: 'destination',
    gradientColors: ['#4a90e2', '#50e3c2'],
    cardTitle: 'Santorini, Greece',
    cardSubtitle: 'Cyclades Islands',
    cardRating: '5.0',
    tags: ['Hidden Gem', 'Trending'],
    reviewCount: '2.4k reviews',
  },
  {
    id: '3',
    title: 'Relive & Share Your Journey',
    subtitle: 'Capture memories in travel journals, share stunning photos, and inspire wanderers worldwide.',
    type: 'journal',
    gradientColors: ['#7b2ff7', '#e85d04'],
    cardTitle: 'My Japan Journey',
    cardSubtitle: '3 min read',
    likes: '1.2k',
    comments: '84',
    excerpt: 'Cherry blossoms lined every path in Kyoto, petals drifting like pink snow...',
  },
];

// Bidirectional infinite loop:
// [slide3-clone, slide1, slide2, slide3, slide1-clone]
// Real slides live at indices 1-3. We start at index 1.
// Swiping left past index 1 hits the slide3-clone (index 0) → snap to index 3.
// Swiping right past index 3 hits the slide1-clone (index 4) → snap to index 1.
const LAST = ONBOARDING_SLIDES.length - 1;
const LOOPED_SLIDES = [
  JSON.parse(JSON.stringify({ ...ONBOARDING_SLIDES[LAST], id: 'clone-last' })),
  ...ONBOARDING_SLIDES,
  JSON.parse(JSON.stringify({ ...ONBOARDING_SLIDES[0], id: 'clone-first' })),
];
// Offset between LOOPED_SLIDES index and real slide index
const LOOP_OFFSET = 1;

export default function WelcomeScreen({ navigation }) {
  const [showSplash, setShowSplash] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [userScrolled, setUserScrolled] = useState(false); // track manual scroll to pause auto-slide
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
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const flatListRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
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

  // Auto-slide every 3.5s forward. currentIndex is the real slide (0-2),
  // FlatList lives at loopIndex = currentIndex + LOOP_OFFSET.
  useEffect(() => {
    if (showSplash || userScrolled || showAuthSheet) return;

    const interval = setInterval(() => {
      const nextLoopIndex = currentIndex + LOOP_OFFSET + 1;
      flatListRef.current?.scrollToIndex({ index: nextLoopIndex, animated: true });
    }, 3500);

    return () => clearInterval(interval);
  }, [showSplash, currentIndex, userScrolled, showAuthSheet]);

  // When user manually scrolls, pause auto-slide for 1s then resume.
  const handleScrollBeginDrag = () => {
    setUserScrolled(true);
  };

  useEffect(() => {
    if (!userScrolled) return;
    const timer = setTimeout(() => setUserScrolled(false), 1000);
    return () => clearTimeout(timer);
  }, [userScrolled]);

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

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const loopIndex = viewableItems[0].index ?? LOOP_OFFSET;

      if (loopIndex === 0) {
        // Hit the clone of the last slide at the front — snap to the real last slide.
        setCurrentIndex(ONBOARDING_SLIDES.length - 1);
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: ONBOARDING_SLIDES.length, animated: false });
        }, 50);
      } else if (loopIndex === LOOPED_SLIDES.length - 1) {
        // Hit the clone of the first slide at the end — snap to the real first slide.
        setCurrentIndex(0);
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: LOOP_OFFSET, animated: false });
        }, 50);
      } else {
        // Normal slide — real index is loopIndex - LOOP_OFFSET.
        setCurrentIndex(loopIndex - LOOP_OFFSET);
      }
    }
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderCardContent = (item) => {
    if (item.type === 'itinerary') {
      return (
        <>
          {/* Trip header */}
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBadge}>
              <Ionicons name="map-outline" size={16} color="rgba(255,255,255,0.9)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.cardTitle}</Text>
              <Text style={styles.cardSubtitle}>{item.cardSubtitle}</Text>
            </View>
            <View style={styles.progressBadge}>
              <Text style={styles.progressText}>2/3</Text>
            </View>
          </View>

          {/* Itinerary rows */}
          <View style={styles.itineraryList}>
            {item.itinerary.map((row, i) => (
              <View key={i} style={styles.itineraryRow}>
                <View style={[styles.itineraryCheck, row.done && styles.itineraryCheckDone]}>
                  {row.done && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
                <View style={styles.itineraryTextGroup}>
                  <Text style={styles.itineraryDay}>{row.day}</Text>
                  <Text
                    style={[styles.itineraryPlace, row.done && styles.itineraryPlaceDone]}
                    numberOfLines={1}
                  >
                    {row.place}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      );
    }

    if (item.type === 'destination') {
      return (
        <>
          {/* Location pill */}
          <View style={styles.locationPill}>
            <Ionicons name="location" size={13} color="rgba(255,255,255,0.9)" />
            <Text style={styles.locationPillText}>{item.cardSubtitle}</Text>
          </View>

          {/* Destination name + rating */}
          <View style={styles.destNameRow}>
            <Text style={styles.destName}>{item.cardTitle}</Text>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={13} color="#FFC107" />
              <Text style={styles.ratingText}>{item.cardRating}</Text>
            </View>
          </View>

          {/* Tags + review count */}
          <View style={styles.destMeta}>
            <View style={styles.tagsRow}>
              {item.tags.map((tag, i) => (
                <View key={i} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.reviewCount}>{item.reviewCount}</Text>
          </View>
        </>
      );
    }

    if (item.type === 'journal') {
      return (
        <>
          {/* Journal header */}
          <View style={styles.cardHeader}>
            <View style={styles.cardIconBadge}>
              <Ionicons name="book-outline" size={16} color="rgba(255,255,255,0.9)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.cardTitle}</Text>
              <Text style={styles.cardSubtitle}>{item.cardSubtitle}</Text>
            </View>
          </View>

          {/* Excerpt */}
          <View style={styles.excerptBox}>
            <Text style={styles.excerptText} numberOfLines={3}>{item.excerpt}</Text>
          </View>

          {/* Engagement row */}
          <View style={styles.engagementRow}>
            <View style={styles.engagementItem}>
              <Ionicons name="heart" size={15} color="rgba(255,255,255,0.85)" />
              <Text style={styles.engagementText}>{item.likes}</Text>
            </View>
            <View style={styles.engagementItem}>
              <Ionicons name="chatbubble-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.engagementText}>{item.comments}</Text>
            </View>
            <View style={styles.readMorePill}>
              <Text style={styles.readMoreText}>Read more</Text>
            </View>
          </View>
        </>
      );
    }

    return null;
  };

  const renderSlide = ({ item }) => (
    <View style={styles.slide}>
      <LinearGradient
        colors={item.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.previewCard}
      >
        {/* Decorative circles */}
        <View style={styles.cardDecoration}>
          <View style={styles.decorCircle} />
          <View style={styles.decorCircleSmall} />
        </View>

        {renderCardContent(item)}
      </LinearGradient>

      {/* Text lives inside the slide so swiping on it scrolls the carousel */}
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

        {/* Carousel — only the visual card slides */}
        <View style={styles.carouselContainer}>
          <FlatList
            ref={flatListRef}
            data={LOOPED_SLIDES}
            renderItem={renderSlide}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            decelerationRate="fast"
            snapToInterval={SCREEN_WIDTH}
            snapToAlignment="start"
            initialScrollIndex={LOOP_OFFSET}
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
            onScrollBeginDrag={handleScrollBeginDrag}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        </View>

        {/* Dot Indicators */}
        <View style={styles.pagination}>
          {ONBOARDING_SLIDES.map((_, index) => {
            // Real slides start at loopIndex 1, so scrollX for slide `index` is
            // (index + LOOP_OFFSET) * SCREEN_WIDTH.
            const center = (index + LOOP_OFFSET) * SCREEN_WIDTH;
            const inputRange = [center - SCREEN_WIDTH, center, center + SCREEN_WIDTH];
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
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Browse without an account"
          >
            <Text style={styles.secondaryButtonText}>Just Looking Around</Text>
          </TouchableOpacity>
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
  },
  // Splash styles
  splashContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundWarm,
    zIndex: 10,
  },
  splashLogo: {
    width: 280,
    height: 280,
    marginBottom: SIZES.spacing_base,
  },
  splashBrand: {
    fontSize: 44,
    fontFamily: 'PlayfairDisplay_800ExtraBold',
    color: COLORS.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  splashTagline: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  // Main content styles
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  blurWrapper: {},
  header: {
    // removed — header no longer shown on carousel screen
  },
  headerLogo: {
    // removed
  },
  headerBrand: {
    // removed
  },
  carouselContainer: {
    height: SCREEN_HEIGHT * 0.45 + 130,
    width: '100%',
    overflow: 'hidden',
    marginTop: SIZES.spacing_base,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.45 + 130,
    paddingHorizontal: SIZES.spacing_lg,
    justifyContent: 'flex-start',
  },
  previewCard: {
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_lg,
    height: SCREEN_HEIGHT * 0.45,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  // Icon scene — removed, replaced with type-specific card content
  iconScene: {},
  iconCircle: {},
  iconCircleLarge: {},
  iconCircleMid: {},
  iconCircleSmall: {},
  cardContent: {},
  cardInfo: {},

  // Shared card header (icon badge + title/subtitle row)
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_base,
  },
  cardIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  cardSubtitle: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },

  // ── Slide 1: Itinerary ──────────────────────────────────────────────
  progressBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: SIZES.radius_sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  progressText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  itineraryList: {
    gap: SIZES.spacing_sm,
  },
  itineraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: SIZES.radius_sm,
    paddingVertical: 10,
    paddingHorizontal: SIZES.spacing_base,
    gap: SIZES.spacing_sm,
  },
  itineraryCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  itineraryCheckDone: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderColor: 'transparent',
  },
  itineraryTextGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  itineraryDay: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: 'rgba(255,255,255,0.6)',
    width: 36,
  },
  itineraryPlace: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
    flex: 1,
  },
  itineraryPlaceDone: {
    opacity: 0.6,
  },

  // ── Slide 2: Destination ────────────────────────────────────────────
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    marginBottom: SIZES.spacing_base,
  },
  locationPillText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },
  destNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.spacing_base,
  },
  destName: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    flex: 1,
    marginRight: SIZES.spacing_sm,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 6,
    borderRadius: SIZES.radius_md,
  },
  ratingText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  destMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_xs,
  },
  tagChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: SIZES.radius_full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  reviewCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.7)',
  },

  // ── Slide 3: Journal ────────────────────────────────────────────────
  excerptBox: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: SIZES.radius_md,
    padding: SIZES.spacing_base,
    marginBottom: SIZES.spacing_base,
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.4)',
  },
  excerptText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_base,
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  engagementText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },
  readMorePill: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: SIZES.radius_full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  readMoreText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
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
  // Text content inside the slide — swiping here scrolls the carousel.
  textContent: {
    paddingHorizontal: SIZES.spacing_sm,
    paddingTop: SIZES.spacing_lg,
  },
  slideTitle: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_sm,
    letterSpacing: -0.5,
  },
  slideSubtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_sm,
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  bottomSection: {
    marginTop: 'auto',
    paddingHorizontal: SIZES.spacing_xl,
    paddingBottom: 32,
    gap: SIZES.spacing_sm,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: 18,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.4,
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: SIZES.radius_full,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.2,
  },
  // Auth Bottom Sheet
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
