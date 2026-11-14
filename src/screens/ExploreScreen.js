import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  Dimensions,
  FlatList,
  ScrollView,
  TextInput,
  BackHandler,
  Modal,
  Animated,
  Easing,
  ActivityIndicator,
  AppState,
  Linking,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
// expo-image: shares the disk/memory cache the startup preload fills.
import { Image } from 'expo-image';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import {
  PlaceTile,
  NextTripCarousel,
  NearbyPlaceCard,
  NextTripCardSkeleton,
  TileRowSkeleton,
  NearbyRowSkeleton,
} from '../components';
import {
  searchPlaces,
  getCurrentLocation,
  getLocationPermission,
  getNearbyPlaces,
  reverseGeocode,
  getMyTrips,
  getFavourites,
  useMyPhoto,
} from '../services';
import { NEARBY_CARD_HEIGHT } from '../components/NearbyPlaceCard';
import { peekPreloaded, takePreloaded } from '../services/homePreload';
import { API_URL } from '../config';
import useAuth from '../hooks/useAuth';
import { pickActiveTrips, daysUntil, dayCount } from '../utils/tripDates';
import { LinearGradient } from 'expo-linear-gradient';
import { initialsFor } from '../components/TripStackCard';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import { useBottomBar } from '../context/BottomBarContext';
import UnfinishedTripCard from '../components/UnfinishedTripCard';
import CommunityHighlights from '../components/CommunityHighlights';
import LocationSheet from '../components/LocationSheet';
import { getExploreCity, setExploreCity } from '../services/exploreCity';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Home's background, top to bottom: a light slate tint, alpine frost, then
// near white.
const PAGE_GRADIENT = ['#E1E9F0', COLORS.backgroundWarm, '#FAFBFC'];

// Popular destinations: wide landscape cards, one per swipe; they slide on
// by themselves every few seconds, and wait a while after you swipe.
const POPULAR_AUTO_SLIDE_MS = 4500;
const POPULAR_PAUSE_MS = 9000;
// As wide as the side padding, so the previous card is fully off screen.
const CARD_GAP = SIZES.spacing_lg;
// Narrow enough that the next card clearly peeks in (~24px), hinting at the swipe.
const CARD_WIDTH = SCREEN_WIDTH - SIZES.spacing_lg * 2 - 36;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 0.6);

const RECENT_SEARCHES_KEY = 'wayraa_recent_searches';
// Scroll this far in one direction before the tab bar hides / returns.
const SCROLL_SLOP = 12;


const CATEGORIES = [
  {
    id: '1',
    name: 'Beaches',
    theme: 'beaches',
    icon: '🏖️',
    image: 'https://images.pexels.com/photos/1032650/pexels-photo-1032650.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '2',
    name: 'Mountains',
    theme: 'mountains',
    icon: '🏔️',
    image: 'https://images.pexels.com/photos/417173/pexels-photo-417173.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '3',
    name: 'Cities',
    theme: 'cities',
    icon: '🌆',
    image: 'https://images.pexels.com/photos/466685/pexels-photo-466685.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '4',
    name: 'Historical',
    theme: 'historical',
    icon: '🏛️',
    image: 'https://images.pexels.com/photos/2225442/pexels-photo-2225442.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '5',
    name: 'Islands',
    theme: 'islands',
    icon: '🏝️',
    image: 'https://images.pexels.com/photos/1450353/pexels-photo-1450353.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '6',
    name: 'Wildlife',
    theme: 'wildlife',
    icon: '🦁',
    image: 'https://images.pexels.com/photos/247502/pexels-photo-247502.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
];

const POPULAR_DESTINATIONS = [
  {
    id: '1',
    name: 'Bali',
    country: 'Indonesia',
    rating: 4.8,
    reviews: 256,
    image: 'https://images.pexels.com/photos/2166559/pexels-photo-2166559.jpeg?auto=compress&cs=tinysrgb&w=1000',
  },
  {
    id: '2',
    name: 'Santorini',
    country: 'Greece',
    rating: 5.0,
    reviews: 143,
    image: 'https://images.pexels.com/photos/1010657/pexels-photo-1010657.jpeg?auto=compress&cs=tinysrgb&w=1000',
  },
  {
    id: '3',
    name: 'Kyoto',
    country: 'Japan',
    rating: 4.9,
    reviews: 198,
    image: 'https://images.pexels.com/photos/1440476/pexels-photo-1440476.jpeg?auto=compress&cs=tinysrgb&w=1000',
  },
  {
    id: '4',
    name: 'Machu Picchu',
    country: 'Peru',
    rating: 4.9,
    reviews: 312,
    image: 'https://images.pexels.com/photos/2929906/pexels-photo-2929906.jpeg?auto=compress&cs=tinysrgb&w=1000',
  },
  {
    id: '5',
    name: 'Cape Town',
    country: 'South Africa',
    rating: 4.7,
    reviews: 167,
    image: 'https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=1000',
  },
];

/** Fixed photos on the home page, cached during the startup logo screen. */
export const HOME_STATIC_IMAGES = [
  ...POPULAR_DESTINATIONS.map((d) => d.image),
  ...CATEGORIES.map((c) => c.image),
].filter(Boolean);

/**
 * ExploreScreen - Main home screen with search, destinations, and journals.
 */
// Example searches the Home search pill cycles through (every ~3s).
const SEARCH_HINTS = ['Search destinations, stays & more', 'Try "Goa"', 'Try "Kyoto"', 'Try "Swiss Alps"'];

export default function ExploreScreen({ route, navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  // The query the current results are for (null while a search is running),
  // so "No results" only shows once a search has actually come back empty.
  const [searchedFor, setSearchedFor] = useState(null);
  const searchSeq = useRef(0);
  // Rows start filled when the startup preload already has them.
  const [nearbyPlaces, setNearbyPlaces] = useState(() => peekPreloaded('nearby')?.places || []);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // Id of the popular-destination card currently resolving its placeId (tap feedback).
  const [resolvingCardId, setResolvingCardId] = useState(null);
  const [locationDenied, setLocationDenied] = useState(false);
  // Denied and the OS won't show the prompt again: only Settings can fix it.
  const [locationBlocked, setLocationBlocked] = useState(false);
  const [journals, setJournals] = useState(() => peekPreloaded('journals') || []);
  // True until the journals request has finished once, so the row shows a
  // skeleton instead of a misleading "No journals yet".
  const [journalsLoading, setJournalsLoading] = useState(() => !peekPreloaded('journals'));
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const { user: firebaseUser, isAuthenticated, isAuthReady } = useAuth();
  const routeUser = route?.params?.user;
  const user = firebaseUser || routeUser;

  // Profile avatar: prefer the Firebase photo, else initials of the display
  // name (or email).
  // Updates live when you change it on the Profile page.
  const profilePhoto = useMyPhoto(firebaseUser?.photoURL || routeUser?.photoUrl);
  const profileName = firebaseUser?.displayName || routeUser?.name || firebaseUser?.email || '';


  const firstName = (profileName || '').trim().split(' ')[0];

  // Slim search pill: the hint rotates through a few example searches.
  const [hintIndex, setHintIndex] = useState(0);
  const hintFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(hintFade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setHintIndex((i) => (i + 1) % SEARCH_HINTS.length);
        Animated.timing(hintFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      });
    }, 3200);
    return () => clearInterval(timer);
  }, [hintFade]);

  // Collapsing header: greeting + location chip shrink away on scroll down,
  // leaving a compact bar (search pill + small avatar); they expand back on
  // scroll up.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const headerAnim = useRef(new Animated.Value(0)).current; // 0 = expanded, 1 = collapsed

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: headerCollapsed ? 1 : 0,
      duration: 420,
      easing: Easing.out(Easing.cubic), // gentle, decelerating
      useNativeDriver: false, // animating height
    }).start();
  }, [headerCollapsed, headerAnim]);

  // Tab bar: slides away while you scroll down, back as soon as you scroll
  // up (or near the top). Small jitters under SCROLL_SLOP are ignored.
  const { setHidden: setTabBarHidden } = useBottomBar();
  const tabBarHiddenRef = useRef(false);
  const lastScrollY = useRef(0);
  const setTabBarHiddenOnce = useCallback((hide) => {
    if (tabBarHiddenRef.current === hide) return;
    tabBarHiddenRef.current = hide;
    setTabBarHidden(hide);
  }, [setTabBarHidden]);

  // Always bring it back when leaving Home.
  useFocusEffect(useCallback(() => () => setTabBarHiddenOnce(false), [setTabBarHiddenOnce]));

  const [headerSolid, setHeaderSolid] = useState(false);
  const handleContentScroll = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const y = contentOffset.y;
    // Header turns solid the moment content can slide under it.
    if ((y > 2) !== headerSolid) setHeaderSolid(y > 2);
    // Collapse on scroll down; expand a bit before reaching the top so the
    // header is fully open before the content reaches its natural start position.
    if (y > 60 && !headerCollapsed) setHeaderCollapsed(true);
    else if (y <= 55 && headerCollapsed) setHeaderCollapsed(false);

    // Ignore the bounce past the bottom edge (it reads as scrolling up).
    const maxY = contentSize.height - layoutMeasurement.height;
    if (y > maxY) return;
    const dy = y - lastScrollY.current;
    if (y < 80) {
      setTabBarHiddenOnce(false);
      lastScrollY.current = y;
    } else if (Math.abs(dy) > SCROLL_SLOP) {
      setTabBarHiddenOnce(dy > 0);
      lastScrollY.current = y;
    }
  };

  // Detected nearby location label (reverse-geocoded), shown as a chip.
  const [nearbyLabel, setNearbyLabel] = useState(() => peekPreloaded('nearby')?.label || null);
  // Where "Near you" was looked up (passed on to its See all list).
  const [nearbyCoords, setNearbyCoords] = useState(() => peekPreloaded('nearby')?.loc || null);

  // A city chosen in the location sheet ("Exploring · Goa"), or null for
  // where you really are; and the name of where you really are, for the sheet.
  const [exploring, setExploring] = useState(null);
  const [gpsLabel, setGpsLabel] = useState(() => peekPreloaded('nearby')?.label || null);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);

  // Load "Near you" around a point: your location fix, or a chosen city
  // (`cityName` given: no need to look its name up).
  const applyLocation = useCallback(async (loc, cityName = null) => {
    setNearbyLoading(true);
    setLocationDenied(false);
    setLocationBlocked(false);
    const [places, label] = await Promise.all([
      getNearbyPlaces(loc.lat, loc.lng),
      cityName ? Promise.resolve(cityName) : reverseGeocode(loc.lat, loc.lng),
    ]);
    setNearbyPlaces(places);
    if (label) setNearbyLabel(label);
    if (label && !cityName) setGpsLabel(label);
    setNearbyCoords({ lat: loc.lat, lng: loc.lng });
    setNearbyLoading(false);
  }, []);

  // On launch: ask once if the phone has never been asked; if already allowed,
  // load nearby places straight away (no prompt, no tap needed).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Already loaded during the logo screen: use it as is.
      const preloaded = takePreloaded('nearby');
      const [pre, city] = await Promise.all([preloaded || null, getExploreCity()]);
      if (cancelled) return;
      // Exploring a city you picked before: Near you is around it.
      if (city) {
        if (pre?.label) setGpsLabel(pre.label);
        setExploring(city);
        applyLocation({ lat: city.lat, lng: city.lng }, city.name);
        return;
      }
      if (pre) {
        setNearbyPlaces(pre.places);
        if (pre.label) setNearbyLabel(pre.label);
        setNearbyCoords({ lat: pre.loc.lat, lng: pre.loc.lng });
        return;
      }
      const loc = await getCurrentLocation();
      if (cancelled) return;
      if (loc.granted) {
        applyLocation(loc);
      } else if (loc.status === 'denied') {
        setLocationDenied(true);
        setLocationBlocked(!loc.canAskAgain);
      }
    })();
    return () => { cancelled = true; };
  }, [applyLocation]);

  // Coming back from Settings with location now allowed: load without a tap.
  useEffect(() => {
    if (!locationDenied) return undefined;
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      const perm = await getLocationPermission();
      if (!perm.granted) return;
      const loc = await getCurrentLocation();
      if (loc.granted) applyLocation(loc);
    });
    return () => sub.remove();
  }, [locationDenied, applyLocation]);

  // Signed-in extras: the featured trip and the latest favourites. Refreshed
  // whenever the tab regains focus so new trips/favourites show up right away.
  // Any failure just hides the section, since both are optional extras.
  const [activeTrips, setActiveTrips] = useState(() => {
    const trips = peekPreloaded('trips');
    return trips ? pickActiveTrips(trips) : [];
  });

  // Greeting subline about your next trip: "Kyoto in 9 days", "Day 3 in
  // Osaka", "Goa starts today", else "Where to next?". Tapping it opens the trip.
  // Uses the first active trip that has dates and isn't already over (a trip
  // still marked ongoing after its end date, or a draft without dates, is
  // skipped rather than hiding the line).
  const lineFor = (trip) => {
    if (!trip?.startDate) return null;
    const place = trip.primaryDestination || trip.name;
    const until = daysUntil(trip.startDate);
    if (until === null) return null;
    // bold + rest: the chip's line, e.g. "3 days" + " to Rameshwaram".
    if (until > 0) {
      return {
        text: `${place} in ${until} ${until === 1 ? 'day' : 'days'}`,
        bold: `${until} ${until === 1 ? 'day' : 'days'}`, rest: ` to ${place}`,
        short: `${until}d`, place,
      };
    }
    if (until === 0) return { text: `${place} starts today`, bold: place, rest: ' starts today', short: 'Today', place };
    const total = dayCount(trip.startDate, trip.endDate);
    const dayNo = 1 - until;
    if (!total || dayNo > total) return null; // over (or no end date to count from)
    return { text: `Day ${dayNo} in ${place}`, bold: `Day ${dayNo}`, rest: ` of ${total} in ${place}`, short: `Day ${dayNo}`, place };
  };
  let headlineTrip = null;
  let tripLine = null;
  for (const trip of activeTrips) {
    const line = lineFor(trip);
    if (line) { headlineTrip = trip; tripLine = line; break; }
  }
  // Avatar used in the greeting row (48) and the collapsed bar (40): a thin
  // orange ring around your photo, or white initials on the brand navy
  // gradient. No shadow: on iOS a shadow on an image/clipped view is drawn
  // around its square box, not the circle.
  const renderAvatar = (size) => {
    const outer = { width: size, height: size, borderRadius: size / 2 };
    const innerSize = size - 6; // 2px ring + 1px gap on each side
    const inner = { width: innerSize, height: innerSize, borderRadius: innerSize / 2 };
    if (!isAuthenticated) {
      return (
        <View style={[styles.avatarRing, styles.avatarRingGuest, outer]}>
          <Ionicons name="person-outline" size={size * 0.45} color={COLORS.primary} />
        </View>
      );
    }
    return (
      <View style={[styles.avatarRing, outer]}>
        {profilePhoto ? (
          <Image source={{ uri: profilePhoto }} style={[styles.avatarInner, inner]} />
        ) : (
          <LinearGradient
            colors={[COLORS.primary, COLORS.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.avatarInner, inner]}
          >
            <Text style={[styles.avatarInitials, { fontSize: size * 0.34 }]}>{initialsFor(profileName)}</Text>
          </LinearGradient>
        )}
      </View>
    );
  };

  const openHeadlineTrip = () => {
    if (!headlineTrip) return;
    navigation.navigate('MyTrips', {
      screen: 'TripDetail',
      params: { tripId: headlineTrip.id, tripName: headlineTrip.name },
      initial: false,
    });
  };
  const [favourites, setFavourites] = useState(() => (peekPreloaded('favourites') || []).slice(0, 8));
  // True once each request has finished (success or failure) at least once,
  // so skeletons show only on the first load, not on every refocus refresh.
  const [tripsLoaded, setTripsLoaded] = useState(() => !!peekPreloaded('trips'));
  const [favsLoaded, setFavsLoaded] = useState(() => !!peekPreloaded('favourites'));

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady) return undefined;
      if (!isAuthenticated) {
        setActiveTrips([]);
        setFavourites([]);
        setTripsLoaded(false);
        setFavsLoaded(false);
        return undefined;
      }

      let cancelled = false;

      (async () => {
        try {
          // First load uses the startup preload when it worked.
          const trips = (await takePreloaded('trips')) || await getMyTrips();
          if (cancelled) return;
          setActiveTrips(pickActiveTrips(trips));
          setTripsLoaded(true);
        } catch (e) {
          if (!cancelled) setActiveTrips([]);
        } finally {
          if (!cancelled) setTripsLoaded(true);
        }
      })();

      (async () => {
        try {
          const favs = (await takePreloaded('favourites')) || await getFavourites();
          if (cancelled) return;
          const latest = favs.slice(0, 8);
          setFavourites(latest);
          setFavsLoaded(true);
        } catch (e) {
          if (!cancelled) setFavourites([]);
        } finally {
          if (!cancelled) setFavsLoaded(true);
        }
      })();

      return () => { cancelled = true; };
    }, [isAuthReady, isAuthenticated])
  );

  const openTrip = (trip) => {
    // Trips live in the My Trips tab; keep its list underneath so back works.
    navigation.getParent()?.navigate('MyTrips', {
      screen: 'TripDetail',
      params: { tripId: trip.id, tripName: trip.name },
      initial: false,
    });
  };

  const openFavourite = (fav) => {
    navigation.navigate('PlaceDetail', {
      placeId: fav.placeId,
      name: fav.placeName,
      vicinity: fav.vicinity,
      photoUrl: placePhotoUrl(fav.placeId, 800) || normalizePhotoUrl(fav.photoUrl, 800),
      rating: fav.rating,
      category: fav.category,
    });
  };

  const handleProfilePress = () => {
    if (isAuthenticated) {
      // Profile: account, stats, settings and log out.
      navigation.navigate('Profile');
    } else {
      // Guest: send them to the auth flow.
      navigation.navigate('Welcome');
    }
  };


  // Android back on Home: close search if it's open, otherwise stay here (so
  // back never returns to the Welcome / Login screens). Only while Home itself
  // is showing: this tab stays mounted underneath the screens opened from it
  // (destination, place, trip), and there back must work normally.
  useFocusEffect(
    useCallback(() => {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isSearchActive) closeSearch();
        return true;
      });
      return () => backHandler.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSearchActive])
  );

  // Load recent searches and journals on mount
  useEffect(() => {
    loadRecentSearches();
    loadJournals();
  }, []);

  // Backfill a placeId for older text-only recent searches (placeId === null)
  // by looking one up from the name. Photos are then built from the placeId.
  useEffect(() => {
    const needsId = recentSearches
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => s && typeof s === 'object' && !s.placeId && s.name);
    if (needsId.length === 0) return;

    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        needsId.map(async ({ s, index }) => ({ index, placeId: await resolvePlaceId(s.name) }))
      );
      if (cancelled) return;

      const idByIndex = {};
      resolved.forEach((r) => {
        if (r.placeId) idByIndex[r.index] = r.placeId;
      });
      if (Object.keys(idByIndex).length === 0) return;

      setRecentSearches((prev) => {
        let changed = false;
        const updated = prev.map((s, i) => {
          const placeId = idByIndex[i];
          if (!placeId || !s || typeof s !== 'object' || s.placeId) return s;
          changed = true;
          return { ...s, placeId };
        });
        if (!changed) return prev;
        AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
        return updated;
      });
    })();

    return () => { cancelled = true; };
  }, [recentSearches]);

  // Resolve a placeId from a free-text name using the search endpoint.
  const resolvePlaceId = async (name) => {
    if (!name) return null;
    try {
      const results = await searchPlaces(name.trim());
      return results?.[0]?.placeId || null;
    } catch (e) {
      console.log('resolvePlaceId error:', e);
      return null;
    }
  };

  const loadRecentSearches = async () => {
    try {
      const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {}
  };

  const loadJournals = async () => {
    try {
      const preloaded = await takePreloaded('journals');
      if (preloaded) {
        setJournals(preloaded);
        return;
      }
      const response = await fetch(`${API_URL}/Journals/feed`);
      if (response.ok) {
        const data = await response.json();
        setJournals(data.slice(0, 6));
      }
    } catch (e) {
      console.log('Failed to load journals:', e);
    } finally {
      setJournalsLoading(false);
    }
  };

  // "Enable Location" card: prompt if the OS still allows it, otherwise open
  // the app's page in Settings (iOS never shows the prompt a second time).
  const loadNearbyPlaces = async () => {
    if (locationBlocked) {
      Linking.openSettings();
      return;
    }
    setNearbyLoading(true);
    const location = await getCurrentLocation();
    if (!location.granted) {
      setLocationDenied(true);
      setLocationBlocked(!location.canAskAgain);
      setNearbyLoading(false);
      return;
    }
    await applyLocation(location);
  };

  // Location sheet: back to where you are, or explore a city.
  const useCurrentLocation = async () => {
    setLocationSheetOpen(false);
    setExploring(null);
    await setExploreCity(null);
    loadNearbyPlaces();
  };
  const exploreCity = async (city) => {
    setLocationSheetOpen(false);
    setExploring(city);
    await setExploreCity(city);
    applyLocation({ lat: city.lat, lng: city.lng }, city.name);
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const openSearch = () => {
    setIsSearchActive(true);
  };

  const closeSearch = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchSeq.current += 1; // ignore a search still on its way
    setIsSearchActive(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearchedFor(null);
  };

  // Search now; only the latest search's results are kept.
  const runSearch = async (query) => {
    const seq = ++searchSeq.current;
    setSearchedFor(null);
    const results = await searchPlaces(query);
    if (seq !== searchSeq.current) return;
    setSearchResults(results);
    setSearchedFor(query);
  };

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (text.trim().length > 1) {
      // Debounced real-time search via Google Places
      setSearchedFor(null);
      searchTimeoutRef.current = setTimeout(() => runSearch(text.trim()), 300);
    } else {
      searchSeq.current += 1;
      setSearchResults([]);
      setSearchedFor(null);
    }
  };

  // The keyboard's Search button: stay on the search screen. Search right
  // away (no waiting for the typing pause) and put the keyboard away, so the
  // results, or "No results", are in view.
  const handleSearchSubmit = () => {
    const query = searchQuery.trim();
    Keyboard.dismiss();
    if (query.length < 2) return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (searchedFor !== query) runSearch(query);
  };

  // Persist a tapped place into recent searches (fire-and-forget). Its photo
  // is built from the placeId when the row renders, so nothing to look up.
  const persistRecentSearch = async (item) => {
    const entry = { name: item.name, placeId: item.placeId, secondary: item.secondary || '' };
    const stored = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    const existing = stored ? JSON.parse(stored) : [];
    const updated = [entry, ...existing.filter(s => s.placeId !== item.placeId)].slice(0, 8);
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  // Open the destination detail screen for a place with a known placeId.
  const openDestination = (item) => {
    navigation.navigate('DestinationDetail', {
      placeId: item.placeId,
      name: item.name,
      secondary: item.secondary || '',
    });
  };

  // "See all" on Near You: the full list of places around you.
  const openNearbyAll = () => {
    navigation.navigate('NearbyPlaces', {
      coords: nearbyCoords,
      label: nearbyLabel,
      places: nearbyPlaces,
    });
  };

  const handleResultTap = (item) => {
    if (!item?.placeId) return;
    closeSearch();
    openDestination(item);
    // Save to recent searches in the background (don't block navigation).
    persistRecentSearch(item).catch(() => {});
  };

  const handleRecentSearchTap = (item) => {
    // Newer recent entries carry a placeId → open the destination directly.
    if (item && typeof item === 'object' && item.placeId) {
      closeSearch();
      openDestination(item);
      return;
    }
    // Older text-only entries: fall back to re-running the search.
    const query = typeof item === 'string' ? item : item.name;
    setSearchQuery(query);
    handleSearch(query);
  };

  // Tapping a (hardcoded) popular destination resolves its placeId from the
  // name — the same lookup a typed search uses — then opens the destination
  // detail/results screen, exactly like tapping a search result.
  const handlePopularTap = async (card) => {
    if (resolvingCardId) return; // ignore taps while one is in flight
    setResolvingCardId(card.id);
    try {
      const query = `${card.name}${card.country ? `, ${card.country}` : ''}`;
      const results = await searchPlaces(query);
      const match = results?.[0];
      if (!match?.placeId) return;
      const place = {
        placeId: match.placeId,
        name: match.name || card.name,
        secondary: match.secondary || card.country || '',
      };
      openDestination(place);
      persistRecentSearch(place).catch(() => {});
    } catch (e) {
      console.log('handlePopularTap error:', e);
    } finally {
      setResolvingCardId(null);
    }
  };

  const [popularPage, setPopularPage] = useState(0);
  // Auto-slide: on to the next destination every few seconds (back to the
  // first after the last). Pauses for a while after you swipe, and while Home
  // isn't in view or search is open.
  const popularRef = useRef(null);
  const popularPausedUntil = useRef(0);
  const homeFocused = useIsFocused();
  useEffect(() => {
    if (!homeFocused || isSearchActive) return undefined;
    const timer = setInterval(() => {
      if (Date.now() < popularPausedUntil.current) return;
      setPopularPage((p) => {
        const next = (p + 1) % POPULAR_DESTINATIONS.length;
        popularRef.current?.scrollToOffset({ offset: next * (CARD_WIDTH + CARD_GAP), animated: true });
        return next;
      });
    }, POPULAR_AUTO_SLIDE_MS);
    return () => clearInterval(timer);
  }, [homeFocused, isSearchActive]);
  const renderPlaceCard = ({ item }) => {
    const isResolving = resolvingCardId === item.id;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={() => handlePopularTap(item)}
        disabled={!!resolvingCardId}
        accessibilityRole="button"
        accessibilityLabel={`Explore ${item.name}, ${item.country}`}
      >
        <Image source={{ uri: item.image }} style={styles.cardImage} contentFit="cover" transition={200} />
        {/* A soft fade at the bottom for the name (no hard bar). */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.65)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.cardOverlay}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.cardPlaceRow}>
            <Ionicons name="location" size={13} color="rgba(255,255,255,0.9)" />
            <Text style={styles.cardCountry} numberOfLines={1}>{item.country}</Text>
          </View>
        </View>
        {isResolving && (
          <View style={styles.cardLoadingOverlay}>
            <ActivityIndicator size="small" color={COLORS.white} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={PAGE_GRADIENT[0]} />
      {/* The page: a soft slate-to-white wash from top to bottom (stays put
          while the content scrolls over it). */}
      <LinearGradient colors={PAGE_GRADIENT} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />

      {/* Full Screen Search Modal */}
      <Modal
        visible={isSearchActive}
        animationType="slide"
        transparent={true}
        onRequestClose={closeSearch}
      >
        <View style={[styles.searchModal, { paddingTop: insets.top + SIZES.spacing_sm }]}>
          {/* Top bar: close button (top-left, Airbnb style) */}
          <View style={styles.searchTopBar}>
            <TouchableOpacity style={styles.searchCloseButton} onPress={closeSearch}>
              <Ionicons name="close" size={22} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Big title */}
          <Text style={styles.searchCardTitle}>Where to?</Text>

          {/* Large search field */}
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color={COLORS.textPrimary} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search destinations"
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={handleSearch}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Suggestions / Results fill the rest of the screen */}
          <ScrollView
            style={styles.searchSuggestions}
            contentContainerStyle={styles.searchSuggestionsContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
              {/* Recent Searches */}
              {searchQuery.length === 0 && recentSearches.length > 0 && (
                <>
                  <View style={styles.suggestionsHeader}>
                    <Text style={styles.suggestionsTitle}>Recent searches</Text>
                    <TouchableOpacity onPress={clearRecentSearches}>
                      <Text style={styles.clearText}>Clear all</Text>
                    </TouchableOpacity>
                  </View>
                  {recentSearches.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.suggestionItem}
                      onPress={() => handleRecentSearchTap(item)}
                    >
                      <View style={styles.suggestionIcon}>
                        <Ionicons name="time-outline" size={20} color={COLORS.textSecondary} />
                      </View>
                      <View style={styles.suggestionInfo}>
                        <Text style={styles.suggestionName}>{typeof item === 'string' ? item : item.name}</Text>
                        <Text style={styles.suggestionSub}>{typeof item === 'string' ? 'Recent search' : item.secondary || 'Recent search'}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Suggested destinations when empty */}
              {searchQuery.length === 0 && recentSearches.length === 0 && (
                <>
                  <Text style={styles.suggestionsTitle}>Suggested destinations</Text>
                  <TouchableOpacity style={styles.suggestionItem}>
                    <View style={[styles.suggestionIcon, { backgroundColor: 'rgba(63, 90, 115, 0.12)' }]}>
                      <Ionicons name="navigate" size={20} color={COLORS.primaryLight} />
                    </View>
                    <View style={styles.suggestionInfo}>
                      <Text style={styles.suggestionName}>Nearby</Text>
                      <Text style={styles.suggestionSub}>Find what's around you</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}

              {/* Search Results */}
              {searchResults.length > 0 && (
                <>
                  <Text style={styles.suggestionsTitle}>Destinations</Text>
                  {searchResults.map((item) => (
                    <TouchableOpacity key={item.placeId} style={styles.suggestionItem} onPress={() => handleResultTap(item)}>
                      <View style={styles.suggestionIcon}>
                        <Ionicons name="location-outline" size={20} color={COLORS.accent} />
                      </View>
                      <View style={styles.suggestionInfo}>
                        <Text style={styles.suggestionName}>{item.name}</Text>
                        <Text style={styles.suggestionSub} numberOfLines={1}>{item.secondary}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Searching… / No results (only after a search came back empty) */}
              {searchQuery.trim().length > 1 && searchResults.length === 0 && searchedFor === null && (
                <View style={styles.noResults}>
                  <ActivityIndicator size="small" color={COLORS.accent} />
                </View>
              )}
              {searchQuery.trim().length > 1 && searchResults.length === 0 && searchedFor === searchQuery.trim() && (
                <View style={styles.noResults}>
                  <Ionicons name="search-outline" size={36} color={COLORS.textMuted} />
                  <Text style={styles.noResultsTitle}>No results found</Text>
                  <Text style={styles.noResultsText}>
                    Nothing matches "{searchQuery.trim()}". Check the spelling or try a city, region or country.
                  </Text>
                </View>
              )}
            </ScrollView>
        </View>
      </Modal>

      {/* Main Content - starts below the floating header, scrolls up behind it */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: headerHeight || insets.top + 80 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleContentScroll}
        scrollEventThrottle={16}
      >
        {/* Popular Destinations */}
        <View style={[styles.section, styles.sectionFirst]}>
          <Text style={styles.sectionTitle}>Popular destinations</Text>
          <FlatList
            ref={popularRef}
            onScrollBeginDrag={() => { popularPausedUntil.current = Date.now() + POPULAR_PAUSE_MS; }}
            data={POPULAR_DESTINATIONS}
            renderItem={renderPlaceCard}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            contentContainerStyle={styles.cardsContainer}
            scrollEventThrottle={32}
            onScroll={(e) => {
              const page = Math.round(e.nativeEvent.contentOffset.x / (CARD_WIDTH + CARD_GAP));
              if (page !== popularPage) setPopularPage(page);
            }}
          />
          {/* Which card you're on. */}
          <View style={styles.cardDots} accessibilityLabel={`Destination ${popularPage + 1} of ${POPULAR_DESTINATIONS.length}`}>
            {POPULAR_DESTINATIONS.map((d, i) => (
              <View key={d.id} style={[styles.cardDot, i === popularPage && styles.cardDotOn]} />
            ))}
          </View>
        </View>

        {/* Trips you started creating but didn't finish, after the destinations. */}
        {isAuthenticated && <UnfinishedTripCard navigation={navigation} style={styles.unfinishedTrip} />}

        {/* From the community: real travellers' stories, early on the page. */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.communityHeading}>
              <Text style={styles.sectionHeaderTitle}>From the community</Text>
              <Text style={styles.communitySub}>Real trips from Wayraa travellers</Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('Community', { screen: 'CommunityHome' })}
              accessibilityRole="button"
              accessibilityLabel="See all community stories"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          <CommunityHighlights journals={journals} loading={journalsLoading} navigation={navigation} />
        </View>

        {/* Near You */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {exploring ? `Around ${exploring.name}` : 'Near you'}
            {!exploring && nearbyLabel ? <Text style={styles.sectionTitleSub}>{`  ·  ${nearbyLabel}`}</Text> : null}
          </Text>
          {nearbyPlaces.length > 0 ? (
            <FlatList
              data={[...nearbyPlaces.slice(0, 5), { id: 'show-all', isShowAll: true }]}
              keyExtractor={(item) => item.placeId || item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardsContainer}
              renderItem={({ item }) => {
                if (item.isShowAll) {
                  // A 2x2 mosaic of the places not shown in the row hints at
                  // what's behind it (falls back to the first ones).
                  const extra = nearbyPlaces.slice(5).map((p) => p.photoUrl).filter(Boolean);
                  const mosaic = (extra.length >= 4 ? extra : nearbyPlaces.map((p) => p.photoUrl).filter(Boolean)).slice(0, 4);
                  return (
                    <TouchableOpacity
                      style={styles.showAllCard}
                      onPress={openNearbyAll}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel="See all places near you"
                    >
                      <View style={styles.showAllMosaic}>
                        {mosaic.map((uri, i) => (
                          <Image key={i} source={{ uri }} style={styles.showAllTile} contentFit="cover" transition={150} />
                        ))}
                      </View>
                      <LinearGradient
                        colors={['rgba(43, 63, 81, 0.55)', 'rgba(43, 63, 81, 0.85)']}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.showAllBody}>
                        <View style={styles.showAllArrow}>
                          <Ionicons name="arrow-forward" size={20} color={COLORS.primary} />
                        </View>
                        <Text style={styles.showAllText}>See all</Text>
                        <Text style={styles.showAllSub} numberOfLines={2}>
                          {nearbyLabel ? `Places around ${nearbyLabel}` : 'More places near you'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }
                return (
                  <NearbyPlaceCard
                    place={item}
                    onPress={() => navigation.navigate('PlaceDetail', {
                      placeId: item.placeId,
                      name: item.name,
                      vicinity: item.vicinity,
                      photoUrl: item.photoUrl,
                      rating: item.rating,
                    })}
                  />
                );
              }}
            />
          ) : nearbyLoading ? (
            <NearbyRowSkeleton />
          ) : (
            <TouchableOpacity style={styles.locationCard} onPress={loadNearbyPlaces}>
              <Ionicons name="location-outline" size={24} color={COLORS.accent} />
              <View style={styles.locationCardContent}>
                <Text style={styles.locationCardTitle}>{locationDenied ? 'Location Denied' : 'Enable Location'}</Text>
                <Text style={styles.locationCardSubtitle}>
                  {locationBlocked
                    ? 'Tap to open Settings and allow location'
                    : locationDenied
                      ? 'Tap to allow location access'
                      : 'Find destinations near you'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Explore by Category */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Explore by Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.slice(0, 4).map((category) => (
              <TouchableOpacity
                key={category.id}
                style={styles.categoryCard}
                activeOpacity={0.85}
                onPress={() =>
                  navigation.navigate('CategoryResults', {
                    theme: category.theme,
                    title: category.name,
                    // Exploring a city: its "near you" row is around that city.
                    near: exploring ? { lat: exploring.lat, lng: exploring.lng, label: exploring.name } : undefined,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Explore ${category.name}`}
              >
                <Image source={{ uri: category.image }} style={styles.categoryImage} />
                <View style={styles.categoryOverlay}>
                  <Text style={styles.categoryName}>{category.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Your trips (signed in). Placed lower on the page so it has finished
            loading by the time the user scrolls to it. */}
        {isAuthenticated && !tripsLoaded && activeTrips.length === 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your trips</Text>
            <NextTripCardSkeleton />
          </View>
        )}
        {activeTrips.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your trips</Text>
            <NextTripCarousel
              trips={activeTrips}
              getImageUri={(trip) =>
                placePhotoUrl(trip.primaryPlaceId, 800)
                || normalizePhotoUrl(trip.coverPhotoUrl, 800)
              }
              onPressTrip={openTrip}
            />
          </View>
        )}

        {/* Recently Explored (only if there is history) */}
        {recentSearches.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderTitle}>Recently explored</Text>
              <TouchableOpacity
                onPress={clearRecentSearches}
                accessibilityRole="button"
                accessibilityLabel="Clear recently explored"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.seeAllText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tileRow}
            >
              {recentSearches.slice(0, 8).map((item, index) => {
                const entry = typeof item === 'string' ? { name: item } : item;
                return (
                  <PlaceTile
                    key={entry.placeId || `${entry.name}-${index}`}
                    title={entry.name}
                    subtitle={entry.secondary}
                    imageUri={placePhotoUrl(entry.placeId, 400) || normalizePhotoUrl(entry.imageUrl, 400)}
                    onPress={() => {
                      if (entry.placeId) {
                        openDestination(entry);
                      } else {
                        openSearch();
                        setTimeout(() => handleRecentSearchTap(item), 150);
                      }
                    }}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* From your favourites (signed in, only if there are any) */}
        {isAuthenticated && !favsLoaded && favourites.length === 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderTitle}>From your favourites</Text>
            </View>
            <TileRowSkeleton label="Loading your favourites" />
          </View>
        )}
        {favourites.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderTitle}>From your favourites</Text>
              <TouchableOpacity
                onPress={() => navigation.getParent()?.navigate('Favorites')}
                accessibilityRole="button"
                accessibilityLabel="See all favourites"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tileRow}
            >
              {favourites.map((fav) => (
                <PlaceTile
                  key={fav.placeId}
                  title={fav.placeName}
                  subtitle={fav.vicinity}
                  imageUri={placePhotoUrl(fav.placeId, 400) || normalizePhotoUrl(fav.photoUrl, 400)}
                  rating={fav.rating}
                  onPress={() => openFavourite(fav)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Header: open, straight on the frost page (no panel or shadow). The
          greeting scrolls away; the search pill stays pinned at the top, with
          a hairline under it once the page has scrolled. Rendered after the
          ScrollView so it floats on top. */}
      <View
        style={[styles.searchContainer, headerSolid && styles.searchContainerSolid, headerCollapsed && styles.searchContainerPinned]}
        onLayout={(e) => {
          // Only capture the EXPANDED height (ignore shrinking frames while
          // collapsing) so the content's top padding stays stable and doesn't
          // jump during the animation.
          if (!headerCollapsed) {
            const h = e.nativeEvent.layout.height;
            setHeaderHeight((prev) => (h > prev ? h : prev));
          }
        }}
      >

        {/* Foreground content (greeting, next trip, search). */}
        <View style={[styles.headerForeground, { paddingTop: insets.top + SIZES.spacing_base }]}>
          {/* Greeting row (text + profile) — collapses away on scroll down. */}
          <Animated.View
            style={{
              opacity: headerAnim.interpolate({ inputRange: [0, 0.8], outputRange: [1, 0], extrapolate: 'clamp' }),
              // Room for the greeting plus the countdown block; collapses to 0.
              maxHeight: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [150, 0] }),
              marginBottom: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [SIZES.spacing_base, 0] }),
              transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
              overflow: 'hidden',
            }}
          >
            {/* Top bar: your location (tap: places near you, or turn location
                on), and your profile. */}
            <View style={styles.greetingRow}>
              <TouchableOpacity
                style={styles.locationWrap}
                onPress={() => setLocationSheetOpen(true)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={exploring
                  ? `Exploring ${exploring.name}. Change location`
                  : `Your location${nearbyLabel ? `, ${nearbyLabel}` : ''}. Change location`}
              >
                <View style={styles.glassCircle}>
                  <Ionicons name="navigate-outline" size={16} color={COLORS.primaryLight} />
                </View>
                <View style={styles.locationText}>
                  <Text style={styles.locationKicker}>{exploring ? 'Exploring' : 'Your location'}</Text>
                  <View style={styles.locationRow}>
                    <Ionicons name={exploring ? 'compass' : 'location'} size={13} color={COLORS.primaryLight} />
                    <Text style={styles.locationName} numberOfLines={1}>
                      {exploring ? exploring.name : (nearbyLabel || (locationDenied ? 'Turn on location' : 'Finding you…'))}
                    </Text>
                    <Ionicons name="chevron-forward" size={13} color={COLORS.textSecondary} />
                  </View>
                </View>
              </TouchableOpacity>
              {/* Exploring a city: × goes back to where you are. */}
              {!!exploring && (
                <TouchableOpacity
                  style={styles.exploreClear}
                  onPress={useCurrentLocation}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Stop exploring ${exploring.name}, use my location`}
                >
                  <Ionicons name="close" size={14} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}

              {/* Your next trip, compact: "✈ 3d · Rameshwaram". Tap opens it. */}
              {tripLine && (
                <TouchableOpacity
                  style={styles.tripChip}
                  onPress={openHeadlineTrip}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${tripLine.text}. Open trip`}
                >
                  <Ionicons name="airplane" size={11} color={COLORS.accent} />
                  <Text style={styles.tripChipText} numberOfLines={1}>
                    <Text style={styles.tripChipBold}>{tripLine.short}</Text>
                    {` · ${tripLine.place}`}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.profileButton, tripLine && styles.profileButtonAfterChip]}
                activeOpacity={0.85}
                onPress={handleProfilePress}
                accessibilityRole="button"
                accessibilityLabel={isAuthenticated ? 'Open profile' : 'Log in'}
              >
                {renderAvatar(44)}
              </TouchableOpacity>
            </View>

            {/* The question: "Hi Prabhat, where do you want to go today?" */}
            <Text style={styles.headline} accessibilityRole="header">
              Hi <Text style={styles.headlineName}>{(isAuthenticated && firstName) || 'traveller'}</Text>, where do you want to go today?
            </Text>
          </Animated.View>

          {/* Search row: slim pill, plus a small avatar that slides in when the
              header collapses (so the profile stays one tap away). */}
          <View style={styles.searchRow}>
            <TouchableOpacity
              style={styles.homeSearchBar}
              activeOpacity={0.9}
              onPress={openSearch}
              accessibilityRole="search"
              accessibilityLabel="Search destinations, stays and more"
            >
              <Ionicons name="search" size={19} color={COLORS.primaryLight} />
              <Animated.Text style={[styles.searchHint, { opacity: hintFade }]} numberOfLines={1}>
                {SEARCH_HINTS[hintIndex]}
              </Animated.Text>
            </TouchableOpacity>
            {/* Plan a new trip: always one tap away (pinned with the search).
                Create trip opens with a destination to search for. */}
            <TouchableOpacity
              style={styles.newTripButton}
              onPress={() => navigation.navigate('CreateTrip')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Plan a new trip"
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Ionicons name="add" size={18} color={COLORS.white} />
              <Text style={styles.newTripText}>New trip</Text>
            </TouchableOpacity>
            <Animated.View
              style={{
                width: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }),
                marginLeft: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, SIZES.spacing_sm] }),
                opacity: headerAnim.interpolate({ inputRange: [0.75, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
                overflow: 'hidden',
              }}
              pointerEvents={headerCollapsed ? 'auto' : 'none'}
            >
              <TouchableOpacity
                onPress={handleProfilePress}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={isAuthenticated ? 'Open profile' : 'Log in'}
              >
                {renderAvatar(40)}
              </TouchableOpacity>
            </Animated.View>
          </View>

        </View>
      </View>

      <LocationSheet
        visible={locationSheetOpen}
        currentLabel={gpsLabel}
        exploring={exploring}
        onUseCurrent={useCurrentLocation}
        onPickCity={exploreCity}
        onClose={() => setLocationSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm, // alpine frost (60%), under the gradient
  },
  scrollView: {
    flex: 1,
  },
  // NOTE: the ScrollView's top padding is applied inline (insets.top + header
  // height) so content starts below the floating header but can still scroll
  // up behind the transparent pill/circle.

  // Header bar: a solid panel anchored to the top (covers the status-bar area
  // too) with rounded bottom corners, holding the search bar + profile icon so
  // they don't look like they're floating over the content.
  searchContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    // See-through while open, so the page's gradient runs behind it.
    backgroundColor: 'transparent',
  },
  // Scrolled: the gradient's top colour, so content passes cleanly under it.
  searchContainerSolid: {
    backgroundColor: PAGE_GRADIENT[0],
  },
  // Pinned (collapsed): plus a hairline under the search pill.
  searchContainerPinned: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  // Carries the header's padding.
  headerForeground: {
    paddingTop: 0,
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_md,
  },
  // Greeting row: greeting text + profile avatar.
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationWrap: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginRight: SIZES.spacing_sm,
  },
  // Round "glass" button: translucent white on the frost page.
  glassCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: COLORS.white,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  exploreClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginRight: SIZES.spacing_md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(63, 90, 115, 0.1)',
  },
  locationText: {
    flexShrink: 1,
  },
  locationKicker: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationName: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  headline: {
    marginTop: SIZES.spacing_base,
    fontSize: 24,
    lineHeight: 32,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  headlineName: {
    fontFamily: 'Poppins_700Bold',
  },
  // Search row: slim pill + compact avatar (shown when collapsed).
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Slim one-line search pill.
  // Same search pill as the destination page: soft grey fill, no shadow.
  // White pill on the blue wash, with a light blue outline.
  homeSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_full,
    // A soft lift off the frost page.
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
    paddingHorizontal: SIZES.spacing_base,
    gap: SIZES.spacing_sm,
  },
  // With the trip chip before it, the chip takes the push to the right.
  profileButtonAfterChip: {
    marginLeft: SIZES.spacing_sm,
  },
  // Greeting-row avatar button: just the tap target (renderAvatar draws it).
  profileButton: {
    marginLeft: 'auto',
    flexShrink: 0,
    borderRadius: 24,
  },
  // Avatar: thin orange ring (white gap inside) around photo / initials.
  avatarRing: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: COLORS.white,
  },
  avatarRingGuest: {
    borderColor: COLORS.primary,
  },
  avatarInner: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarInitials: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  searchHint: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  // Greeting subline about the next trip (tappable).
  // Next trip: a light orange pill.
  // Plan a new trip: round orange + beside the search pill.
  newTripButton: {
    flexDirection: 'row',
    gap: 2,
    height: 48,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 24,
    marginLeft: SIZES.spacing_sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  newTripText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  // Next-trip chip in the top bar, before your photo.
  tripChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 150,
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  tripChipText: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  tripChipBold: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  // Nearby detected location chip (plain text).
  sectionTitleSub: {
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  // Profile circle.


  // Full Screen Search Modal
  // Full-screen search sheet (Airbnb style): opaque, fills the whole screen.
  searchModal: {
    ...StyleSheet.absoluteFill,
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: SIZES.spacing_lg,
  },
  // Top bar holding the close button (top-left).
  searchTopBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: SIZES.spacing_lg,
  },
  searchCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  // Big bold heading like "Where to?".
  searchCardTitle: {
    fontSize: 32,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_lg,
  },
  // Rounded search field — same medium size as the home search bar so the two
  // match. (Slightly smaller than the previous large modal field.)
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: SIZES.radius_full,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: 15,
    marginBottom: SIZES.spacing_lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
    marginLeft: SIZES.spacing_md,
    paddingVertical: 0,
    outlineStyle: 'none',
  },

  // Suggestions/results fill the remaining screen height.
  searchSuggestions: {
    flex: 1,
  },
  searchSuggestionsContent: {
    paddingBottom: SIZES.spacing_xl * 2,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.spacing_md,
  },
  suggestionsTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_sm,
  },
  clearText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accentDeep,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SIZES.spacing_md,
    gap: SIZES.spacing_md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  suggestionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  suggestionSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  noResults: {
    paddingVertical: SIZES.spacing_xl,
    paddingHorizontal: SIZES.spacing_lg,
    alignItems: 'center',
    gap: SIZES.spacing_xs,
  },
  noResultsTitle: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  noResultsText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  // Sections
  unfinishedTrip: {
    marginHorizontal: SIZES.spacing_lg,
    marginTop: SIZES.spacing_md,
  },
  section: {
    marginTop: SIZES.spacing_lg,
  },
  // First section sits close under the header.
  sectionFirst: {
    marginTop: SIZES.spacing_md,
  },
  communityHeading: {
    flex: 1,
    minWidth: 0,
  },
  communitySub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_base,
  },
  sectionTitle: {
    fontSize: SIZES.lg + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
    paddingHorizontal: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_base,
  },
  seeAllText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accentDeep,
  },
  sectionHeaderTitle: {
    fontSize: SIZES.lg + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },

  // Horizontal rows of PlaceTile cards (Recently Explored, favourites)
  tileRow: {
    paddingHorizontal: SIZES.spacing_lg,
    gap: 12,
  },

  // Cards
  cardsContainer: {
    paddingHorizontal: SIZES.spacing_lg,
    gap: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: COLORS.sand,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SIZES.spacing_base,
  },
  cardPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: SIZES.spacing_md,
  },
  cardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border,
  },
  cardDotOn: {
    width: 18,
    backgroundColor: COLORS.primaryLight,
  },
  cardLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardCountry: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.9)',
  },
  cardName: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  cardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_xs,
  },
  ratingIcon: {
    fontSize: 13,
  },
  ratingValue: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  reviewCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.7)',
    marginLeft: SIZES.spacing_xs,
  },

  // Categories
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SIZES.spacing_lg,
    gap: 12,
  },
  categoryCard: {
    // Use flex-basis so two cards always sit side by side regardless of the
    // actual viewport width (fixes web/responsive-emulator stacking issue).
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '47%',
    minWidth: 0,
    maxWidth: '48%',
    height: 120,
    borderRadius: SIZES.radius_md,
    overflow: 'hidden',
  },
  categoryImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  categoryOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: SIZES.spacing_base,
  },
  categoryIcon: {
    fontSize: 28,
    marginBottom: SIZES.spacing_xs,
  },
  categoryName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },

  // Location Card
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SIZES.spacing_lg,
    padding: SIZES.spacing_base,
    backgroundColor: COLORS.sand,
    borderRadius: SIZES.radius_md,
    gap: SIZES.spacing_md,
  },
  locationCardContent: {
    flex: 1,
  },
  locationCardTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  locationCardSubtitle: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  // "See all" card at the end of Near You: same height and corners as the
  // place cards, a photo mosaic under a navy wash.
  showAllCard: {
    width: 150,
    height: NEARBY_CARD_HEIGHT,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    backgroundColor: COLORS.primary,
  },
  showAllMosaic: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  showAllTile: {
    width: '50%',
    height: '50%',
  },
  showAllBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_md,
  },
  showAllArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginBottom: SIZES.spacing_sm,
  },
  showAllText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  showAllSub: {
    marginTop: 2,
    textAlign: 'center',
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },

  // Journals

  // Bottom Nav
});
