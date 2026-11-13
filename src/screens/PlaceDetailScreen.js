import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Animated,
  Linking,
  Dimensions,
  Platform,
  Share,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons, Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { AddToTripSheet, PhotoViewer } from '../components';
import PlaceStories from '../components/PlaceStories';
import RatingRow from '../components/RatingRow';
import {
  getPlaceDetails,
  getFavourites,
  addFavourite,
  removeFavourite,
  getTripById,
  addPlaceToTrip,
  removeTripPlace,
  journalCategoryFor,
  AuthRequiredError,
} from '../services';
import { buildTripPlaceDto, toTripCategory } from '../utils/tripPlaces';
import { showAlert } from '../components/AppDialog';
import { areaFromAddress as areaOf, formatCentreDistance } from '../utils/address';
import { distanceKm } from '../utils/itinerary';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.5);
// Same canvas as the trip page, so the two read as one app.
const SHEET_BG = '#f3f5f7';
const GRID_PHOTOS = 6;
// The swipeable photos at the top show the first few; the Photos grid and
// the full-screen viewer have the rest (Google gives up to 10).
const HERO_PHOTOS = 5;

/** Readable category from the page it was opened from ("food" -> "Food"). */
function categoryLabel(category) {
  const c = (category || '').toLowerCase();
  if (!c) return null;
  if (c.startsWith('stay')) return 'Stay';
  if (c === 'activities') return 'Things to do';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

/** Neighbourhood from an address: "…, Halasuru, Bengaluru, Karnataka 560008, India" -> "Halasuru". */
function areaFromAddress(address) {
  const parts = (address || '').split(',').map((x) => x.replace(/\d+/g, '').trim()).filter(Boolean);
  if (parts.length >= 4) return parts[parts.length - 4];
  return parts[0] || '';
}

/** Google price level (0-4) as rupee symbols; 0 is free. */
function priceLabel(level) {
  if (level == null) return null;
  return level === 0 ? 'Free' : '₹'.repeat(level);
}

/** Today's line from Google's weekdayText (Monday first): "11:00 AM – 11:00 PM". */
function todaysHours(weekdayText) {
  if (!weekdayText?.length) return null;
  const line = weekdayText[(new Date().getDay() + 6) % 7] || '';
  return line.split(': ').slice(1).join(': ') || null;
}

/** Section heading: tinted icon bubble + title, as on the trip page. */
function SectionTitle({ icon, tint, color, title, right }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.sectionIcon, { backgroundColor: tint }]}>
          <Feather name={icon} size={15} color={color} />
        </View>
        <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

/**
 * PlaceDetailScreen — one place (a café, a hotel, a sight).
 *
 * Route params: { placeId, name, vicinity, photoUrl, rating, category, pickForTrip,
 *   city } — `city` ({ name, lat, lng }) adds "2.5 km from Dubai centre" when the
 *   page is opened from a city or trip.
 *
 * Built in the trip page's language:
 *  - Photo carousel hero with the place on it: category · area, name,
 *    rating badge + reviews pill, price (₹) and open status. Back, ♡ and
 *    share sit on the photo.
 *  - Add to trip as the one main button; Directions / Call / Website as
 *    small pills under it.
 *  - Stories from Wayraa travellers (our own), then Good to know (address,
 *    today's hours with the week on tap, phone, website, a small map),
 *    a photo grid (tap for full screen) and Google reviews.
 */
export default function PlaceDetailScreen({ navigation, route }) {
  const {
    placeId,
    name: routeName,
    vicinity: routeVicinity,
    photoUrl: routePhotoUrl,
    rating: routeRating,
    category,
    pickForTrip,
    city,
  } = route.params || {};

  const insets = useSafeAreaInsets();

  // ── Data ─────────────────────────────────────────────────────────────────
  const [details, setDetails] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getPlaceDetails(placeId).then((d) => {
      if (!cancelled && d) setDetails(d);
    });
    return () => { cancelled = true; };
  }, [placeId]);

  // Fall back to the route params while details load.
  const displayName = details?.name || routeName || 'Place';
  const displayAddress = details?.formattedAddress || routeVicinity || '';
  const displayRating = details?.rating ?? routeRating ?? null;
  const displayReviewCount = details?.userRatingsTotal ?? 0;
  const displayPhone = details?.formattedPhoneNumber || null;
  const displayWebsite = details?.website || null;
  const displayOpenNow = details?.openingHours?.openNow ?? null;
  const displayHours = details?.openingHours?.weekdayText ?? [];
  const displayReviews = details?.reviews ?? [];
  const displayCoords = details?.geometry
    ? { lat: details.geometry.latitude, lng: details.geometry.longitude }
    : null;
  const displayPhotos = (() => {
    const apiPhotos = (details?.photos || []).map((p) => p.url).filter(Boolean);
    if (apiPhotos.length > 0) return apiPhotos;
    return routePhotoUrl ? [routePhotoUrl] : [];
  })();
  const heroPhoto = displayPhotos[0] || null;
  // With the city known, the shared helper also handles "A - B - Dubai" addresses.
  const area = city?.name ? areaOf(displayAddress, city.name) : areaFromAddress(displayAddress);
  const kicker = [categoryLabel(category), area].filter(Boolean).join(' · ');
  const fromCentre = city && displayCoords
    ? formatCentreDistance(
      distanceKm({ latitude: city.lat, longitude: city.lng }, { latitude: displayCoords.lat, longitude: displayCoords.lng }),
      city.name,
    )
    : null;
  const price = priceLabel(details?.priceLevel);
  const today = todaysHours(displayHours);
  const todayIndex = (new Date().getDay() + 6) % 7;

  // ── Favourites ───────────────────────────────────────────────────────────
  const [isFaved, setIsFaved] = useState(false);
  const [favPending, setFavPending] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getFavourites()
        .then((favs) => { if (!cancelled) setIsFaved(favs.some((f) => f.placeId === placeId)); })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [placeId])
  );
  const toggleFavourite = useCallback(async () => {
    if (favPending) return;
    setFavPending(true);
    const wasFaved = isFaved;
    setIsFaved(!wasFaved); // optimistic
    try {
      if (wasFaved) {
        await removeFavourite(placeId);
      } else {
        const res = await addFavourite({
          placeId,
          placeName: displayName,
          vicinity: displayAddress,
          rating: displayRating,
          userRatingsTotal: displayReviewCount,
          photoUrl: heroPhoto,
          category: category ?? null,
        });
        if (!res.success) setIsFaved(wasFaved);
      }
    } catch (e) {
      setIsFaved(wasFaved);
      if (e instanceof AuthRequiredError) navigation.navigate('Welcome');
    } finally {
      setFavPending(false);
    }
  }, [favPending, isFaved, placeId, displayName, displayAddress, displayRating, displayReviewCount, heroPhoto, category, navigation]);

  // ── Add to trip ──────────────────────────────────────────────────────────
  const [tripSheetOpen, setTripSheetOpen] = useState(false);
  const tripSheetPlace = {
    placeId,
    name: displayName,
    vicinity: displayAddress,
    rating: displayRating,
    userRatingsTotal: displayReviewCount,
    category,
    photos: details?.photos,
    geometry: details?.geometry,
    previewUrl: heroPhoto,
  };
  // Came here while adding places to a trip stop (pickForTrip): the button
  // adds straight to that stop (and removes again), like the + on the cards.
  // pickedId: the trip place id when it's on the stop ('' = on it, id not
  // known yet), null when it isn't.
  const pickTripId = pickForTrip?.tripId;
  const pickDestId = pickForTrip?.destinationId;
  const [pickedId, setPickedId] = useState(() => {
    const hit = (pickForTrip?.saved || []).find(([pid]) => pid === placeId);
    return hit ? (hit[1] || '') : null;
  });
  const [picking, setPicking] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!pickTripId || !pickDestId) return undefined;
    let cancelled = false;
    getTripById(pickTripId).then((full) => {
      if (cancelled) return;
      const dest = (full?.destinations || []).find((d) => d.id === pickDestId);
      const tp = (dest?.places || []).find((p) => p.placeId === placeId);
      setPickedId(tp ? tp.id : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pickTripId, pickDestId, placeId]));

  const togglePick = async () => {
    if (!pickTripId || !pickDestId || picking) return;
    setPicking(true);
    try {
      if (pickedId !== null) {
        let id = pickedId;
        if (!id) {
          const full = await getTripById(pickTripId);
          const dest = (full?.destinations || []).find((d) => d.id === pickDestId);
          id = (dest?.places || []).find((p) => p.placeId === placeId)?.id || '';
        }
        if (id) await removeTripPlace(id);
        setPickedId(null);
      } else {
        const fromTypes = journalCategoryFor(details?.types || []);
        const cat = toTripCategory(category)
          || (fromTypes === 'food' ? 'food' : fromTypes === 'stay' ? 'stay' : 'activity');
        const res = await addPlaceToTrip(pickTripId, pickDestId, buildTripPlaceDto({
          placeId,
          name: displayName,
          vicinity: displayAddress,
          rating: displayRating,
          userRatingsTotal: displayReviewCount,
          photos: details?.photos,
          geometry: details?.geometry,
        }, cat));
        setPickedId(res?.id || '');
      }
    } catch (e) {
      showAlert(
        'Could not update trip',
        e instanceof AuthRequiredError ? 'Sign in to edit your trips.' : (e?.message || 'Please try again.'),
      );
    } finally {
      setPicking(false);
    }
  };
  const isPicked = pickedId !== null;

  const openTripFromSheet = (tripId, tripName) => {
    navigation.getParent()?.navigate('MyTrips', {
      screen: 'TripDetail',
      params: { tripId, tripName },
      initial: false,
    });
  };

  // ── Photos, hours, reviews ───────────────────────────────────────────────
  const [viewerIndex, setViewerIndex] = useState(null);
  const [heroPage, setHeroPage] = useState(0);
  // Reviews pager: its width (one review per page) and the page shown.
  const [reviewWidth, setReviewWidth] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);

  // Hero photos loop: swiping past the last comes back to the first (and back
  // from the first to the last). The pager holds [last, ...photos, first];
  // landing on a copy jumps, without animation, to the real photo.
  const heroRef = useRef(null);
  const heroPlaced = useRef(false);
  const heroPhotos = displayPhotos.slice(0, HERO_PHOTOS);
  const heroCount = heroPhotos.length;
  const heroLoops = heroCount > 1;
  // [url, index of the real photo] per slide, copies at both ends.
  const heroSlides = heroLoops
    ? [[heroPhotos[heroCount - 1], heroCount - 1], ...heroPhotos.map((u, i) => [u, i]), [heroPhotos[0], 0]]
    : heroPhotos.map((u, i) => [u, i]);
  // Only the photo on screen and its neighbours are loaded (each is a paid
  // Google request); the others load as you swipe to them.
  const heroNear = (i) => {
    const d = Math.abs(i - heroPage);
    return d <= 1 || d === heroCount - 1;
  };
  const onHeroScrollEnd = (e) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (!heroLoops) {
      setHeroPage(page);
      return;
    }
    if (page === 0) {
      heroRef.current?.scrollTo({ x: heroCount * SCREEN_WIDTH, animated: false });
      setHeroPage(heroCount - 1);
    } else if (page === heroCount + 1) {
      heroRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: false });
      setHeroPage(0);
    } else {
      setHeroPage(page - 1);
    }
  };
  // Start on the first real photo (again when more photos arrive).
  useEffect(() => {
    setHeroPage(0);
    if (heroLoops) heroRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: false });
  }, [heroCount, heroLoops]);
  const [hoursExpanded, setHoursExpanded] = useState(false);

  // ── Scroll: sticky header + status bar ───────────────────────────────────
  const scrollY = useRef(new Animated.Value(0)).current;

  // Tapping the rating in the header scrolls down to the Google reviews.
  const scrollRef = useRef(null);
  const sheetY = useRef(0);
  const reviewsY = useRef(null);
  const scrollToReviews = () => {
    if (reviewsY.current == null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, sheetY.current + reviewsY.current - 80), animated: true });
  };
  // The compact bar takes over as soon as the photo starts moving up (about
  // when its own back / share / ♡ buttons would slide under the status bar).
  const HEADER_SHOW_AT = 60;
  const headerOpacity = scrollY.interpolate({
    inputRange: [HEADER_SHOW_AT - 40, HEADER_SHOW_AT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const [darkStatusBar, setDarkStatusBar] = useState(false);
  const darkRef = useRef(false);
  const onScroll = (e) => {
    const dark = e.nativeEvent.contentOffset.y > HEADER_SHOW_AT - 20;
    if (dark !== darkRef.current) {
      darkRef.current = dark;
      setDarkStatusBar(dark);
    }
  };

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleDirections = () => {
    const query = displayCoords ? `${displayCoords.lat},${displayCoords.lng}` : encodeURIComponent(displayAddress);
    const url = Platform.OS === 'ios' ? `maps://?q=${query}` : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${query}`));
  };
  const handleCall = () => { if (displayPhone) Linking.openURL(`tel:${displayPhone}`); };
  const handleWebsite = () => { if (displayWebsite) Linking.openURL(displayWebsite); };
  const handleShare = () => {
    const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}&query_place_id=${encodeURIComponent(placeId)}`;
    Share.share(
      { message: `${displayName}${displayAddress ? `, ${displayAddress}` : ''}\n${link}`, url: link },
      { subject: displayName }
    ).catch(() => {});
  };

  const roundButton = (icon, onPress, label, active = false) => (
    <TouchableOpacity
      style={styles.roundButton}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name={icon} size={20} color={active ? COLORS.accent : COLORS.white} />
    </TouchableOpacity>
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle={darkStatusBar ? 'dark-content' : 'light-content'} animated />

      {/* Compact header that fades in once the photo scrolls away. */}
      <Animated.View
        style={[styles.stickyHeader, { opacity: headerOpacity, paddingTop: insets.top }]}
        pointerEvents={darkStatusBar ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.stickyButton} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.stickyTitle} numberOfLines={1}>{displayName}</Text>
        <TouchableOpacity style={styles.stickyButton} onPress={handleShare} accessibilityLabel="Share this place">
          <Ionicons name="share-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.stickyButton}
          onPress={toggleFavourite}
          accessibilityLabel={isFaved ? 'Remove from favourites' : 'Save to favourites'}
        >
          <Ionicons name={isFaved ? 'heart' : 'heart-outline'} size={20} color={isFaved ? COLORS.accent : COLORS.textPrimary} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: onScroll,
        })}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* ── Hero: photos (swipe), the place on top ── */}
        <View style={styles.hero}>
          {heroPhoto ? (
            <ScrollView
              ref={heroRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: heroLoops ? SCREEN_WIDTH : 0, y: 0 }}
              onLayout={() => {
                // Android may ignore contentOffset: place it on the first photo once.
                if (heroLoops && !heroPlaced.current) {
                  heroPlaced.current = true;
                  heroRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: false });
                }
              }}
              onMomentumScrollEnd={onHeroScrollEnd}
              accessibilityLabel={`Photos of ${displayName}, ${heroPage + 1} of ${heroCount}`}
            >
              {heroSlides.map(([url, real], i) => (
                heroNear(real)
                  ? <Image key={i} source={{ uri: url }} style={styles.heroImage} contentFit="cover" transition={200} />
                  : <View key={i} style={[styles.heroImage, styles.heroImagePending]} />
              ))}
            </ScrollView>
          ) : (
            <LinearGradient colors={[COLORS.primary, '#0a5274']} style={styles.heroImage} />
          )}
          <LinearGradient colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0)']} style={styles.heroTopShade} pointerEvents="none" />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.75)']}
            locations={[0, 0.4, 1]}
            style={styles.heroBottomShade}
            pointerEvents="none"
          />

          <View style={[styles.heroControls, { top: insets.top + SIZES.spacing_sm }]} pointerEvents="box-none">
            {roundButton('chevron-back', () => navigation.goBack(), 'Go back')}
            <View style={styles.heroControlsRight}>
              {roundButton('share-outline', handleShare, 'Share this place')}
              {roundButton(isFaved ? 'heart' : 'heart-outline', toggleFavourite, isFaved ? 'Remove from favourites' : 'Save to favourites', isFaved)}
            </View>
          </View>

          <View style={styles.heroText} pointerEvents="box-none">
            {/* Only the rating takes taps here; the rest lets swipes reach the photos. */}
            {!!kicker && <Text style={styles.heroKicker} numberOfLines={1} pointerEvents="none">{kicker}</Text>}
            <Text style={styles.heroTitle} numberOfLines={2} accessibilityRole="header" pointerEvents="none">{displayName}</Text>
            <View style={styles.heroMeta} pointerEvents="box-none">
              {displayReviews.length > 0 ? (
                <TouchableOpacity
                  onPress={scrollToReviews}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityHint="Shows the Google reviews"
                >
                  <RatingRow rating={displayRating} reviews={displayReviewCount} variant="badge" />
                </TouchableOpacity>
              ) : (
                <View pointerEvents="none">
                  <RatingRow rating={displayRating} reviews={displayReviewCount} variant="badge" />
                </View>
              )}
              {!!price && (
                <View style={styles.heroChip} pointerEvents="none">
                  <Text style={styles.heroChipText}>{price}</Text>
                </View>
              )}
              {displayOpenNow !== null && (
                <View style={styles.heroChip} pointerEvents="none">
                  <View style={[styles.openDot, { backgroundColor: displayOpenNow ? '#4ade80' : '#fb923c' }]} />
                  <Text style={styles.heroChipText}>{displayOpenNow ? 'Open now' : 'Closed'}</Text>
                </View>
              )}
            </View>
            {heroCount > 1 && (
              <View style={styles.heroDots} pointerEvents="none">
                {heroPhotos.map((_, i) => (
                  <View key={i} style={[styles.heroDot, i === heroPage && styles.heroDotOn]} />
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── Sheet ── */}
        <View style={styles.sheet} onLayout={(e) => { sheetY.current = e.nativeEvent.layout.y; }}>
          {/* Main action + quick actions */}
          <View style={styles.card}>
            {pickForTrip ? (
              // Adding places to a trip stop: straight in (or out), no sheet.
              <TouchableOpacity
                style={[styles.addButton, isPicked && styles.addButtonAdded]}
                onPress={togglePick}
                disabled={picking}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityState={{ selected: isPicked, busy: picking }}
                accessibilityLabel={isPicked
                  ? `Added to ${pickForTrip.tripName || 'your trip'}. Tap to remove`
                  : `Add to ${pickForTrip.tripName || 'your trip'}`}
              >
                {picking ? (
                  <ActivityIndicator color={isPicked ? COLORS.success : COLORS.white} />
                ) : (
                  <>
                    <Feather name={isPicked ? 'check' : 'plus'} size={18} color={isPicked ? '#1b7a3e' : COLORS.white} />
                    <Text style={[styles.addButtonText, isPicked && styles.addButtonTextAdded]} numberOfLines={1}>
                      {isPicked ? 'Added to ' : 'Add to '}{pickForTrip.tripName || 'your trip'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setTripSheetOpen(true)}
                activeOpacity={0.9}
                accessibilityRole="button"
              >
                <Feather name="plus" size={18} color={COLORS.white} />
                <Text style={styles.addButtonText}>Add to trip</Text>
              </TouchableOpacity>
            )}
            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quick} onPress={handleDirections} activeOpacity={0.85} accessibilityRole="button">
                <Feather name="navigation" size={15} color={COLORS.primary} />
                <Text style={styles.quickText}>Directions</Text>
              </TouchableOpacity>
              {!!displayPhone && (
                <TouchableOpacity style={styles.quick} onPress={handleCall} activeOpacity={0.85} accessibilityRole="button">
                  <Feather name="phone" size={15} color={COLORS.primary} />
                  <Text style={styles.quickText}>Call</Text>
                </TouchableOpacity>
              )}
              {!!displayWebsite && (
                <TouchableOpacity style={styles.quick} onPress={handleWebsite} activeOpacity={0.85} accessibilityRole="button">
                  <Feather name="globe" size={15} color={COLORS.primary} />
                  <Text style={styles.quickText}>Website</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Stories from Wayraa travellers: ours, so it comes first. */}
          <PlaceStories
            placeId={placeId}
            placeName={displayName}
            navigation={navigation}
            prefill={{ placeId, name: displayName, address: displayAddress, coords: displayCoords, category }}
          />

          {/* Good to know: address, hours, phone, website, map */}
          <View style={styles.card}>
            <SectionTitle icon="info" tint="#e6f4fb" color={COLORS.primaryLight} title="Good to know" />

            {!!displayAddress && (
              <View style={styles.infoRow} accessible accessibilityLabel={`Address: ${displayAddress}`}>
                <View style={styles.infoIcon}><Feather name="map-pin" size={16} color={COLORS.accentDeep} /></View>
                <Text style={styles.infoText} numberOfLines={3} selectable>{displayAddress}</Text>
              </View>
            )}

            {!!fromCentre && (
              <View style={[styles.infoRow, styles.infoDivider]} accessible accessibilityLabel={`${fromCentre}, in a straight line`}>
                <View style={styles.infoIcon}><Feather name="navigation" size={16} color={COLORS.accentDeep} /></View>
                <Text style={styles.infoText} numberOfLines={1}>{fromCentre}</Text>
              </View>
            )}

            {(displayOpenNow !== null || displayHours.length > 0) && (
              <>
                <TouchableOpacity
                  style={[styles.infoRow, styles.infoDivider]}
                  onPress={() => displayHours.length && setHoursExpanded((v) => !v)}
                  activeOpacity={displayHours.length ? 0.7 : 1}
                  accessibilityRole={displayHours.length ? 'button' : undefined}
                  accessibilityState={displayHours.length ? { expanded: hoursExpanded } : undefined}
                >
                  <View style={styles.infoIcon}><Feather name="clock" size={16} color={COLORS.accentDeep} /></View>
                  <Text style={styles.infoText} numberOfLines={1}>
                    {displayOpenNow !== null && (
                      <Text style={{ color: displayOpenNow ? '#2e9e57' : '#c2410c', fontFamily: 'Poppins_600SemiBold' }}>
                        {displayOpenNow ? 'Open now' : 'Closed'}
                      </Text>
                    )}
                    {today ? `${displayOpenNow !== null ? ' · ' : ''}${today}` : ''}
                  </Text>
                  {displayHours.length > 0 && (
                    <Feather name={hoursExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
                  )}
                </TouchableOpacity>
                {hoursExpanded && (
                  <View style={styles.hoursList}>
                    {displayHours.map((line, i) => {
                      const [day, ...rest] = line.split(': ');
                      const isToday = i === todayIndex;
                      return (
                        <View key={i} style={styles.hoursRow}>
                          <Text style={[styles.hoursDay, isToday && styles.hoursToday]}>{day}</Text>
                          <Text style={[styles.hoursTime, isToday && styles.hoursToday]}>{rest.join(': ') || line}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            {!!displayPhone && (
              <TouchableOpacity style={[styles.infoRow, styles.infoDivider]} onPress={handleCall} activeOpacity={0.7} accessibilityRole="button">
                <View style={styles.infoIcon}><Feather name="phone" size={16} color={COLORS.accentDeep} /></View>
                <Text style={styles.infoText}>{displayPhone}</Text>
              </TouchableOpacity>
            )}

            {!!displayWebsite && (
              <TouchableOpacity style={[styles.infoRow, styles.infoDivider]} onPress={handleWebsite} activeOpacity={0.7} accessibilityRole="link">
                <View style={styles.infoIcon}><Feather name="globe" size={16} color={COLORS.accentDeep} /></View>
                <Text style={styles.infoText} numberOfLines={1}>{displayWebsite.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</Text>
                <Feather name="external-link" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}

            {displayCoords && (
              <TouchableOpacity style={styles.mapWrap} onPress={handleDirections} activeOpacity={0.95} accessibilityRole="button" accessibilityLabel="Open in Maps">
                <MapView
                  provider={PROVIDER_DEFAULT}
                  style={styles.map}
                  region={{ latitude: displayCoords.lat, longitude: displayCoords.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  pointerEvents="none"
                >
                  <Marker coordinate={{ latitude: displayCoords.lat, longitude: displayCoords.lng }} title={displayName} />
                </MapView>
                <View style={styles.mapPill}>
                  <Feather name="navigation" size={13} color={COLORS.white} />
                  <Text style={styles.mapPillText}>Open in Maps</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          {/* Photos: a grid, tap for full screen */}
          {displayPhotos.length > 1 && (
            <View style={styles.card}>
              <SectionTitle
                icon="image"
                tint="#e8f5e9"
                color="#2e7d32"
                title="Photos"
                right={<Text style={styles.sectionCount}>{displayPhotos.length}</Text>}
              />
              <View style={styles.photoGrid}>
                {displayPhotos.slice(0, GRID_PHOTOS).map((url, i) => {
                  const extra = displayPhotos.length - GRID_PHOTOS;
                  const showMore = i === GRID_PHOTOS - 1 && extra > 0;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.photoCell}
                      onPress={() => setViewerIndex(i)}
                      activeOpacity={0.85}
                      accessibilityRole="imagebutton"
                      accessibilityLabel={`Photo ${i + 1} of ${displayPhotos.length}`}
                    >
                      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                      {showMore && (
                        <View style={styles.photoMore}>
                          <Text style={styles.photoMoreText}>+{extra}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Google reviews */}
          {displayReviews.length > 0 && (
            <View style={styles.card} onLayout={(e) => { reviewsY.current = e.nativeEvent.layout.y; }}>
              <SectionTitle
                icon="message-square"
                tint="#fff6e0"
                color="#b7791f"
                title="Google reviews"
                right={<RatingRow rating={displayRating} reviews={displayReviewCount} />}
              />
              {/* One review per page, full width, with dots like the photos. */}
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onLayout={(e) => setReviewWidth(e.nativeEvent.layout.width)}
                onMomentumScrollEnd={(e) => {
                  if (reviewWidth) setReviewPage(Math.round(e.nativeEvent.contentOffset.x / reviewWidth));
                }}
              >
                {displayReviews.map((review, i) => (
                  <View key={i} style={[styles.review, { width: reviewWidth || REVIEW_WIDTH }]}>
                    <View style={styles.reviewHead}>
                      {review.profilePhotoUrl ? (
                        <Image source={{ uri: review.profilePhotoUrl }} style={styles.reviewAvatar} />
                      ) : (
                        <View style={[styles.reviewAvatar, styles.reviewAvatarFallback]}>
                          <Text style={styles.reviewAvatarText}>{(review.authorName?.[0] || '?').toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={styles.reviewWho}>
                        <Text style={styles.reviewName} numberOfLines={1}>{review.authorName}</Text>
                        <Text style={styles.reviewTime}>{review.relativeTimeDescription}</Text>
                      </View>
                      <RatingRow rating={review.rating} />
                    </View>
                    <Text style={styles.reviewText} numberOfLines={6}>{review.text}</Text>
                  </View>
                ))}
              </ScrollView>
              {displayReviews.length > 1 && (
                <View style={styles.reviewDots} accessibilityLabel={`Review ${reviewPage + 1} of ${displayReviews.length}`}>
                  {displayReviews.map((_, i) => (
                    <View key={i} style={[styles.reviewDot, i === reviewPage && styles.reviewDotOn]} />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      <PhotoViewer
        visible={viewerIndex !== null}
        photos={displayPhotos}
        initialIndex={viewerIndex || 0}
        onClose={() => setViewerIndex(null)}
      />
      <AddToTripSheet
        visible={tripSheetOpen}
        place={tripSheetPlace}
        preselect={pickForTrip}
        onClose={() => setTripSheetOpen(false)}
        onSignIn={() => { setTripSheetOpen(false); navigation.navigate('Welcome'); }}
        onCreateTrip={() => { setTripSheetOpen(false); navigation.getParent()?.navigate('Explore'); }}
        onViewTrip={openTripFromSheet}
      />
    </View>
  );
}

// Until the reviews pager is measured: the card's inner width.
const REVIEW_WIDTH = SCREEN_WIDTH - SIZES.spacing_base * 4 - 2;
// 3 across: screen minus the sheet's and card's side padding, the card's
// 1px borders and the two gaps; rounded down so the row never wraps.
const PHOTO_CELL = Math.floor((SCREEN_WIDTH - SIZES.spacing_base * 4 - 2 - SIZES.spacing_sm * 2) / 3);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SHEET_BG,
  },

  // Sticky header
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  stickyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  stickyTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },

  // Hero
  hero: {
    height: HERO_HEIGHT,
    backgroundColor: COLORS.primary,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroTopShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  heroBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  heroControls: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroControlsRight: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  // Sits above the sheet, which overlaps the photo by 24px.
  heroText: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    right: SIZES.spacing_lg,
    bottom: 24 + SIZES.spacing_base,
  },
  heroKicker: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    marginTop: 2,
    fontSize: 28,
    lineHeight: 36,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_sm,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroChipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  openDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  heroImagePending: {
    backgroundColor: COLORS.primary,
  },
  heroDots: {
    flexDirection: 'row',
    gap: 5,
    marginTop: SIZES.spacing_md,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  heroDotOn: {
    width: 16,
    backgroundColor: COLORS.white,
  },

  // Sheet + cards (same as the trip page)
  sheet: {
    marginTop: -24,
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_base,
    gap: SIZES.spacing_md,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: SHEET_BG,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    borderWidth: 1,
    borderColor: '#e9edf1',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_md,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    flexShrink: 1,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  sectionCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },

  // Actions
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    height: 50,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
  },
  addButtonText: {
    flexShrink: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  // Already on the trip stop: a calm green outline instead of the orange fill.
  addButtonAdded: {
    paddingHorizontal: SIZES.spacing_base,
    backgroundColor: '#eaf6ee',
    borderWidth: 1.5,
    borderColor: '#9fd3b0',
  },
  addButtonTextAdded: {
    color: '#1b7a3e',
  },
  quickRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_md,
  },
  quick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#e6f4fb',
  },
  quickText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },

  // Good to know
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    minHeight: 52,
    paddingVertical: SIZES.spacing_sm,
  },
  infoDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: SIZES.radius_sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff1e8',
  },
  infoText: {
    flex: 1,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  hoursList: {
    paddingLeft: 34 + SIZES.spacing_md,
    paddingBottom: SIZES.spacing_sm,
    gap: 4,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SIZES.spacing_md,
  },
  hoursDay: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  hoursTime: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  hoursToday: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  mapWrap: {
    height: 150,
    marginTop: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  mapPill: {
    position: 'absolute',
    right: SIZES.spacing_sm,
    bottom: SIZES.spacing_sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.primary,
  },
  mapPillText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },

  // Photos
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
  },
  photoCell: {
    width: PHOTO_CELL,
    height: PHOTO_CELL,
    borderRadius: SIZES.radius_md,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
  },
  photoMore: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  photoMoreText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },

  // Reviews
  reviewDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: SIZES.spacing_md,
  },
  reviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#d5dbe2',
  },
  reviewDotOn: {
    width: 16,
    backgroundColor: COLORS.primary,
  },
  review: {
    width: REVIEW_WIDTH,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: SHEET_BG,
  },
  reviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
  },
  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reviewAvatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
  },
  reviewAvatarText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  reviewWho: {
    flex: 1,
    minWidth: 0,
  },
  reviewName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  reviewTime: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  reviewText: {
    fontSize: SIZES.sm,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
});
