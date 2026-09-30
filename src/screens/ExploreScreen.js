import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SIZES } from '../constants';
import { searchPlaces, getCurrentLocation, getNearbyPlaces } from '../services';
import { API_URL } from '../config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.7;
const CARD_HEIGHT = 320;

const RECENT_SEARCHES_KEY = 'wayraa_recent_searches';

const CATEGORIES = [
  {
    id: '1',
    name: 'Beaches',
    icon: '🏖️',
    image: 'https://images.pexels.com/photos/1032650/pexels-photo-1032650.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '2',
    name: 'Mountains',
    icon: '🏔️',
    image: 'https://images.pexels.com/photos/417173/pexels-photo-417173.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '3',
    name: 'Cities',
    icon: '🌆',
    image: 'https://images.pexels.com/photos/466685/pexels-photo-466685.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '4',
    name: 'Historical',
    icon: '🏛️',
    image: 'https://images.pexels.com/photos/2225442/pexels-photo-2225442.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '5',
    name: 'Islands',
    icon: '🏝️',
    image: 'https://images.pexels.com/photos/1450353/pexels-photo-1450353.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: '6',
    name: 'Wildlife',
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
export default function ExploreScreen({ route, navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [journals, setJournals] = useState([]);
  const searchInputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const user = route?.params?.user;

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

  // Backfill missing photos for recent searches that have no image yet.
  // Heals entries saved before an image was resolved AND text-submit entries
  // (placeId === null) by first looking up a placeId from the name.
  useEffect(() => {
    const needsPhoto = recentSearches
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => s && typeof s === 'object' && !s.imageUrl && (s.placeId || s.name));
    if (needsPhoto.length === 0) return;

    let cancelled = false;
    (async () => {
      const resolved = await Promise.all(
        needsPhoto.map(async ({ s, index }) => ({
          index,
          ...(await resolvePhotoUrl(s.placeId, s.name)),
        }))
      );
      if (cancelled) return;

      const patchByIndex = {};
      resolved.forEach((r) => {
        if (r.imageUrl || r.placeId) patchByIndex[r.index] = r;
      });
      if (Object.keys(patchByIndex).length === 0) return;

      setRecentSearches((prev) => {
        let changed = false;
        const updated = prev.map((s, i) => {
          const patch = patchByIndex[i];
          if (!patch || !s || typeof s !== 'object') return s;
          // Only apply if it actually adds something new (avoids re-render loops).
          const next = { ...s };
          if (patch.imageUrl && !s.imageUrl) { next.imageUrl = patch.imageUrl; changed = true; }
          if (patch.placeId && !s.placeId) { next.placeId = patch.placeId; changed = true; }
          return next;
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

  // Resolve a displayable photo URL for a place. Accepts a placeId and/or a name;
  // if no placeId is given it will look one up from the name first.
  const resolvePhotoUrl = async (placeId, name) => {
    let id = placeId;
    if (!id && name) id = await resolvePlaceId(name);
    if (!id) return { imageUrl: null, placeId: null };
    try {
      const resp = await fetch(`${API_URL}/Destinations/details?placeId=${id}`);
      if (!resp.ok) return { imageUrl: null, placeId: id };
      const details = await resp.json();
      const photoUrl = details.photos?.[0]?.url;
      if (!photoUrl) return { imageUrl: null, placeId: id };
      const refMatch = photoUrl.match(/photo_reference=([^&]+)/);
      if (!refMatch) return { imageUrl: null, placeId: id };
      return { imageUrl: `${API_URL}/Destinations/photo?reference=${refMatch[1]}&maxWidth=200`, placeId: id };
    } catch (e) {
      console.log('resolvePhotoUrl error:', e);
      return { imageUrl: null, placeId: id };
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
    }
  };

  const loadNearbyPlaces = async () => {
    setNearbyLoading(true);
    const location = await getCurrentLocation();
    if (!location.granted) {
      setLocationDenied(true);
      setNearbyLoading(false);
      return;
    }
    const places = await getNearbyPlaces(location.lat, location.lng);
    setNearbyPlaces(places);
    setNearbyLoading(false);
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

  // Persist a tapped place into recent searches (fire-and-forget); resolves a
  // thumbnail in the background so the "Recently Explored" row shows an image.
  const persistRecentSearch = async (item) => {
    const { imageUrl } = await resolvePhotoUrl(item.placeId, item.name);
    const entry = { name: item.name, placeId: item.placeId, secondary: item.secondary || '', imageUrl };
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

  const renderPlaceCard = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.9}>
      <Image source={{ uri: item.image }} style={styles.cardImage} />
      <TouchableOpacity style={styles.favouriteButton} accessibilityLabel="Add to favourites">
        <Ionicons name="heart-outline" size={20} color={COLORS.white} />
      </TouchableOpacity>
      <View style={styles.cardOverlay}>
        <Text style={styles.cardCountry}>{item.country}</Text>
        <Text style={styles.cardName}>{item.name}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderJournalCard = ({ item }) => {
    const coverPhoto = item.photos && item.photos.length > 0 ? item.photos[0].url : null;
    return (
      <TouchableOpacity style={styles.journalCard} activeOpacity={0.9}>
        {coverPhoto ? (
          <Image source={{ uri: coverPhoto }} style={styles.journalImage} />
        ) : (
          <View style={[styles.journalImage, { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }]}>
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      {/* Search Bar Pill */}
      <View style={styles.searchContainer}>
        <TouchableOpacity style={styles.searchBarPill} activeOpacity={0.9} onPress={openSearch}>
          <Ionicons name="search" size={18} color={COLORS.textPrimary} />
          <Text style={styles.searchPillText}>Start your search</Text>
        </TouchableOpacity>
      </View>

      {/* Full Screen Search Modal */}
      <Modal
        visible={isSearchActive}
        animationType="slide"
        transparent={true}
        onRequestClose={closeSearch}
      >
        <View style={styles.searchModal}>
          {/* Dismiss on tap outside the card */}
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSearch} />

          {/* Close button */}
          <TouchableOpacity style={styles.searchCloseButton} onPress={closeSearch}>
            <Ionicons name="close" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>

          {/* Search card */}
          <View style={styles.searchCard}>
            <Text style={styles.searchCardTitle}>Where?</Text>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={18} color={COLORS.textMuted} />
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
                  <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Suggestions / Results */}
            <ScrollView style={styles.searchSuggestions} showsVerticalScrollIndicator={false}>
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
                    <View style={[styles.suggestionIcon, { backgroundColor: '#e8f5e9' }]}>
                      <Ionicons name="navigate" size={20} color="#4CAF50" />
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
        </View>
      </Modal>

      {/* Main Content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Recent Searches Section (only on home, if has history) */}
        {recentSearches.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Explored</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentCardsContainer}>
              {recentSearches.slice(0, 5).map((item, index) => {
                const entry = typeof item === 'string' ? { name: item } : item;
                return (
                  <TouchableOpacity key={index} style={styles.recentCard} onPress={() => {
                    if (entry.placeId) {
                      openDestination(entry);
                    } else {
                      openSearch();
                      setTimeout(() => handleRecentSearchTap(item), 150);
                    }
                  }}>
                    {entry.imageUrl ? (
                      <Image source={{ uri: entry.imageUrl }} style={styles.recentCardImage} />
                    ) : (
                      <View style={styles.recentCardIcon}>
                        <Ionicons name="location" size={16} color={COLORS.accent} />
                      </View>
                    )}
                    <Text style={styles.recentCardName} numberOfLines={1}>{entry.name}</Text>
                    <Text style={styles.recentCardSub} numberOfLines={1}>{entry.secondary || ''}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

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
                    <TouchableOpacity style={[styles.nearbyCard, styles.showAllCard]} activeOpacity={0.8}>
                      <View style={styles.collageContainer}>
                        {collageImages.map((uri, i) => (
                          <Image
                            key={i}
                            source={{ uri }}
                            style={[styles.collageImage, {
                              transform: [{ rotate: `${(i - 1) * 8}deg` }],
                              zIndex: 3 - i,
                              top: i * 4,
                              left: i * 10,
                            }]}
                          />
                        ))}
                      </View>
                      <Text style={styles.showAllText}>Show all →</Text>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity style={styles.nearbyCard} activeOpacity={0.9}>
                    {item.photoUrl ? (
                      <Image source={{ uri: item.photoUrl }} style={styles.nearbyImage} />
                    ) : (
                      <View style={[styles.nearbyImage, { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' }]}>
                        <Ionicons name="image-outline" size={30} color={COLORS.textMuted} />
                      </View>
                    )}
                    <View style={styles.nearbyContent}>
                      <Text style={styles.nearbyName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.nearbyVicinity} numberOfLines={1}>{item.vicinity}</Text>
                      {item.rating > 0 && (
                        <Text style={styles.nearbyRating}>⭐ {item.rating}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          ) : nearbyLoading ? (
            <View style={styles.locationCard}>
              <Text style={styles.locationCardTitle}>Finding places near you...</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.locationCard} onPress={loadNearbyPlaces}>
              <Ionicons name="location-outline" size={24} color={COLORS.accent} />
              <View style={styles.locationCardContent}>
                <Text style={styles.locationCardTitle}>{locationDenied ? 'Location Denied' : 'Enable Location'}</Text>
                <Text style={styles.locationCardSubtitle}>{locationDenied ? 'Allow location access in settings' : 'Find destinations near you'}</Text>
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
              >
                <Image source={{ uri: category.image }} style={styles.categoryImage} />
                <View style={styles.categoryOverlay}>
                  <Text style={styles.categoryName}>{category.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* From the Community */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderTitle}>From the Community</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
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
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 100 }} />
      </ScrollView>

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

  // Search Pill
  searchContainer: {
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_sm,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  searchBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_full,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  searchPillText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
    marginLeft: SIZES.spacing_sm,
  },

  // Full Screen Search Modal
  searchModal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + SIZES.spacing_base : SIZES.spacing_xl,
    paddingHorizontal: SIZES.spacing_lg,
  },
  searchCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.spacing_lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  searchCard: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_lg,
    padding: SIZES.spacing_lg,
    maxHeight: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  searchCardTitle: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_base,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_base,
  },
  searchInput: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
    marginLeft: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_xs,
    outlineStyle: 'none',
  },

  // Suggestions
  searchSuggestions: {
    flex: 1,
    marginTop: SIZES.spacing_sm,
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
    color: COLORS.accent,
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
    backgroundColor: COLORS.cardBackground,
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
    color: COLORS.textPrimary,
    paddingHorizontal: SIZES.spacing_lg,
    marginBottom: SIZES.spacing_base,
  },
  seeAllText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accent,
  },
  sectionHeaderTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },

  // Recent Activity Cards
  recentCardsContainer: {
    paddingHorizontal: SIZES.spacing_lg,
    gap: 12,
  },
  recentCard: {
    width: 180,
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_md,
    overflow: 'hidden',
  },
  recentCardIcon: {
    width: '100%',
    height: 130,
    borderRadius: SIZES.radius_md,
    backgroundColor: '#fff5f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentCardImage: {
    width: '100%',
    height: 130,
    borderRadius: SIZES.radius_md,
  },
  recentCardName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginTop: SIZES.spacing_sm,
  },
  recentCardSub: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    marginTop: 2,
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
    backgroundColor: COLORS.cardBackground,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  favouriteButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: COLORS.cardBackground,
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
  nearbyCard: {
    width: 180,
    borderRadius: SIZES.radius_md,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  nearbyImage: {
    width: '100%',
    height: 130,
    borderRadius: SIZES.radius_md,
  },
  nearbyContent: {
    paddingVertical: SIZES.spacing_sm,
    paddingHorizontal: 2,
  },
  nearbyName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  nearbyVicinity: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  nearbyRating: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  showAllCard: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    gap: SIZES.spacing_sm,
    height: 180,
    borderRadius: SIZES.radius_md,
  },
  showAllText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
    marginTop: SIZES.spacing_sm,
  },
  collageContainer: {
    width: 100,
    height: 80,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  collageImage: {
    width: 60,
    height: 60,
    borderRadius: SIZES.radius_sm,
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
    backgroundColor: COLORS.cardBackground,
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
