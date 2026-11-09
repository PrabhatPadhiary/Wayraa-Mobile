import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ScrollView,
  TextInput,
  BackHandler,
  Modal,
  Animated,
  Easing,
  ActivityIndicator,
  AppState,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import {
  GlassSurface,
  PlaceTile,
  NextTripCarousel,
  NearbyPlaceCard,
  NextTripCardSkeleton,
  TileRowSkeleton,
  NearbyRowSkeleton,
  JournalRowSkeleton,
} from '../components';
import {
  searchPlaces,
  getCurrentLocation,
  getLocationPermission,
  getNearbyPlaces,
  reverseGeocode,
  getMyTrips,
  getFavourites,
} from '../services';
import { API_URL } from '../config';
import useAuth from '../hooks/useAuth';
import { pickActiveTrips, daysUntil, dayCount } from '../utils/tripDates';
import { LinearGradient } from 'expo-linear-gradient';
import { initialsFor } from '../components/TripStackCard';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.7;
const CARD_HEIGHT = 320;

const RECENT_SEARCHES_KEY = 'wayraa_recent_searches';


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
    image: 'https://images.pexels.com/photos/2166559/pexels-photo-2166559.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: '2',
    name: 'Santorini',
    country: 'Greece',
    rating: 5.0,
    reviews: 143,
    image: 'https://images.pexels.com/photos/1010657/pexels-photo-1010657.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: '3',
    name: 'Kyoto',
    country: 'Japan',
    rating: 4.9,
    reviews: 198,
    image: 'https://images.pexels.com/photos/1440476/pexels-photo-1440476.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: '4',
    name: 'Machu Picchu',
    country: 'Peru',
    rating: 4.9,
    reviews: 312,
    image: 'https://images.pexels.com/photos/2929906/pexels-photo-2929906.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    id: '5',
    name: 'Cape Town',
    country: 'South Africa',
    rating: 4.7,
    reviews: 167,
    image: 'https://images.pexels.com/photos/259447/pexels-photo-259447.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
];

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
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  // Id of the popular-destination card currently resolving its placeId (tap feedback).
  const [resolvingCardId, setResolvingCardId] = useState(null);
  const [locationDenied, setLocationDenied] = useState(false);
  // Denied and the OS won't show the prompt again: only Settings can fix it.
  const [locationBlocked, setLocationBlocked] = useState(false);
  const [journals, setJournals] = useState([]);
  // True until the journals request has finished once, so the row shows a
  // skeleton instead of a misleading "No journals yet".
  const [journalsLoading, setJournalsLoading] = useState(true);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const { user: firebaseUser, isAuthenticated, isAuthReady } = useAuth();
  const routeUser = route?.params?.user;
  const user = firebaseUser || routeUser;

  // Profile avatar: prefer the Firebase photo, else initials of the display
  // name (or email).
  const profilePhoto = firebaseUser?.photoURL || routeUser?.photoUrl || null;
  const profileName = firebaseUser?.displayName || routeUser?.name || firebaseUser?.email || '';


  // Time-aware greeting.
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();
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

  const handleContentScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    // Collapse on scroll down; expand a bit before reaching the top so the
    // header is fully open before the content reaches its natural start position.
    if (y > 60 && !headerCollapsed) setHeaderCollapsed(true);
    else if (y <= 55 && headerCollapsed) setHeaderCollapsed(false);
  };

  // Detected nearby location label (reverse-geocoded), shown as a chip.
  const [nearbyLabel, setNearbyLabel] = useState(null);

  // Use a location fix for both the "Near you" chip and the nearby places.
  const applyLocation = useCallback(async (loc) => {
    setNearbyLoading(true);
    setLocationDenied(false);
    setLocationBlocked(false);
    const [places, label] = await Promise.all([
      getNearbyPlaces(loc.lat, loc.lng),
      reverseGeocode(loc.lat, loc.lng),
    ]);
    setNearbyPlaces(places);
    if (label) setNearbyLabel(label);
    setNearbyLoading(false);
  }, []);

  // On launch: ask once if the phone has never been asked; if already allowed,
  // load nearby places straight away (no prompt, no tap needed).
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
  const [activeTrips, setActiveTrips] = useState([]);

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
    if (until > 0) {
      return { icon: 'airplane', text: `${place} in ${until} ${until === 1 ? 'day' : 'days'}` };
    }
    if (until === 0) return { icon: 'airplane', text: `${place} starts today` };
    const total = dayCount(trip.startDate, trip.endDate);
    const dayNo = 1 - until;
    if (!total || dayNo > total) return null; // over (or no end date to count from)
    return { icon: 'sunny', text: `Day ${dayNo} in ${place}` };
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
  const [favourites, setFavourites] = useState([]);
  // True once each request has finished (success or failure) at least once,
  // so skeletons show only on the first load, not on every refocus refresh.
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [favsLoaded, setFavsLoaded] = useState(false);

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
          const trips = await getMyTrips();
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
          const favs = await getFavourites();
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


  // Prevent back button from going to Welcome/Login screens
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isSearchActive) {
        closeSearch();
        return true;
      }
      return true;
    });
    return () => backHandler.remove();
  }, [isSearchActive]);

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

  const saveSearch = async (item) => {
    if (!item?.name) return;
    const entry = { name: item.name, placeId: item.placeId, secondary: item.secondary || '' };
    const updated = [entry, ...recentSearches.filter(s => s.placeId !== item.placeId)].slice(0, 8);
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  };

  const clearRecentSearches = async () => {
    setRecentSearches([]);
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const openSearch = () => {
    setIsSearchActive(true);
  };

  const closeSearch = () => {
    setIsSearchActive(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (text.trim().length > 1) {
      // Debounced real-time search via Google Places
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(async () => {
        const results = await searchPlaces(text.trim());
        setSearchResults(results);
      }, 300);
    } else {
      setSearchResults([]);
    }
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      saveSearch({ name: searchQuery.trim(), placeId: null, secondary: '' });
      closeSearch();
    }
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
        <Image source={{ uri: item.image }} style={styles.cardImage} />
        <View style={styles.cardOverlay}>
          <Text style={styles.cardCountry}>{item.country}</Text>
          <Text style={styles.cardName}>{item.name}</Text>
        </View>
        {isResolving && (
          <View style={styles.cardLoadingOverlay}>
            <ActivityIndicator size="small" color={COLORS.white} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderJournalCard = ({ item }) => {
    const coverPhoto = item.photos && item.photos.length > 0 ? item.photos[0].url : null;
    return (
      <TouchableOpacity style={styles.journalCard} activeOpacity={0.9}>
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto }} style={styles.journalImage} />
        ) : (
          <View style={[styles.journalImage, { backgroundColor: COLORS.sand, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="document-text-outline" size={28} color={COLORS.textMuted} />
          </View>
        )}
        <View style={styles.journalContent}>
          <Text style={styles.journalTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.journalMeta}>{item.author?.name || 'Anonymous'} • {item.destination || ''}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

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
                    <View style={[styles.suggestionIcon, { backgroundColor: 'rgba(6, 133, 192, 0.12)' }]}>
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

              {/* No Results */}
              {searchQuery.length > 1 && searchResults.length === 0 && (
                <View style={styles.noResults}>
                  <Text style={styles.noResultsText}>No destinations found for "{searchQuery}"</Text>
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popular Destinations</Text>
          <FlatList
            data={POPULAR_DESTINATIONS}
            renderItem={renderPlaceCard}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + 16}
            decelerationRate="fast"
            contentContainerStyle={styles.cardsContainer}
          />
        </View>

        {/* Near You */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Near You</Text>
          {nearbyPlaces.length > 0 ? (
            <FlatList
              data={[...nearbyPlaces.slice(0, 5), { id: 'show-all', isShowAll: true }]}
              keyExtractor={(item) => item.placeId || item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardsContainer}
              renderItem={({ item }) => {
                if (item.isShowAll) {
                  const collageImages = nearbyPlaces.slice(0, 3).map(p => p.photoUrl).filter(Boolean);
                  return (
                    <TouchableOpacity style={styles.showAllCard} activeOpacity={0.8}>
                      <View style={styles.collageContainer}>
                        {collageImages.map((uri, i) => (
                          <Image
                            key={i}
                            source={{ uri }}
                            style={[styles.collageImage, {
                              transform: [{ rotate: `${(i - 1) * 8}deg` }],
                              zIndex: 3 - i,
                              top: i * 8,
                              left: i * 20,
                            }]}
                          />
                        ))}
                      </View>
                      <Text style={styles.showAllText}>Show all →</Text>
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
            <Text style={styles.sectionTitle}>Your Trips</Text>
            <NextTripCardSkeleton />
          </View>
        )}
        {activeTrips.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Trips</Text>
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
              <Text style={styles.sectionHeaderTitle}>Recently Explored</Text>
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
              <Text style={styles.sectionHeaderTitle}>From Your Favourites</Text>
            </View>
            <TileRowSkeleton label="Loading your favourites" />
          </View>
        )}
        {favourites.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderTitle}>From Your Favourites</Text>
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

        {/* From the Community */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderTitle}>From the Community</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          {journalsLoading ? (
            <JournalRowSkeleton />
          ) : (
          <FlatList
            data={journals}
            renderItem={renderJournalCard}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.journalsContainer}
            ListEmptyComponent={
              <Text style={{ paddingHorizontal: SIZES.spacing_lg, color: COLORS.textMuted, fontFamily: 'Poppins_400Regular' }}>No journals yet. Be the first to share!</Text>
            }
          />
          )}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Frosted glass header — uses the same GlassSurface as the menu bar
          (proven working blur). Rendered AFTER the ScrollView so it blurs the
          content scrolling behind it. */}
      <View
        style={styles.searchContainer}
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
        <GlassSurface radius={SIZES.radius_xl} style={StyleSheet.absoluteFill} />
        {/* Warm sand wash over the glass: gives the header colour while the
            blur still shows through toward the bottom. */}
        <LinearGradient
          colors={['rgba(255,232,214,0.95)', 'rgba(255,244,236,0.8)', 'rgba(255,251,248,0.55)']}
          locations={[0, 0.55, 1]}
          style={[StyleSheet.absoluteFill, { borderRadius: SIZES.radius_xl }]}
          pointerEvents="none"
        />

        {/* Foreground content (greeting/pill/chip) sits above the glass. */}
        <View style={[styles.headerForeground, { paddingTop: insets.top + SIZES.spacing_base }]}>
          {/* Greeting row (text + profile) — collapses away on scroll down. */}
          <Animated.View
            style={{
              opacity: headerAnim.interpolate({ inputRange: [0, 0.8], outputRange: [1, 0], extrapolate: 'clamp' }),
              // Room for the greeting plus the trip pill (~72px); collapses to 0.
              maxHeight: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [90, 0] }),
              marginBottom: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [SIZES.spacing_base, 0] }),
              transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
              overflow: 'hidden',
            }}
          >
            <View style={styles.greetingRow}>
              <View style={styles.greetingText}>
                <Text style={styles.greeting}>
                  {greeting}{isAuthenticated && firstName ? `, ${firstName}` : ''}
                </Text>
                {tripLine ? (
                  <TouchableOpacity
                    style={styles.tripLine}
                    onPress={openHeadlineTrip}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${tripLine.text}. Open trip`}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <LinearGradient
                      colors={[COLORS.accentDeep, COLORS.accent]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.tripLinePill}
                    >
                      <Ionicons name={tripLine.icon} size={13} color={COLORS.white} />
                      <Text style={styles.tripLineText} numberOfLines={1}>{tripLine.text}</Text>
                      <Ionicons name="chevron-forward" size={13} color={COLORS.white} />
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.greetingSub}>Where to next?</Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.profileButton}
                activeOpacity={0.85}
                onPress={handleProfilePress}
                accessibilityRole="button"
                accessibilityLabel={isAuthenticated ? 'Open profile' : 'Log in'}
              >
                {renderAvatar(48)}
              </TouchableOpacity>
            </View>
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
              <Ionicons name="search" size={19} color={COLORS.accent} />
              <Animated.Text style={[styles.searchHint, { opacity: hintFade }]} numberOfLines={1}>
                {SEARCH_HINTS[hintIndex]}
              </Animated.Text>
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

          {/* Nearby detected location chip — collapses away on scroll down. */}
          {nearbyLabel && (
            <Animated.View
              style={{
                opacity: headerAnim.interpolate({ inputRange: [0, 0.8], outputRange: [1, 0], extrapolate: 'clamp' }),
                maxHeight: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
                marginTop: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [SIZES.spacing_md, 0] }),
                overflow: 'hidden',
              }}
            >
              <View style={styles.locationChip}>
                <Ionicons name="location" size={14} color={COLORS.textSecondary} />
                <Text style={styles.locationChipText} numberOfLines={1}>
                  Near you · {nearbyLabel}
                </Text>
              </View>
            </Animated.View>
          )}
        </View>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
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
    backgroundColor: 'transparent',
  },
  // Foreground content sits above the GlassSurface backdrop; carries the
  // header's padding.
  headerForeground: {
    paddingTop: 0,
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_lg,
  },
  // Greeting row: greeting text + profile avatar.
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingText: {
    flex: 1,
    marginRight: SIZES.spacing_sm,
  },
  greeting: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  greetingSub: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  // Search row: slim pill + compact avatar (shown when collapsed).
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Slim one-line search pill.
  homeSearchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: SIZES.radius_full,
    paddingHorizontal: SIZES.spacing_base,
    gap: SIZES.spacing_sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  // Greeting-row avatar button: just the tap target (renderAvatar draws it).
  profileButton: {
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
  tripLine: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: 4,
  },
  tripLinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
  },
  tripLineText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  // Nearby detected location chip (plain text).
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingVertical: 6,
  },
  locationChipText: {
    fontSize: SIZES.sm,
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
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },

  // Sections
  section: {
    marginTop: SIZES.spacing_lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_base,
  },
  sectionTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
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
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
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
    gap: 16,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: SIZES.radius_lg,
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
    paddingTop: SIZES.spacing_xl,
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.8)',
  },
  cardName: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    marginBottom: SIZES.spacing_xs,
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
  showAllCard: {
    width: 180,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  showAllText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginTop: SIZES.spacing_sm,
  },
  collageContainer: {
    width: 160,
    height: 130,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collageImage: {
    width: 100,
    height: 100,
    borderRadius: SIZES.radius_md,
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.white,
  },

  // Journals
  journalsContainer: {
    paddingHorizontal: SIZES.spacing_lg,
    gap: 14,
  },
  journalCard: {
    width: 200,
    borderRadius: SIZES.radius_md,
    overflow: 'hidden',
    backgroundColor: COLORS.sand,
  },
  journalImage: {
    width: '100%',
    height: 120,
  },
  journalContent: {
    padding: SIZES.spacing_md,
  },
  journalTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_xs,
  },
  journalMeta: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },

  // Bottom Nav
});
