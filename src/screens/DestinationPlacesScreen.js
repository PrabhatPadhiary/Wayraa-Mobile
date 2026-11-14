import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import PlaceGridCard, { CardCornerButton } from '../components/PlaceGridCard';
import { placeIconFor } from '../components/PlaceSearchField';
import PickToggle from '../components/PickToggle';
import { useBottomBar } from '../context/BottomBarContext';
import { buildTripPlaceDto, toTripCategory, pickDoneLabel } from '../utils/tripPlaces';
import {
  searchInDestination,
  searchAnyPlace,
  getFavourites,
  addFavourite,
  removeFavourite,
  getTripById,
  getPlaceDetails,
  addPlaceToTrip,
  removeTripPlace,
  journalCategoryFor,
  AuthRequiredError,
} from '../services';
import { showAlert } from '../components/AppDialog';
import { GridSkeleton } from '../components/skeletons';

/** A trip place category from Google types: food, stay or activity. */
function tripCategoryFromTypes(types = []) {
  const c = journalCategoryFor(types);
  if (c === 'food') return 'food';
  if (c === 'stay') return 'stay';
  return 'activity';
}

const SEARCH_IDEAS = ['Rooftop bars', 'Breakfast', 'Street food', 'Bookstores', 'Parks', 'Live music'];
// Live suggestions: wait this long after typing, show this many places.
const SUGGEST_DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 6;
const SUGGEST_RADIUS = 50000; // metres around the destination

/**
 * Every place for one destination, in pages: "See all" for a category (with
 * its filter chips) or "Search in <destination>" for anything typed.
 *
 * Loads 20 more as you reach the end, up to Google's limit (60 a search),
 * then says so. Same cards as the destination page, with the favourite heart.
 *
 * Route params:
 *  - placeId, destinationName
 *  - mode: 'browse' | 'search'
 *  - browse: categoryKey ('stays' | 'food' | 'activities'), apiCategory,
 *    categoryLabel, filters (chip labels, 'All' first), filter (starting chip)
 *  - search: query (optional starting text), coords ({ lat, lng }) to keep
 *    live suggestions inside the destination
 *  - createTrip (CreateTrip's params): the destination's "Create a trip",
 *    kept in the bottom bar here as on the destination page
 *  - pickForTrip ({ tripId, destinationId, tripName, saved }): adding to a
 *    trip stop — cards and suggestions get add / added toggles instead of
 *    the heart, and the bottom bar shows "Add (N)" to finish
 *
 * Search: as you type, live suggestions (Google autocomplete, cheap) show
 * under the box — "Search '<text>' in <destination>" first (the full grid
 * of results, Text Search), then matching places that open directly.
 */
export default function DestinationPlacesScreen({ navigation, route }) {
  const {
    placeId,
    destinationName,
    mode = 'browse',
    categoryKey,
    apiCategory,
    categoryLabel,
    filters = [],
    filter: startFilter = 'All',
    query: startQuery = '',
    coords = null,
    pickForTrip = null,
    createTrip = null,
    city = null, // { name, lat, lng }: passed on so place pages show "km from centre"
  } = route.params || {};
  const isSearch = mode === 'search';

  // ── Adding to a trip stop (pickForTrip) ──
  // placeId -> trip place id for the stop's saved places ('' = saved, id not
  // known yet). Seeded from the caller so ticks show at once, then synced.
  const [pickedMap, setPickedMap] = useState(() => new Map(pickForTrip?.saved || []));
  const [pickPending, setPickPending] = useState(() => new Set());
  const pickTripId = pickForTrip?.tripId;
  const pickDestId = pickForTrip?.destinationId;
  const loadPicked = useCallback(async () => {
    if (!pickTripId) return new Map();
    const full = await getTripById(pickTripId);
    const dest = (full?.destinations || []).find((d) => d.id === pickDestId);
    const map = new Map((dest?.places || []).map((p) => [p.placeId, p.id]));
    setPickedMap(map);
    return map;
  }, [pickTripId, pickDestId]);
  useFocusEffect(useCallback(() => {
    if (pickTripId) loadPicked().catch(() => {});
  }, [pickTripId, loadPicked]));

  // Bottom bar: "Add (N)" (or "Done") returns to where adding started.
  const { claimBar, releaseBar } = useBottomBar();
  const barOwner = route?.key;
  const isFocused = useIsFocused();
  const pickedCount = pickedMap.size;
  // "Done · 3 added": this visit's changes only (not everything on the stop).
  const doneLabel = pickDoneLabel(pickedMap, pickForTrip?.initial);
  // Browsing / searching a destination: the bar stays collapsed with its
  // "Create a trip" button, the same as on the destination page.
  useEffect(() => {
    if (pickForTrip || !createTrip || !isFocused) return undefined;
    claimBar(barOwner, {
      cta: {
        label: 'Create a trip',
        icon: 'add-circle-outline',
        onPress: () => navigation.navigate('CreateTrip', createTrip),
      },
    });
    return () => releaseBar(barOwner);
  }, [pickForTrip, createTrip, isFocused, claimBar, releaseBar, barOwner, navigation]);

  useEffect(() => {
    if (!pickForTrip || !isFocused) return undefined;
    claimBar(barOwner, {
      cta: {
        label: doneLabel,
        icon: 'checkmark-circle',
        onPress: () => navigation.goBack(),
      },
    });
    return () => releaseBar(barOwner);
  }, [pickForTrip, isFocused, doneLabel, claimBar, releaseBar, barOwner, navigation]);

  // Add / remove a place on the trip stop. `place` is a search result or a
  // suggestion (suggestions are looked up first, for photo and coordinates).
  const togglePick = async (place, { fromSuggestion = false } = {}) => {
    const id = place.placeId;
    if (!id || !pickTripId || !pickDestId || pickPending.has(id)) return;
    const mark = (on) => setPickPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
    mark(true);
    try {
      if (pickedMap.has(id)) {
        let tripPlaceId = pickedMap.get(id);
        if (!tripPlaceId) tripPlaceId = (await loadPicked()).get(id);
        if (tripPlaceId) await removeTripPlace(tripPlaceId);
        setPickedMap((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
      } else {
        const category = toTripCategory(categoryKey) || tripCategoryFromTypes(place.types);
        let source = place;
        if (fromSuggestion) {
          const details = await getPlaceDetails(id);
          source = details ? { ...details, placeId: id, name: details.name || place.name } : place;
        }
        const res = await addPlaceToTrip(pickTripId, pickDestId, buildTripPlaceDto(source, category));
        setPickedMap((prev) => new Map(prev).set(id, res.id || ''));
      }
    } catch (e) {
      showAlert(
        'Could not update trip',
        e instanceof AuthRequiredError ? 'Sign in to edit your trips.' : (e?.message || 'Please try again.')
      );
    } finally {
      mark(false);
    }
  };

  const [filter, setFilter] = useState(startFilter);
  const [input, setInput] = useState(startQuery);
  const [query, setQuery] = useState(startQuery.trim()); // submitted search
  const [places, setPlaces] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [favedIds, setFavedIds] = useState(() => new Set());
  const favPending = useRef(new Set());
  // Live suggestions while typing (search mode).
  const [suggestions, setSuggestions] = useState([]);
  const [suggesting, setSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef(null);
  const inputRef = useRef(null);
  const latestTyped = useRef('');
  useEffect(() => () => clearTimeout(suggestTimer.current), []);
  const requestId = useRef(0); // ignores pages from an older search

  const criteria = isSearch
    ? (query ? { query } : null)
    : (filter && filter !== 'All' ? { filter } : { category: apiCategory });

  const loadPage = useCallback(async (nextPage) => {
    if (!criteria || !placeId) return;
    const id = nextPage === 0 ? ++requestId.current : requestId.current;
    if (nextPage === 0) {
      setLoading(true);
      setPlaces([]);
    } else {
      setLoadingMore(true);
    }
    setError(false);
    try {
      const res = await searchInDestination({ placeId, ...criteria, page: nextPage });
      if (id !== requestId.current) return;
      setPlaces((prev) => {
        const base = nextPage === 0 ? [] : prev;
        const seen = new Set(base.map((p) => p.placeId));
        return [...base, ...res.places.filter((p) => !seen.has(p.placeId))];
      });
      setPage(nextPage);
      setHasMore(res.hasMore);
    } catch {
      if (id === requestId.current) setError(true);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [placeId, criteria?.query, criteria?.filter, criteria?.category]); // eslint-disable-line

  // A new filter or search starts over from the first page.
  useEffect(() => {
    loadPage(0);
  }, [loadPage]);

  // Favourites, so hearts show the real state.
  useFocusEffect(
    useCallback(() => {
      getFavourites()
        .then((list) => setFavedIds(new Set(list.map((f) => f.placeId))))
        .catch(() => {}); // guest: hearts stay empty
    }, [])
  );

  const loadMore = () => {
    if (hasMore && !loading && !loadingMore && !error) loadPage(page + 1);
  };

  // Leave the search box: hide the keyboard and the cursor, so results show.
  const leaveSearchBox = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const submitSearch = (text = input) => {
    const q = text.trim();
    if (q.length < 2) return;
    leaveSearchBox();
    clearTimeout(suggestTimer.current);
    latestTyped.current = '';
    setShowSuggestions(false);
    setInput(text);
    setQuery(q);
  };

  const onType = (text) => {
    setInput(text);
    clearTimeout(suggestTimer.current);
    const q = text.trim();
    latestTyped.current = q;
    setShowSuggestions(q.length >= 2);
    if (q.length < 2) {
      setSuggestions([]);
      setSuggesting(false);
      return;
    }
    setSuggesting(true);
    suggestTimer.current = setTimeout(async () => {
      const near = coords ? { ...coords, radius: SUGGEST_RADIUS } : null;
      const found = await searchAnyPlace(q, { near });
      if (latestTyped.current !== q) return; // a newer search is on its way
      setSuggestions(found.slice(0, MAX_SUGGESTIONS));
      setSuggesting(false);
    }, SUGGEST_DEBOUNCE_MS);
  };

  const openSuggestion = (s) => {
    leaveSearchBox();
    setShowSuggestions(false);
    navigation.navigate('PlaceDetail', { placeId: s.placeId, name: s.name, vicinity: s.secondary, pickForTrip, city });
  };

  const toggleFavourite = async (item) => {
    const id = item.placeId;
    if (!id || favPending.current.has(id)) return;
    favPending.current.add(id);
    const wasFaved = favedIds.has(id);
    const flip = (on) => setFavedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
    flip(!wasFaved);
    try {
      const ok = wasFaved
        ? await removeFavourite(id)
        : (await addFavourite({
          placeId: id,
          placeName: item.name,
          vicinity: item.vicinity,
          rating: item.rating,
          userRatingsTotal: item.userRatingsTotal,
          photoUrl: item.photoUrl,
          category: categoryKey,
        })).success;
      if (!ok) flip(wasFaved);
    } catch (e) {
      flip(wasFaved);
      if (e instanceof AuthRequiredError) {
        showAlert('Sign in to save places', 'Create an account or sign in to keep favourites.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => navigation.navigate('Welcome') },
        ]);
      }
    } finally {
      favPending.current.delete(id);
    }
  };

  const renderPlace = ({ item }) => {
    const isFaved = favedIds.has(item.placeId);
    return (
      <PlaceGridCard
        style={styles.cardCell}
        name={item.name}
        photoUrl={item.photoUrl}
        rating={item.rating}
        reviews={item.userRatingsTotal}
        subtitle={item.vicinity}
        accessibilityLabel={`${item.name}${item.rating ? `, rated ${item.rating}` : ''}`}
        onPress={() => navigation.navigate('PlaceDetail', {
          placeId: item.placeId,
          name: item.name,
          vicinity: item.vicinity,
          photoUrl: item.photoUrl,
          rating: item.rating,
          category: categoryKey,
          pickForTrip,
          city,
        })}
        corner={pickForTrip ? (
          <PickToggle
            picked={pickedMap.has(item.placeId)}
            pending={pickPending.has(item.placeId)}
            onPress={() => togglePick(item)}
            label={pickedMap.has(item.placeId)
              ? `Remove ${item.name} from ${pickForTrip.tripName}`
              : `Add ${item.name} to ${pickForTrip.tripName}`}
          />
        ) : (
          <CardCornerButton
            icon={isFaved ? 'heart' : 'heart-outline'}
            color={isFaved ? COLORS.accent : COLORS.textPrimary}
            onPress={() => toggleFavourite(item)}
            accessibilityLabel={isFaved ? `Remove ${item.name} from favourites` : `Add ${item.name} to favourites`}
          />
        )}
      />
    );
  };

  const renderFooter = () => {
    if (loading || places.length === 0) return null;
    if (loadingMore) return <ActivityIndicator style={styles.footerSpinner} color={COLORS.accent} />;
    if (error) {
      return (
        <TouchableOpacity style={styles.footerRetry} onPress={() => loadPage(page + 1)} accessibilityRole="button">
          <Text style={styles.footerRetryText}>Couldn't load more. Tap to retry.</Text>
        </TouchableOpacity>
      );
    }
    if (!hasMore) {
      return (
        <Text style={styles.footerEnd}>
          {isSearch
            ? `That's everything we found for "${query}" in ${destinationName}.`
            : `That's the top ${places.length}. Try a filter or search for something specific.`}
        </Text>
      );
    }
    return null;
  };

  const renderEmpty = () => {
    if (loading) return <GridSkeleton label={isSearch ? 'Searching' : 'Loading places'} />;
    if (isSearch && !query) {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>What are you looking for?</Text>
          <Text style={styles.stateText}>Cafés, food, shops, sights… anywhere in {destinationName}.</Text>
          <View style={styles.ideas}>
            {SEARCH_IDEAS.map((idea) => (
              <TouchableOpacity key={idea} style={styles.idea} onPress={() => submitSearch(idea)} accessibilityRole="button">
                <Text style={styles.ideaText}>{idea}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.state}>
          <Feather name="wifi-off" size={36} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Couldn't load places</Text>
          <TouchableOpacity style={styles.retry} onPress={() => loadPage(0)} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.state}>
        <Feather name="search" size={36} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>Nothing found</Text>
        <Text style={styles.stateText}>
          {isSearch ? `Try different words, like "cafe" or "museum".` : 'Try another filter.'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <View style={styles.titleRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          {isSearch ? (
            <View style={styles.searchBox}>
              <Feather name="search" size={17} color={COLORS.textMuted} />
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                value={input}
                onChangeText={onType}
                onFocus={() => setShowSuggestions(input.trim().length >= 2)}
                onSubmitEditing={() => submitSearch()}
                placeholder={`Search in ${destinationName}`}
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="search"
                autoFocus={!startQuery}
                autoCorrect={false}
                accessibilityLabel={`Search in ${destinationName}`}
              />
              {!!input && (
                <TouchableOpacity onPress={() => onType('')} hitSlop={8} accessibilityLabel="Clear search">
                  <Feather name="x-circle" size={17} color={COLORS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.titleText}>
              <Text style={styles.title} numberOfLines={1}>{categoryLabel}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>in {destinationName}</Text>
            </View>
          )}
        </View>

        {!!pickForTrip && (
          <View style={styles.addingTo}>
            <Feather name="plus-circle" size={13} color={COLORS.accentDeep} />
            <Text style={styles.addingToText} numberOfLines={1}>
              Adding to {destinationName} · {pickForTrip.tripName}
            </Text>
          </View>
        )}
        {!isSearch && filters.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {filters.map((f) => {
              const on = f === filter;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{f}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.body}>
      {/* Live suggestions, over the results while typing. */}
      {isSearch && showSuggestions && (
        <View style={styles.suggestPanel}>
          <FlatList
            data={suggestions}
            keyExtractor={(sg) => sg.placeId}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={(
              <TouchableOpacity
                style={styles.suggestRow}
                onPress={() => submitSearch()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Search ${input.trim()} in ${destinationName}`}
              >
                <View style={[styles.suggestIcon, styles.suggestIconSearch]}>
                  <Feather name="search" size={15} color={COLORS.white} />
                </View>
                <Text style={styles.suggestSearchText} numberOfLines={1}>
                  Search "{input.trim()}" in {destinationName}
                </Text>
                {suggesting && <ActivityIndicator size="small" color={COLORS.accent} />}
              </TouchableOpacity>
            )}
            renderItem={({ item: sg }) => (
              <TouchableOpacity
                style={[styles.suggestRow, styles.suggestDivider]}
                onPress={() => openSuggestion(sg)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${sg.name}${sg.secondary ? `, ${sg.secondary}` : ''}`}
              >
                <View style={styles.suggestIcon}>
                  <Feather name={placeIconFor(sg)} size={15} color={COLORS.primary} />
                </View>
                <View style={styles.suggestText}>
                  <Text style={styles.suggestName} numberOfLines={1}>{sg.name}</Text>
                  {!!sg.secondary && <Text style={styles.suggestSub} numberOfLines={1}>{sg.secondary}</Text>}
                </View>
                {pickForTrip ? (
                  <TouchableOpacity
                    style={[styles.suggestAdd, pickedMap.has(sg.placeId) && styles.suggestAdded]}
                    onPress={() => togglePick(sg, { fromSuggestion: true })}
                    disabled={pickPending.has(sg.placeId)}
                    accessibilityRole="button"
                    accessibilityLabel={pickedMap.has(sg.placeId)
                      ? `Remove ${sg.name} from ${pickForTrip.tripName}`
                      : `Add ${sg.name} to ${pickForTrip.tripName}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {pickPending.has(sg.placeId) ? (
                      <ActivityIndicator size="small" color={pickedMap.has(sg.placeId) ? COLORS.white : COLORS.primary} />
                    ) : (
                      <Feather
                        name={pickedMap.has(sg.placeId) ? 'check' : 'plus'}
                        size={16}
                        color={pickedMap.has(sg.placeId) ? COLORS.white : COLORS.primary}
                      />
                    )}
                  </TouchableOpacity>
                ) : (
                  <Feather name="arrow-up-left" size={16} color={COLORS.textMuted} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <FlatList
        data={places}
        keyExtractor={(item) => item.placeId}
        renderItem={renderPlace}
        extraData={favedIds}
        numColumns={2}
        columnWrapperStyle={places.length > 0 ? styles.column : undefined}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Two-column grid cell (the card itself is PlaceGridCard).
  cardCell: {
    maxWidth: '48.5%',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm, // alpine frost (60%)
  },
  header: {
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_sm,
    paddingBottom: SIZES.spacing_md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    height: 44,
    paddingHorizontal: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
  },
  searchInput: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  chips: {
    gap: SIZES.spacing_sm,
    paddingTop: SIZES.spacing_md,
  },
  chip: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  chipTextOn: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
  },

  // Suggestions sit over the results, under the header.
  body: {
    flex: 1,
  },
  suggestPanel: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    backgroundColor: COLORS.white,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    minHeight: 56,
    paddingHorizontal: SIZES.spacing_base,
    backgroundColor: COLORS.white,
  },
  suggestDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  suggestIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
  },
  suggestIconSearch: {
    backgroundColor: COLORS.accentDeep,
  },
  suggestSearchText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  suggestAdd: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primaryLight,
  },
  suggestAdded: {
    backgroundColor: '#2B6A4B',
    borderColor: '#2B6A4B',
  },
  addingTo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  addingToText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  suggestText: {
    flex: 1,
    minWidth: 0,
  },
  suggestName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  suggestSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  list: {
    padding: SIZES.spacing_base,
    paddingBottom: 140, // clears the floating tab bar
    flexGrow: 1,
  },
  column: {
    gap: SIZES.spacing_base,
  },

  footerSpinner: {
    marginVertical: SIZES.spacing_lg,
  },
  footerEnd: {
    marginVertical: SIZES.spacing_lg,
    paddingHorizontal: SIZES.spacing_lg,
    textAlign: 'center',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  footerRetry: {
    alignSelf: 'center',
    marginVertical: SIZES.spacing_lg,
  },
  footerRetryText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  loader: {
    marginTop: SIZES.spacing_xxl,
  },
  state: {
    alignItems: 'center',
    paddingTop: SIZES.spacing_xxl,
    paddingHorizontal: SIZES.spacing_lg,
  },
  stateTitle: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  stateText: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  ideas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_lg,
  },
  idea: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 8,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  ideaText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  retry: {
    marginTop: SIZES.spacing_lg,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
  },
  retryText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
