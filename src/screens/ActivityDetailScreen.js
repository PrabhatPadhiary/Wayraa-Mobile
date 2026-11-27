import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Linking,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SIZES } from '../constants';
import RatingRow from '../components/RatingRow';
import Skeleton from '../components/Skeleton';
import { OffersDisclosure } from '../components/BookableActivities';
import { formatOfferPrice, formatOfferDuration } from '../components/ActivityOfferCard';
import { getActivityDetail, peekActivityDetail, openOffer } from '../services/offersService';
import { useBottomBar } from '../context/BottomBarContext';
import { formatDuration } from '../utils/itinerary';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.42);
const ABOUT_LINES = 6;

/**
 * ActivityDetailScreen: one bookable tour or ticket (Viator).
 *
 * Route params: { offer, areaName } — `offer` is the card that was tapped
 * (id, title, imageUrl, rating, reviewCount, duration, fromPrice, currency,
 * freeCancellation, bookingUrl), so the page shows at once; the full details
 * (photos, description, included, stops, meeting point, policies) load in.
 *
 * Booking happens on Viator: "Book on Viator" in the bottom bar opens the
 * tour's own page (tracked link) in the in-app browser.
 */
export default function ActivityDetailScreen({ navigation, route }) {
  const { offer = {}, areaName } = route.params || {};
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState(() => peekActivityDetail(offer.id));
  const [loading, setLoading] = useState(detail === undefined);
  const [page, setPage] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutLong, setAboutLong] = useState(false);

  useEffect(() => {
    let live = true;
    getActivityDetail(offer.id).then((d) => {
      if (!live) return;
      setDetail(d);
      setLoading(false);
    });
    return () => { live = false; };
  }, [offer.id]);

  const failed = !loading && (!detail || detail.failed);
  const d = detail && !detail.failed ? detail : null;
  const bookingUrl = d?.bookingUrl || offer.bookingUrl;

  const book = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    openOffer(bookingUrl);
  }, [bookingUrl]);

  // "Book on Viator" in the shared bottom bar while this page is open.
  const { claimBar, releaseBar } = useBottomBar();
  const barOwner = route?.key;
  useFocusEffect(
    useCallback(() => {
      if (bookingUrl) claimBar(barOwner, { cta: { label: 'Book on Viator', icon: 'open-outline', onPress: book } });
      return () => releaseBar(barOwner);
    }, [claimBar, releaseBar, barOwner, book, bookingUrl])
  );

  // What to show: full details when loaded, else the card's summary.
  const title = d?.title || offer.title || 'Tour';
  const photos = d?.images?.length ? d.images : (offer.imageUrl ? [offer.imageUrl] : []);
  const rating = d?.rating ?? offer.rating;
  const reviewCount = d?.reviewCount ?? offer.reviewCount;
  const duration = formatOfferDuration(d?.durationMinutes ?? offer.durationMinutes, d?.durationToMinutes ?? offer.durationToMinutes);
  const freeCancellation = d ? d.freeCancellation : offer.freeCancellation;
  const price = formatOfferPrice(offer.fromPrice, offer.currency);
  const pricePer = d?.pricePer === 'group' ? 'per group' : d?.pricePer === 'person' ? 'per person' : null;

  const highlights = [
    freeCancellation && { icon: 'check-circle', text: 'Free cancellation', tone: 'good' },
    d?.instantConfirmation && { icon: 'zap', text: 'Instant confirmation' },
    d?.pickup && { icon: 'truck', text: d.pickup },
    d?.privateTour && { icon: 'user', text: 'Private tour' },
    !d?.privateTour && d?.maxGroupSize > 0 && { icon: 'users', text: `Up to ${d.maxGroupSize} people` },
    d?.skipTheLine && { icon: 'fast-forward', text: 'Skip the line' },
    d?.languages?.length > 0 && { icon: 'globe', text: d.languages.join(', ') },
    d?.ticketInfo && { icon: 'smartphone', text: d.ticketInfo },
  ].filter(Boolean);

  const openMap = (point) => {
    if (!Number.isFinite(point?.latitude) || !Number.isFinite(point?.longitude)) return;
    const q = `${point.latitude},${point.longitude}`;
    const label = encodeURIComponent(point.name || 'Meeting point');
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?ll=${q}&q=${label}` : `geo:${q}?q=${q}(${label})`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() => {}));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}>
        {/* ── Hero: the tour's photos (swipe) ── */}
        <View style={styles.hero}>
          {photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
              accessibilityLabel={`Photos, ${page + 1} of ${photos.length}`}
            >
              {photos.map((url, i) => (
                Math.abs(i - page) <= 2
                  ? <Image key={url + i} source={{ uri: url }} style={styles.heroImage} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                  : <View key={url + i} style={[styles.heroImage, { backgroundColor: COLORS.primary }]} />
              ))}
            </ScrollView>
          ) : (
            <LinearGradient colors={[COLORS.primary, '#34495C']} style={styles.heroImage} />
          )}
          <LinearGradient colors={['rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} style={styles.heroTopShade} pointerEvents="none" />
          <View style={[styles.heroControls, { top: insets.top + SIZES.spacing_sm }]} pointerEvents="box-none">
            <TouchableOpacity style={styles.roundButton} onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={6}>
              <Ionicons name="chevron-back" size={22} color={COLORS.white} />
            </TouchableOpacity>
            {photos.length > 1 && (
              <View style={styles.counter} pointerEvents="none">
                <Text style={styles.counterText}>{page + 1} / {photos.length}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.sheet}>
          {/* ── Title block ── */}
          <View style={styles.titleBlock}>
            <Text style={styles.kicker} numberOfLines={1}>
              {['Tour', areaName].filter(Boolean).join(' · ')}
            </Text>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.metaRow}>
              {rating > 0 && <RatingRow rating={rating} reviews={reviewCount} variant="badge" />}
              {!!duration && (
                <View style={styles.metaPill}>
                  <Feather name="clock" size={13} color={COLORS.primaryLight} />
                  <Text style={styles.metaPillText}>{duration}</Text>
                </View>
              )}
            </View>
            {!!price && (
              <Text style={styles.price}>
                <Text style={styles.priceFrom}>from </Text>{price}
                {!!pricePer && <Text style={styles.priceFrom}>{` ${pricePer}`}</Text>}
              </Text>
            )}
            <TouchableOpacity style={styles.bookButton} onPress={book} activeOpacity={0.9} accessibilityRole="link">
              <Text style={styles.bookButtonText}>Book on Viator</Text>
              <Feather name="arrow-up-right" size={18} color={COLORS.white} />
            </TouchableOpacity>
            <OffersDisclosure style={styles.centerNote} />
          </View>

          {highlights.length > 0 && (
            <View style={styles.card}>
              {highlights.map((h, i) => (
                <View key={i} style={styles.highlight}>
                  <Feather name={h.icon} size={16} color={h.tone === 'good' ? COLORS.success : COLORS.primaryLight} />
                  <Text style={[styles.highlightText, h.tone === 'good' && { color: COLORS.success }]}>{h.text}</Text>
                </View>
              ))}
            </View>
          )}

          {loading && (
            <View style={[styles.card, styles.skeletonCard]}>
              <Skeleton height={18} width="40%" />
              <Skeleton height={14} />
              <Skeleton height={14} />
              <Skeleton height={14} width="80%" />
            </View>
          )}

          {failed && (
            <View style={[styles.card, styles.failedCard]}>
              <Feather name="wifi-off" size={16} color={COLORS.textMuted} />
              <Text style={styles.failedText}>
                Couldn't load all the details right now. You can still see everything and book on Viator.
              </Text>
            </View>
          )}

          {/* ── About ── */}
          {!!d?.description && (
            <View style={styles.card}>
              <SectionTitle icon="info" title="About this tour" />
              <Text
                style={styles.body}
                numberOfLines={aboutOpen ? undefined : ABOUT_LINES}
                onTextLayout={(e) => { if (!aboutOpen && e.nativeEvent.lines.length >= ABOUT_LINES) setAboutLong(true); }}
              >
                {d.description}
              </Text>
              {aboutLong && (
                <TouchableOpacity onPress={() => setAboutOpen((v) => !v)} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.more}>{aboutOpen ? 'Show less' : 'Read more'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Included / not included ── */}
          {(d?.inclusions?.length > 0 || d?.exclusions?.length > 0) && (
            <View style={styles.card}>
              <SectionTitle icon="check-square" title="What's included" />
              {d.inclusions.map((t, i) => (
                <View key={`in-${i}`} style={styles.listRow}>
                  <Feather name="check" size={16} color={COLORS.success} style={styles.listIcon} />
                  <Text style={styles.listText}>{t}</Text>
                </View>
              ))}
              {d.exclusions.map((t, i) => (
                <View key={`ex-${i}`} style={styles.listRow}>
                  <Feather name="x" size={16} color={COLORS.error} style={styles.listIcon} />
                  <Text style={[styles.listText, styles.listTextMuted]}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Itinerary ── */}
          {(d?.stops?.length > 0 || !!d?.itineraryText) && (
            <View style={styles.card}>
              <SectionTitle icon="map" title="What you'll do" />
              {!!d.itineraryText && <Text style={[styles.body, d.stops.length > 0 && { marginBottom: SIZES.spacing_md }]}>{d.itineraryText}</Text>}
              {d.stops.map((s, i) => {
                const last = i === d.stops.length - 1;
                const showDay = s.day && s.day !== d.stops[i - 1]?.day;
                const meta = [
                  s.durationMinutes > 0 ? formatDuration(s.durationMinutes) : null,
                  s.passBy ? 'Pass by' : null,
                  s.admissionIncluded === true ? 'Admission included' : s.admissionIncluded === false ? 'Admission not included' : null,
                ].filter(Boolean).join('  ·  ');
                return (
                  <View key={i}>
                    {showDay && <Text style={styles.day}>{s.day}</Text>}
                    <View style={styles.stop}>
                      <View style={styles.stopRail}>
                        <View style={styles.stopDot}><Text style={styles.stopDotText}>{i + 1}</Text></View>
                        {!last && <View style={styles.stopLine} />}
                      </View>
                      <View style={[styles.stopBody, !last && { paddingBottom: SIZES.spacing_base }]}>
                        {!!s.name && <Text style={styles.stopName}>{s.name}</Text>}
                        {!!meta && <Text style={styles.stopMeta}>{meta}</Text>}
                        {!!s.description && <Text style={styles.stopText} numberOfLines={4}>{s.description}</Text>}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Meeting point / pickup ── */}
          {(d?.meetingPoint || d?.pickupNote || d?.endPoint) && (
            <View style={styles.card}>
              <SectionTitle icon="map-pin" title={d.meetingPoint ? 'Meeting point' : 'Pickup'} />
              {[d.meetingPoint, d.endPoint].filter(Boolean).map((p, i) => (
                <View key={i} style={i > 0 && { marginTop: SIZES.spacing_md }}>
                  {i > 0 && <Text style={styles.subhead}>Ends at</Text>}
                  {!!p.name && <Text style={styles.pointName}>{p.name}</Text>}
                  {!!p.address && <Text style={styles.pointAddress}>{p.address}</Text>}
                  {!!p.description && <Text style={[styles.body, { marginTop: 4 }]}>{p.description}</Text>}
                  {Number.isFinite(p.latitude) && (
                    <TouchableOpacity style={styles.pill} onPress={() => openMap(p)} activeOpacity={0.85} accessibilityRole="button">
                      <Feather name="navigation" size={14} color={COLORS.primary} />
                      <Text style={styles.pillText}>Open in maps</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {!!d.pickupNote && (
                <Text style={[styles.body, (d.meetingPoint || d.endPoint) && { marginTop: SIZES.spacing_md }]}>{d.pickupNote}</Text>
              )}
            </View>
          )}

          {/* ── Cancellation ── */}
          {!!d?.cancellationPolicy && (
            <View style={styles.card}>
              <SectionTitle icon="rotate-ccw" title="Cancellation" />
              <Text style={styles.body}>{d.cancellationPolicy}</Text>
            </View>
          )}

          {/* ── Good to know ── */}
          {d?.goodToKnow?.length > 0 && (
            <View style={styles.card}>
              <SectionTitle icon="alert-circle" title="Good to know" />
              {d.goodToKnow.map((t, i) => (
                <View key={i} style={styles.listRow}>
                  <View style={styles.bullet} />
                  <Text style={styles.listText}>{t}</Text>
                </View>
              ))}
            </View>
          )}

          {!loading && (
            <Text style={styles.footNote}>
              Details, prices and availability are from Viator and may change. Booking, payment and refunds
              happen on Viator's website.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionIcon}>
        <Feather name={icon} size={15} color={COLORS.primaryLight} />
      </View>
      <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
  },
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
  heroControls: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  counter: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counterText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  // Overlaps the photo slightly, like the place page.
  sheet: {
    marginTop: -24,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: COLORS.backgroundWarm,
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_lg,
    gap: SIZES.spacing_md,
  },
  titleBlock: {
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_xs,
  },
  kicker: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: SIZES.xl,
    lineHeight: 29,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.white,
  },
  metaPillText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  price: {
    marginTop: 2,
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  priceFrom: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    height: 52,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
    marginTop: SIZES.spacing_xs,
  },
  bookButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  centerNote: {
    textAlign: 'center',
    marginTop: 0,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    borderWidth: 1,
    borderColor: '#E9EDF1',
    shadowColor: '#2B3F51',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  skeletonCard: {
    gap: 10,
  },
  failedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_sm,
  },
  failedText: {
    flex: 1,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: 6,
  },
  highlightText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_md,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  body: {
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  more: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_sm,
    paddingVertical: 4,
  },
  listIcon: {
    marginTop: 2,
  },
  listText: {
    flex: 1,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  listTextMuted: {
    color: COLORS.textSecondary,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    marginHorizontal: 5,
    backgroundColor: COLORS.primaryLight,
  },
  day: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.accentDeep,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SIZES.spacing_sm,
  },
  stop: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
  },
  stopRail: {
    alignItems: 'center',
    width: 26,
  },
  stopDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
  },
  stopDotText: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  stopLine: {
    flex: 1,
    width: 2,
    marginVertical: 3,
    backgroundColor: COLORS.border,
  },
  stopBody: {
    flex: 1,
    paddingTop: 2,
    gap: 2,
  },
  stopName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  stopMeta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  stopText: {
    fontSize: SIZES.sm + 1,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  subhead: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  pointName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  pointAddress: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  footNote: {
    marginTop: SIZES.spacing_xs,
    paddingHorizontal: SIZES.spacing_sm,
    fontSize: SIZES.xs + 1,
    lineHeight: 16,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
