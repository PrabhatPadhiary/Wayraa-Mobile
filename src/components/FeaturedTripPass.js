import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { dayCount, daysUntil } from '../utils/tripDates';
import { formatMoney } from '../utils/money';
import { fallbackGradientFor } from './PlaceTile';
import { avatarColorFor, initialsFor } from '../utils/avatars';
import { placeName, placeCode, tripPhase } from './TripBoardingPass';
import { PressScale } from './Motion';
import { getItinerary, peekItinerary } from '../services/itineraryService';

const PHOTO_HEIGHT = 136;
const NOTCH = 20;
const MAX_PLAN_ROWS = 2;
const MAX_DAY_SEGMENTS = 14;
const AVATAR = 24;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SLOT_LABELS = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', anytime: 'Anytime' };
const LIVE_GREEN = '#7FD8A6';

/** Today's date on the device as "YYYY-MM-DD" (itinerary days are UTC midnights). */
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "12 DEC" from an ISO date (read in UTC, like the rest of the trip dates). */
function dayTag(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** The plan rows for one day: timed items first, by time, then the rest in order. */
function planFor(items, dayKey) {
  return (items || [])
    .filter((i) => String(i.scheduledDate || '').slice(0, 10) === dayKey)
    .sort((a, b) => {
      const ta = a.startTime || '99';
      const tb = b.startTime || '99';
      return ta.localeCompare(tb) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
}

/**
 * The three quick tiles, each with where that part of the trip stands:
 * days planned, money spent, things packed. `todo` lights the line orange,
 * `over` red (over budget).
 */
function tilesFor(trip, total) {
  const s = trip.summary || {};
  const planned = s.plannedDays || 0;
  const budget = Number(trip.totalBudget) || 0;
  const spent = Number(s.spent) || 0;
  const packTotal = s.packingTotal || s.checklistTotal || 0;
  const packDone = s.packingTotal ? s.packingDone : s.checklistDone;
  return [
    {
      key: 'itinerary',
      label: 'Itinerary',
      icon: 'calendar',
      color: COLORS.accent,
      tint: '#FDEFEA',
      sub: total ? `${Math.min(planned, total)}/${total} days` : 'Plan days',
      todo: !!total && planned < total,
    },
    {
      key: 'budget',
      label: 'Expenses',
      icon: 'credit-card',
      color: COLORS.primaryLight,
      tint: '#EAF0F5',
      sub: spent > 0 ? formatMoney(spent, trip.currency) : budget ? `of ${formatMoney(budget, trip.currency)}` : 'Add costs',
      over: budget > 0 && spent > budget,
    },
    {
      key: 'checklist',
      label: 'Packing',
      icon: 'check-square',
      color: '#2F7A52',
      tint: '#E7F4EC',
      sub: packTotal ? `${packDone || 0}/${packTotal} ${s.packingTotal ? 'packed' : 'done'}` : 'Start a list',
      todo: packTotal > 0 && (packDone || 0) < packTotal,
    },
  ];
}

/**
 * The trip you're on (or the next one), at the top of My Trips, drawn as a
 * large boarding pass:
 *  - the photo, with where it stands ("On trip" / "Next trip"), who's going,
 *    the place code and name, and depart / return dates; on the trip, a
 *    track of its days with today lit
 *  - past the tear line, a countdown (or "Day 3 of 6") beside the plan for
 *    today (or for day 1) as a small timeline
 *  - tiles into Itinerary, Expenses and Packing, each saying how far along
 *    it is
 * Every tap target dips slightly under the finger (PressScale).
 *
 * @param {object} trip
 * @param {string|null} imageUri
 * @param {(initialTab?: string) => void} onOpen   opens the trip (on a tab)
 * @param {object} [style]  on the outer view (e.g. no bottom margin in a stack)
 */
export default function FeaturedTripPass({ trip, imageUri, onOpen, style }) {
  const [failed, setFailed] = useState(false);
  const [items, setItems] = useState(() => peekItinerary(trip.id) || null);
  useEffect(() => { setFailed(false); }, [imageUri]);
  useEffect(() => {
    let alive = true;
    setItems(peekItinerary(trip.id) || null);
    getItinerary(trip.id)
      .then((data) => { if (alive) setItems(data); })
      .catch(() => { if (alive) setItems((cur) => cur || []); });
    return () => { alive = false; };
  }, [trip.id, trip.summary?.itineraryItems]);

  const live = tripPhase(trip) === 'now';
  const place = placeName(trip) || trip.name;
  const total = dayCount(trip.startDate, trip.endDate);
  const until = daysUntil(trip.startDate);
  const dayNo = live ? 1 - until : null;
  const dayKey = live ? todayKey() : String(trip.startDate || '').slice(0, 10);
  const plan = items ? planFor(items, dayKey) : null;
  const tiles = tilesFor(trip, total);
  const showImage = !!imageUri && !failed;

  const members = Array.isArray(trip.members) ? trip.members.slice(0, 3) : [];
  const memberCount = typeof trip.memberCount === 'number' ? trip.memberCount : members.length;
  const extra = Math.max(0, memberCount - members.length);

  // Countdown block beside the plan.
  const count = live
    ? { top: 'DAY', big: String(dayNo), bottom: total ? `of ${total}` : '' }
    : until === 0
      ? { top: 'STARTS', big: '0', bottom: 'today' }
      : { top: 'IN', big: String(until), bottom: until === 1 ? 'day' : 'days' };

  const a11y = live
    ? `${trip.name}, on the trip, day ${dayNo}${total ? ` of ${total}` : ''}`
    : `${trip.name}, next trip, starts in ${until} ${until === 1 ? 'day' : 'days'}`;

  return (
    <View style={[styles.shadow, style]}>
      <View style={styles.card}>
        <PressScale scale={0.985} onPress={() => onOpen()} accessibilityRole="button" accessibilityLabel={a11y}>
          {/* Photo half */}
          <View style={styles.photo}>
            {showImage ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.fill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                onError={() => setFailed(true)}
              />
            ) : (
              <LinearGradient colors={fallbackGradientFor(place)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill} />
            )}
            <LinearGradient
              colors={['rgba(16,24,32,0.45)', 'rgba(16,24,32,0)', 'rgba(16,24,32,0.15)', 'rgba(16,24,32,0.85)']}
              locations={[0, 0.3, 0.55, 1]}
              style={styles.fill}
            />

            <View style={styles.photoTop}>
              <View style={[styles.status, live && styles.statusLive]}>
                {live ? <View style={styles.liveDot} /> : <Ionicons name="airplane" size={11} color={COLORS.white} />}
                <Text style={styles.statusText}>{live ? 'ON TRIP NOW' : 'NEXT TRIP'}</Text>
              </View>
              {members.length > 0 && (
                <View style={styles.crew}>
                  {members.map((m, i) => (
                    <View
                      key={m.userId || i}
                      style={[styles.avatar, { backgroundColor: avatarColorFor(m.name), marginLeft: i ? -8 : 0, zIndex: 3 - i }]}
                    >
                      {m.photoUrl
                        ? <Image source={{ uri: m.photoUrl }} style={styles.avatarImg} contentFit="cover" />
                        : <Text style={styles.avatarText}>{initialsFor(m.name)}</Text>}
                    </View>
                  ))}
                  {extra > 0 && <Text style={styles.crewExtra}>+{extra}</Text>}
                </View>
              )}
            </View>

            <View style={styles.photoBottom}>
              <View style={styles.photoText}>
                <Text style={styles.code}>{placeCode(place)}</Text>
                <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
              </View>
              <View style={styles.legs}>
                <View>
                  <Text style={styles.legLabel}>DEPART</Text>
                  <Text style={styles.legValue}>{dayTag(trip.startDate)}</Text>
                </View>
                <View>
                  <Text style={styles.legLabel}>RETURN</Text>
                  <Text style={styles.legValue}>{dayTag(trip.endDate)}</Text>
                </View>
              </View>
            </View>

            {/* On the trip: one segment per day, today lit. */}
            {live && total ? (
              total <= MAX_DAY_SEGMENTS ? (
                <View style={styles.days}>
                  {Array.from({ length: total }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.daySeg,
                        i < dayNo - 1 && styles.daySegDone,
                        i === dayNo - 1 && styles.daySegToday,
                      ]}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.dayTrack}>
                  <View style={[styles.dayFill, { width: `${Math.min(100, (dayNo / total) * 100)}%` }]} />
                </View>
              )
            ) : null}
          </View>

          {/* Tear line */}
          <View style={styles.tear}>
            <View style={styles.tearDots}>
              {Array.from({ length: 24 }).map((_, i) => <View key={i} style={styles.tearDot} />)}
            </View>
          </View>

          {/* Countdown + plan */}
          <View style={styles.body}>
            <View style={[styles.count, live && styles.countLive]}>
              <Text style={[styles.countTop, live && styles.countTextLive]}>{count.top}</Text>
              <Text style={[styles.countBig, live && styles.countTextLive]}>{count.big}</Text>
              {!!count.bottom && <Text style={[styles.countBottom, live && styles.countTextLive]}>{count.bottom}</Text>}
            </View>

            <View style={styles.planWrap}>
              <Text style={styles.label}>{live ? "TODAY'S PLAN" : 'DAY 1 PLAN'}</Text>
              {plan === null ? (
                <View style={styles.planLoading}>
                  <View style={styles.planLoadingLine} />
                  <View style={[styles.planLoadingLine, { width: '55%' }]} />
                </View>
              ) : plan.length === 0 ? (
                <View>
                  <Text style={styles.empty}>{live ? 'Nothing planned for today.' : 'Day 1 is still open.'}</Text>
                  <PressScale
                    style={styles.planIt}
                    onPress={() => onOpen('itinerary')}
                    haptic
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Plan this day"
                  >
                    <Feather name="plus" size={13} color={COLORS.accentDeep} />
                    <Text style={styles.planItText}>Plan it</Text>
                  </PressScale>
                </View>
              ) : (
                <View>
                  {plan.slice(0, MAX_PLAN_ROWS).map((i, idx, shown) => (
                    <View key={i.id} style={styles.planRow}>
                      <View style={styles.thread}>
                        <View style={[styles.threadDot, idx === 0 && styles.threadDotFirst]} />
                        {idx < shown.length - 1 && <View style={styles.threadLine} />}
                      </View>
                      <View style={styles.planText}>
                        <Text style={styles.planTime}>{i.startTime || SLOT_LABELS[i.slot] || 'Anytime'}</Text>
                        <Text style={styles.planTitle} numberOfLines={1}>{i.title}</Text>
                      </View>
                    </View>
                  ))}
                  {plan.length > MAX_PLAN_ROWS && (
                    <Text style={styles.more}>+{plan.length - MAX_PLAN_ROWS} more</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </PressScale>

        {/* Quick tiles */}
        <View style={styles.tiles}>
          {tiles.map((t) => (
            <PressScale
              key={t.key}
              containerStyle={styles.tileSlot}
              style={[styles.tile, { backgroundColor: t.tint }]}
              scale={0.95}
              haptic
              onPress={() => onOpen(t.key)}
              accessibilityRole="button"
              accessibilityLabel={`${t.label}, ${t.sub}`}
            >
              <Feather name={t.icon} size={15} color={t.color} />
              <View style={styles.tileText}>
                <Text style={styles.tileLabel} numberOfLines={1}>{t.label}</Text>
                <Text
                  style={[styles.tileSub, t.todo && styles.tileSubTodo, t.over && styles.tileSubOver]}
                  numberOfLines={1}
                >
                  {t.sub}
                </Text>
              </View>
            </PressScale>
          ))}
        </View>
      </View>

      {/* Notches cut into the card's edges at the tear line. */}
      <View style={[styles.notch, styles.notchLeft]} pointerEvents="none" />
      <View style={[styles.notch, styles.notchRight]} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: 26,
    shadowColor: '#1C2833',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: SIZES.spacing_base,
  },
  card: {
    borderRadius: 26,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  // Photo
  photo: {
    height: PHOTO_HEIGHT,
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_md,
    paddingBottom: SIZES.spacing_base,
  },
  photoTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(16,24,32,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  statusLive: {
    backgroundColor: 'rgba(20,60,40,0.6)',
    borderColor: 'rgba(127,216,166,0.45)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: LIVE_GREEN,
  },
  statusText: {
    fontSize: 10,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1,
    color: COLORS.white,
  },
  crew: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: {
    fontSize: 9,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  crewExtra: {
    marginLeft: 5,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  photoBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SIZES.spacing_md,
  },
  photoText: { flex: 1 },
  code: {
    fontSize: 30,
    lineHeight: 34,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 2,
    color: COLORS.white,
    includeFontPadding: false,
  },
  name: {
    fontSize: SIZES.md,
    lineHeight: 19,
    fontFamily: 'Poppins_600SemiBold',
    color: 'rgba(255,255,255,0.92)',
    includeFontPadding: false,
  },
  legs: {
    flexDirection: 'row',
    gap: SIZES.spacing_base,
    marginBottom: 2,
  },
  legLabel: {
    fontSize: 9,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
  },
  legValue: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  days: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    bottom: 7,
    flexDirection: 'row',
    gap: 3,
  },
  daySeg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  daySegDone: { backgroundColor: 'rgba(127,216,166,0.65)' },
  daySegToday: { backgroundColor: LIVE_GREEN },
  dayTrack: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    bottom: 7,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  dayFill: {
    height: 4,
    backgroundColor: LIVE_GREEN,
  },

  // Tear
  tear: {
    height: NOTCH,
    justifyContent: 'center',
  },
  tearDots: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: NOTCH,
  },
  tearDot: {
    width: 6,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.border,
  },
  notch: {
    position: 'absolute',
    top: PHOTO_HEIGHT,
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: COLORS.backgroundWarm,
  },
  notchLeft: { left: -NOTCH / 2 },
  notchRight: { right: -NOTCH / 2 },

  // Countdown + plan
  body: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_md,
  },
  count: {
    width: 58,
    paddingVertical: SIZES.spacing_sm,
    borderRadius: 14,
    backgroundColor: COLORS.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  countLive: { backgroundColor: '#1F3B2D' },
  countTop: {
    fontSize: 9,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1.2,
    color: COLORS.textMuted,
  },
  countBig: {
    fontSize: 24,
    lineHeight: 28,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
    includeFontPadding: false,
  },
  countBottom: {
    fontSize: 11,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  countTextLive: { color: COLORS.white },
  planWrap: { flex: 1, minWidth: 0 },
  label: {
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1.2,
    color: COLORS.textLight,
    marginBottom: 3,
  },
  planLoading: { gap: 8, paddingTop: 2 },
  planLoadingLine: {
    height: 12,
    width: '80%',
    borderRadius: 6,
    backgroundColor: COLORS.backgroundWarm,
  },
  empty: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  planIt: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FDEFEA',
  },
  planItText: {
    fontSize: SIZES.sm + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  planRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm + 2,
  },
  thread: {
    width: 10,
    alignItems: 'center',
    paddingTop: 5,
  },
  tileText: { flex: 1, minWidth: 0 },
  threadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  threadDotFirst: { borderColor: COLORS.accent },
  threadLine: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    borderRadius: 1,
    backgroundColor: COLORS.borderLight,
  },
  planText: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingBottom: 5,
  },
  planTime: {
    fontSize: 11,
    lineHeight: 19,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  planTitle: {
    fontSize: SIZES.md,
    lineHeight: 19,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  more: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    marginLeft: 20,
    marginTop: -2,
  },

  // Tiles
  tiles: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: SIZES.spacing_sm + 2,
    paddingBottom: SIZES.spacing_sm + 2,
  },
  tileSlot: { flex: 1 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 46,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  tileLabel: {
    fontSize: SIZES.sm,
    lineHeight: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  tileSub: {
    fontSize: 10.5,
    lineHeight: 14,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  tileSubTodo: { color: COLORS.accentDeep },
  tileSubOver: { color: COLORS.error },
});
