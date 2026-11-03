import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ScrollView,
  Animated,
  Linking,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import {
  getPlaceDetails,
  getFavourites,
  addFavourite,
  removeFavourite,
  AuthRequiredError,
} from '../services';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const HERO_HEIGHT = SCREEN_HEIGHT * 0.52;

/**
 * Price level dots — Google returns 0-4 (0 = free, 4 = very expensive).
 */
function PriceLevel({ level }) {
  if (!level && level !== 0) return null;
  return (
    <View style={styles.priceLevelRow}>
      {[1, 2, 3, 4].map((i) => (
        <Text key={i} style={[styles.priceDot, i <= level && styles.priceDotActive]}>
          $
        </Text>
      ))}
    </View>
  );
}

/**
 * Star row — renders filled / half / empty stars for a rating.
 */
function Stars({ rating, size = 14 }) {
  if (!rating) return null;
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name =
          i <= Math.floor(rating)
            ? 'star'
            : i - 0.5 <= rating
            ? 'star-half'
            : 'star-outline';
        return <Ionicons key={i} name={name} size={size} color="#FFC107" />;
      })}
    </View>
  );
}

/**
 * PlaceDetailScreen
 *
 * Route params: { placeId, name, vicinity, photoUrl, rating, category }
 *
 * Displays:
 *  - Full-bleed hero with gradient overlay, back button, and heart
 *  - Identity block: name, address, rating, review count, price level, open now
 *  - Quick actions: Directions, Call, Website, Save
 *  - Opening hours (expandable)
 *  - Reviews (horizontal scroll)
 *  - Photo gallery (horizontal scroll of all photos)
 */
export default function PlaceDetailScreen({ navigation, route }) {
  const {
    placeId,
    name: routeName,
    vicinity: routeVicinity,
    photoUrl: routePhotoUrl,
    rating: routeRating,
    category,
  } = route.params || {};

  const insets = useSafeAreaInsets();

  // ── Data ────────────────────────────────────────────────────────────────────
  const [details, setDetails] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getPlaceDetails(placeId).then((d) => {
      if (!cancelled && d) setDetails(d);
    });
    return () => { cancelled = true; };
  }, [placeId]);

  // Derived display values — fall back to route params while loading.
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

  // Debug — log what the API returns so we can see if coords arrive
  useEffect(() => {
    if (details) {
      console.log('[PlaceDetail] geometry:', JSON.stringify(details.geometry));
    }
  }, [details]);
  // Build photo array: merge proxied API photos with the route-param thumbnail.
  const displayPhotos = (() => {
    const apiPhotos = (details?.photos || []).map((p) => p.url).filter(Boolean);
    if (apiPhotos.length > 0) return apiPhotos;
    if (routePhotoUrl) return [routePhotoUrl];
    return [];
  })();
  const heroPhoto = displayPhotos[0] || null;

  // ── Favourites ──────────────────────────────────────────────────────────────
  const [isFaved, setIsFaved] = useState(false);
  const [favPending, setFavPending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const favs = await getFavourites();
          if (!cancelled) setIsFaved(favs.some((f) => f.placeId === placeId));
        } catch (_) {}
      })();
      return () => { cancelled = true; };
    }, [placeId])
  );

  const toggleFavourite = useCallback(async () => {
    if (favPending) return;
    setFavPending(true);
    const wasF = isFaved;
    setIsFaved(!wasF); // optimistic
    try {
      if (wasF) {
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
        if (!res.success) setIsFaved(wasF); // revert
      }
    } catch (e) {
      setIsFaved(wasF); // revert
      if (e instanceof AuthRequiredError) {
        // Could show a sign-in prompt here
      }
    } finally {
      setFavPending(false);
    }
  }, [favPending, isFaved, placeId, displayName, displayAddress, displayRating, displayReviewCount, heroPhoto, category]);

  // ── Hours expand ────────────────────────────────────────────────────────────
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const [activeReview, setActiveReview] = useState(0);

  // ── Scroll tracking for sticky header only ───────────────────────────────────
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({
    inputRange: [HERO_HEIGHT - 80, HERO_HEIGHT - 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ── Quick actions ────────────────────────────────────────────────────────────
  const handleDirections = () => {
    const query = displayCoords
      ? `${displayCoords.lat},${displayCoords.lng}`
      : encodeURIComponent(displayAddress);
    const url = Platform.OS === 'ios'
      ? `maps://?q=${query}`
      : `geo:0,0?q=${query}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${query}`)
    );
  };

  const handleCall = () => {
    if (displayPhone) Linking.openURL(`tel:${displayPhone}`);
  };

  const handleWebsite = () => {
    if (displayWebsite) Linking.openURL(displayWebsite);
  };

  // ── Main render ──────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* ── Sticky compact header (fades in as you scroll past hero) ── */}
      <Animated.View
        style={[styles.stickyHeader, { opacity: headerOpacity, paddingTop: insets.top }]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          style={styles.stickyBackBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.stickyTitle} numberOfLines={1}>{displayName}</Text>
        <TouchableOpacity
          style={styles.stickyHeartBtn}
          onPress={toggleFavourite}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isFaved ? 'heart' : 'heart-outline'}
            size={20}
            color={isFaved ? COLORS.accent : COLORS.textPrimary}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Scrollable body ── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* ── Hero image — static, no parallax ── */}
        <View style={styles.heroContainer}>
          {heroPhoto ? (
            <Image source={{ uri: heroPhoto }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={[styles.heroImage, styles.heroPlaceholder]}>
              <Ionicons name="image-outline" size={52} color={COLORS.textMuted} />
            </View>
          )}

          {/* Back + heart float over the image */}
          <View style={[styles.heroControls, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-back" size={22} color={COLORS.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.heartBtn, isFaved && styles.heartBtnActive]}
              onPress={toggleFavourite}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isFaved ? 'heart' : 'heart-outline'}
                size={20}
                color={isFaved ? COLORS.accent : COLORS.white}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── White sheet with rounded top corners — overlaps image bottom ── */}
        <View style={styles.sheet}>

          {/* Cards stack */}
          <View style={styles.cardsStack}>

          {/* Card 0 — Name + rating — dark accent card */}
          <View style={[styles.card, styles.heroCard]}>
            <View style={styles.heroMeta}>
              {/* Category chip */}
              {category && (
                <View style={styles.categoryChip}>
                  <Text style={styles.categoryChipText}>{category}</Text>
                </View>
              )}

              {/* Name */}
              <Text style={styles.heroTitle} numberOfLines={2}>{displayName}</Text>

              {/* Address */}
              {!!displayAddress && (
                <View style={styles.heroAddressRow}>
                  <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.6)" />
                  <Text style={styles.heroAddressText} numberOfLines={2}>{displayAddress}</Text>
                </View>
              )}

              {/* Divider */}
              <View style={styles.heroMetaDivider} />

              {/* Stats strip */}
              <View style={styles.statStrip}>
                {displayRating > 0 && (
                  <View style={styles.statPill}>
                    <Ionicons name="star" size={12} color="#FFC107" />
                    <Text style={styles.statPillText}>{displayRating.toFixed(1)}</Text>
                    {displayReviewCount > 0 && (
                      <Text style={styles.statPillSub}>({displayReviewCount.toLocaleString()})</Text>
                    )}
                  </View>
                )}
                {details?.priceLevel > 0 && (
                  <View style={[styles.statPill, styles.statPillSecondary]}>
                    <Text style={[styles.statPillText, { color: 'rgba(255,255,255,0.8)' }]}>
                      {'$'.repeat(details.priceLevel)}
                    </Text>
                  </View>
                )}
                {displayOpenNow !== null && (
                  <View style={[styles.statPill, {
                    backgroundColor: displayOpenNow ? 'rgba(76,175,80,0.2)' : 'rgba(232,93,4,0.2)',
                    borderColor: displayOpenNow ? 'rgba(76,175,80,0.4)' : 'rgba(232,93,4,0.4)',
                  }]}>
                    <View style={[styles.heroOpenDot, { backgroundColor: displayOpenNow ? '#81C784' : '#FFB74D' }]} />
                    <Text style={[styles.statPillText, { color: displayOpenNow ? '#81C784' : '#FFB74D' }]}>
                      {displayOpenNow ? 'Open now' : 'Closed'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Card 1 — Quick actions */}
          <View style={styles.card}>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleDirections} activeOpacity={0.8}>
                <View style={styles.actionIcon}>
                  <Ionicons name="navigate-outline" size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.actionLabel}>Directions</Text>
              </TouchableOpacity>

              {displayPhone && (
                <TouchableOpacity style={styles.actionBtn} onPress={handleCall} activeOpacity={0.8}>
                  <View style={styles.actionIcon}>
                    <Ionicons name="call-outline" size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.actionLabel}>Call</Text>
                </TouchableOpacity>
              )}

              {displayWebsite && (
                <TouchableOpacity style={styles.actionBtn} onPress={handleWebsite} activeOpacity={0.8}>
                  <View style={styles.actionIcon}>
                    <Ionicons name="globe-outline" size={20} color={COLORS.primary} />
                  </View>
                  <Text style={styles.actionLabel}>Website</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.actionBtn} onPress={toggleFavourite} activeOpacity={0.8}>
                <View style={[styles.actionIcon, isFaved && styles.actionIconActive]}>
                  <Ionicons
                    name={isFaved ? 'heart' : 'heart-outline'}
                    size={20}
                    color={isFaved ? COLORS.accent : COLORS.primary}
                  />
                </View>
                <Text style={[styles.actionLabel, isFaved && { color: COLORS.accent }]}>
                  {isFaved ? 'Saved' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Card 2 — Address, open status, phone, website */}
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="location" size={16} color={COLORS.accent} />
              </View>
              <Text style={styles.infoText} numberOfLines={2}>{displayAddress}</Text>
            </View>
            {displayOpenNow !== null && (
              <View style={styles.infoRow}>
                <View style={styles.infoIconWrap}>
                  <View style={[styles.openDot, { backgroundColor: displayOpenNow ? '#4CAF50' : '#e85d04' }]} />
                </View>
                <Text style={[styles.infoText, { color: displayOpenNow ? '#4CAF50' : '#e85d04', fontFamily: 'Poppins_600SemiBold' }]}>
                  {displayOpenNow ? 'Open now' : 'Closed'}
                </Text>
              </View>
            )}
            {displayPhone && (
              <TouchableOpacity style={styles.infoRow} onPress={handleCall} activeOpacity={0.8}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name="call" size={15} color={COLORS.primary} />
                </View>
                <Text style={[styles.infoText, styles.infoLink]}>{displayPhone}</Text>
              </TouchableOpacity>
            )}
            {displayWebsite && (
              <View style={[styles.infoRow, styles.infoRowLast]}>
                <View style={styles.infoIconWrap}>
                  <Ionicons name="globe" size={15} color={COLORS.primary} />
                </View>
                <TouchableOpacity onPress={handleWebsite} activeOpacity={0.8} style={{ flex: 1 }}>
                  <Text style={[styles.infoText, styles.infoLink]} numberOfLines={1}>{displayWebsite}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Card 3 — Map */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="map-outline" size={18} color={COLORS.primary} />
                <Text style={styles.sectionTitle}>Location</Text>
              </View>
              <TouchableOpacity onPress={handleDirections} activeOpacity={0.8}>
                <Text style={styles.directionsLink}>Get directions</Text>
              </TouchableOpacity>
            </View>
            {displayCoords ? (
              <TouchableOpacity
                activeOpacity={0.95}
                onPress={handleDirections}
                style={styles.mapWrap}
              >
                <MapView
                  provider={PROVIDER_DEFAULT}
                  style={styles.map}
                  region={{
                    latitude: displayCoords.lat,
                    longitude: displayCoords.lng,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  pointerEvents="none"
                >
                  <Marker
                    coordinate={{ latitude: displayCoords.lat, longitude: displayCoords.lng }}
                    title={displayName}
                  />
                </MapView>
                <View style={styles.mapTapOverlay}>
                  <View style={styles.mapDirectionsPill}>
                    <Ionicons name="navigate" size={14} color={COLORS.white} />
                    <Text style={styles.mapDirectionsText}>Open in Maps</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={[styles.mapWrap, styles.mapPlaceholder]}>
                <Ionicons name="location-outline" size={32} color={COLORS.textMuted} />
                <Text style={styles.mapPlaceholderText}>
                  {details ? 'Location unavailable' : 'Loading map…'}
                </Text>
              </View>
            )}
          </View>

          {/* Card 4 — Opening hours (only if available) */}
          {displayHours.length > 0 && (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setHoursExpanded((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Ionicons name="time-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Opening hours</Text>
                </View>
                <View style={styles.sectionHeaderRight}>
                  {displayOpenNow !== null && (
                    <Text style={[styles.openStatusInline, { color: displayOpenNow ? '#4CAF50' : COLORS.accent }]}>
                      {displayOpenNow ? 'Open' : 'Closed'}
                    </Text>
                  )}
                  <Ionicons
                    name={hoursExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={COLORS.textMuted}
                  />
                </View>
              </TouchableOpacity>
              {hoursExpanded && (
                <View style={styles.hoursList}>
                  {displayHours.map((line, i) => {
                    const [day, ...rest] = line.split(': ');
                    const time = rest.join(': ');
                    return (
                      <View key={i} style={styles.hoursRow}>
                        <Text style={styles.hoursDay}>{day}</Text>
                        <Text style={styles.hoursTime}>{time || line}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Card 5 — Photos (only if multiple) */}
          {displayPhotos.length > 1 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Ionicons name="images-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Photos</Text>
                </View>
                <Text style={styles.sectionCount}>{displayPhotos.length}</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {displayPhotos.map((url, i) => (
                  <Image key={i} source={{ uri: url }} style={styles.galleryThumb} resizeMode="cover" />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Card 5 — Reviews */}
          {displayReviews.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.sectionTitle}>Reviews</Text>
                </View>
                <View style={styles.overallRating}>
                  <Ionicons name="star" size={14} color="#FFC107" />
                  <Text style={styles.overallRatingText}>{displayRating?.toFixed(1)}</Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.reviewsScroll}
                decelerationRate="fast"
                snapToInterval={SCREEN_WIDTH - SIZES.spacing_xl * 2 + SIZES.spacing_base}
                onScroll={(e) => {
                  const cardW = SCREEN_WIDTH - SIZES.spacing_xl * 2 + SIZES.spacing_base;
                  const idx = Math.round(e.nativeEvent.contentOffset.x / cardW);
                  setActiveReview(Math.min(idx, displayReviews.length - 1));
                }}
                scrollEventThrottle={16}
              >
                {displayReviews.map((review, i) => (
                  <View key={i} style={styles.reviewCard}>
                    <View style={styles.reviewerRow}>
                      {review.profilePhotoUrl ? (
                        <Image source={{ uri: review.profilePhotoUrl }} style={styles.reviewAvatar} />
                      ) : (
                        <View style={styles.reviewAvatarFallback}>
                          <Text style={styles.reviewAvatarInitial}>
                            {(review.authorName?.[0] || '?').toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reviewerName} numberOfLines={1}>{review.authorName}</Text>
                        <Text style={styles.reviewTime}>{review.relativeTimeDescription}</Text>
                      </View>
                      <Stars rating={review.rating} size={12} />
                    </View>
                    <Text style={styles.reviewText} numberOfLines={5}>{review.text}</Text>
                  </View>
                ))}
              </ScrollView>
              {displayReviews.length > 1 && (
                <View style={styles.reviewDots}>
                  {displayReviews.slice(0, 5).map((_, i) => (
                    <View key={i} style={[styles.reviewDot, i === Math.min(activeReview, 4) && styles.reviewDotActive]} />
                  ))}
                  {displayReviews.length > 5 && (
                    <Text style={styles.reviewDotMore}>+{displayReviews.length - 5}</Text>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Add to Trip now lives in the animated glass tab bar */}

        </View>
        {/* close cardsStack */}
        </View>
        {/* close sheet */}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // ── Sticky compact header ───────────────────────────────────────────────────
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  stickyBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SIZES.spacing_sm,
  },
  stickyTitle: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  stickyHeartBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SIZES.spacing_sm,
  },

  // ── Hero ────────────────────────────────────────────────────────────────────
  heroContainer: {
    height: HERO_HEIGHT,
    backgroundColor: COLORS.cardBackground,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8e8e8',
  },
  heroControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.spacing_base,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnDark: {
    backgroundColor: COLORS.cardBackground,
    position: 'absolute',
    left: SIZES.spacing_base,
  },
  heartBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heartBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  // ── White sheet — overlaps image with rounded top corners ─────────────────
  sheet: {
    backgroundColor: '#f2f2f7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },

  // ── Hero name card — dark navy background ──────────────────────────────────
  heroCard: {
    backgroundColor: COLORS.primary,
  },
  heroMeta: {
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_lg,
    gap: SIZES.spacing_sm,
  },
  heroMetaTopRow: {},
  categoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: SIZES.radius_full,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: SIZES.spacing_xs,
  },
  categoryChipText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'capitalize',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  heroAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    marginTop: 2,
  },
  heroAddressText: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 19,
  },
  heroMetaDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: SIZES.spacing_xs,
  },
  statStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_xs,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,193,7,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.3)',
    borderRadius: SIZES.radius_full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statPillSecondary: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  statPillMuted: {
    backgroundColor: COLORS.cardBackground,
    borderColor: COLORS.borderLight,
  },
  statPillText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  statPillSub: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: 'rgba(255,255,255,0.6)',
  },
  heroOpenDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  priceLevelRow: {
    flexDirection: 'row',
    gap: 1,
  },
  priceDot: {
    fontSize: SIZES.sm,
    color: COLORS.borderLight,
    fontFamily: 'Poppins_600SemiBold',
  },
  priceDotActive: {
    color: COLORS.textSecondary,
  },

  // ── Cards stack ─────────────────────────────────────────────────────────────
  cardsStack: {
    backgroundColor: '#f2f2f7',
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  // Individual card — white, rounded, shadow
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  // Info rows inside a card (address, open, phone, website)
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SIZES.spacing_sm,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoIconWrap: {
    width: 26,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  infoLink: {
    color: COLORS.primary,
    fontFamily: 'Poppins_500Medium',
  },
  openDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Quick actions row
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_base,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(4,50,71,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconActive: {
    backgroundColor: 'rgba(232,93,4,0.1)',
  },
  actionLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },

  // Sections (hours, photos, reviews) — padding now from the card itself
  section: {
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_base,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  sectionTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  sectionCount: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  openStatusInline: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
  },

  // Hours
  hoursList: {
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_xs,
    paddingBottom: SIZES.spacing_lg,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SIZES.spacing_base,
  },
  hoursDay: {
    width: 100,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  hoursTime: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'right',
  },



  directionsLink: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accent,
  },
  mapWrap: {
    height: 180,
    overflow: 'hidden',
    borderBottomLeftRadius: SIZES.radius_lg,
    borderBottomRightRadius: SIZES.radius_lg,
    position: 'relative',
    marginHorizontal: SIZES.spacing_base,
    marginBottom: SIZES.spacing_base,
  },
  map: {
    width: SCREEN_WIDTH - SIZES.spacing_base * 4,
    height: 180,
  },
  mapPlaceholder: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  mapPlaceholderText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  mapTapOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: SIZES.spacing_sm,
  },
  mapDirectionsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  mapDirectionsText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  galleryScroll: {
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_base,
    gap: SIZES.spacing_sm,
  },
  galleryThumb: {
    width: 150,
    height: 110,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
    overflow: 'hidden',
  },

  // Reviews
  reviewsScroll: {
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_sm,
    gap: SIZES.spacing_base,
  },
  reviewCard: {
    width: SCREEN_WIDTH - SIZES.spacing_base * 4,
    backgroundColor: COLORS.cardBackground,
    borderRadius: SIZES.radius_lg,
    padding: SIZES.spacing_base,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  reviewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  reviewAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewAvatarInitial: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  reviewerName: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  reviewTime: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    marginTop: 1,
  },
  reviewText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  // Review dot indicators — capped at 5 visible dots
  reviewDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: SIZES.spacing_base,
  },
  reviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.borderLight,
  },
  reviewDotActive: {
    width: 20,
    backgroundColor: COLORS.accent,
  },
  reviewDotMore: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    marginLeft: 2,
  },
  overallRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.cardBackground,
    borderRadius: SIZES.radius_full,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 4,
  },
  overallRatingText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },

  // CTA
  ctaSection: {
    padding: SIZES.spacing_base,
  },
  addToTripBtn: {
    backgroundColor: COLORS.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    paddingVertical: 16,
    borderRadius: SIZES.radius_full,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  addToTripText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    letterSpacing: 0.3,
  },

});
