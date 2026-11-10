import { useEffect, useState, useRef } from 'react';
import { useFonts } from 'expo-font';
import {
  PlayfairDisplay_700Bold,
  PlayfairDisplay_800ExtraBold,
} from '@expo-google-fonts/playfair-display';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { View, Text, Image, Animated, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/config';
import { getStoredUser } from './src/services';
import { preloadPublic, preloadSignedIn, waitForHomePreload } from './src/services/homePreload';
import { HOME_STATIC_IMAGES } from './src/screens/ExploreScreen';
import { WelcomeScreen, LoginScreen, SignUpScreen, WriteJournalScreen } from './src/screens';
import { MainTabs } from './src/navigation';
import { BottomBarProvider } from './src/context/BottomBarContext';
import { COLORS, SIZES } from './src/constants';

/** Branded loading screen — shown while fonts and Firebase auth state load. */
function LoadingScreen() {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  return (
    <SafeAreaProvider>
      <View style={styles.loading}>
        <View style={styles.loadingContent}>
          <Animated.Image
            source={require('./assets/wayraa_logo.png')}
            style={[styles.loadingLogo, { transform: [{ scale: pulse }] }]}
            resizeMode="contain"
          />
          <Text style={styles.loadingBrand}>Wayraa</Text>
          <Text style={styles.loadingTagline}>Plan. Explore. Share.</Text>
        </View>

        {/* Three animated dots at the bottom */}
        <View style={styles.dotsRow}>
          {[0, 1, 2].map((i) => (
            <DotsIndicator key={i} delay={i * 200} />
          ))}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

function DotsIndicator({ delay }) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1,   duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity, delay]);

  return <Animated.View style={[styles.dot, { opacity }]} />;
}

const Stack = createNativeStackNavigator();

// Logo screen timing: shown at least MIN so it never just flashes, and while
// the home page preloads, but never longer than MAX (slow network).
const SPLASH_MIN_MS = 1200;
const SPLASH_MAX_MS = 4000;
const launchedAt = Date.now();

// Start loading the public parts of the home page right away.
preloadPublic(HOME_STATIC_IMAGES);

/**
 * Links that open the app: an invite opens the Join trip screen.
 *  - wayraa://join/<inviteId>            (installed app)
 *  - exp://<host>/--/join/<inviteId>     (Expo Go, via Linking.createURL)
 * https://wayraa.com/join/<id> links open the website unless universal links
 * are set up for the domain; on the phone they can be pasted into
 * My Trips → Join a trip instead.
 */
const linking = {
  prefixes: [Linking.createURL('/'), 'wayraa://'],
  config: {
    screens: {
      Main: {
        screens: {
          MyTrips: {
            screens: {
              JoinTrip: 'join/:inviteId',
            },
          },
        },
      },
    },
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    PlayfairDisplay_800ExtraBold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const [isAuthReady, setIsAuthReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState('Welcome');
  const [storedUser, setStoredUser] = useState(null);
  const [preloadDone, setPreloadDone] = useState(false);

  useEffect(() => {
    // Listen for Firebase auth state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in — check for stored user data
        const user = await getStoredUser();
        if (user) {
          setStoredUser(user);
          setInitialRoute('Main');
          // Your trips and favourites for the home page, while the logo shows.
          preloadSignedIn(firebaseUser.photoURL || user.photoUrl);
        }
      }
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  // Once signed-in state is known, keep the logo up until the home page's
  // data and photos are in (within the min / max times above).
  useEffect(() => {
    if (!isAuthReady) return undefined;
    let cancelled = false;
    const elapsed = Date.now() - launchedAt;
    Promise.all([
      waitForHomePreload(Math.max(0, SPLASH_MAX_MS - elapsed)),
      new Promise((resolve) => setTimeout(resolve, Math.max(0, SPLASH_MIN_MS - elapsed))),
    ]).then(() => { if (!cancelled) setPreloadDone(true); });
    return () => { cancelled = true; };
  }, [isAuthReady]);

  if (!fontsLoaded || !isAuthReady || !preloadDone) {
    return (
      <SafeAreaProvider>
        <LoadingScreen />
      </SafeAreaProvider>
    );
  }

  return (
    // Gesture handler root: native-thread gestures (e.g. swipeable trip cards).
    <GestureHandlerRootView style={styles.root}>
    <SafeAreaProvider>
      <BottomBarProvider>
        <NavigationContainer linking={linking}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Welcome" component={WelcomeScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen
              name="Main"
              component={MainTabs}
              initialParams={{ user: storedUser }}
              options={{ gestureEnabled: false }}
            />
            {/* Story composer: full screen over the tabs, sliding up like a
                "new post". A plain card, not a native modal: leaving an iOS
                fullScreenModal into a nested tab screen could leave the safe-area
                insets stale and push the whole app down. */}
            <Stack.Screen
              name="WriteJournal"
              component={WriteJournalScreen}
              options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </BottomBarProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Same size and type as the Welcome screen's splash, so the logo looks
  // the same whether or not you're signed in.
  loadingContent: {
    alignItems: 'center',
  },
  loadingLogo: {
    width: 280,
    height: 280,
    marginBottom: SIZES.spacing_base,
  },
  loadingBrand: {
    fontSize: 44,
    fontFamily: 'PlayfairDisplay_800ExtraBold',
    color: COLORS.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  loadingTagline: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accent,
    letterSpacing: 0.5,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 80,
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
});
