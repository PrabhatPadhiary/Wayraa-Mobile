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
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './src/config';
import { getStoredUser } from './src/services';
import { WelcomeScreen, LoginScreen, SignUpScreen } from './src/screens';
import { MainTabs } from './src/navigation';
import { BottomBarProvider } from './src/context/BottomBarContext';
import { COLORS } from './src/constants';

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

  useEffect(() => {
    // Listen for Firebase auth state
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in — check for stored user data
        const user = await getStoredUser();
        if (user) {
          setStoredUser(user);
          setInitialRoute('Main');
        }
      }
      setIsAuthReady(true);
    });

    return unsubscribe;
  }, []);

  if (!fontsLoaded || !isAuthReady) {
    return (
      <SafeAreaProvider>
        <LoadingScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <BottomBarProvider>
        <NavigationContainer>
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
          </Stack.Navigator>
        </NavigationContainer>
      </BottomBarProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    marginTop: 100, // push content down from dead center
  },
  loadingLogo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  loadingBrand: {
    fontSize: 36,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  loadingTagline: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 6,
    letterSpacing: 1.2,
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
