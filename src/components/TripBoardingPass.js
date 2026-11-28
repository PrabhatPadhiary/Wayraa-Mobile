import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ticketPath } from '../utils/ticketShape';
import useHoldPress, { HOLD_MS } from '../hooks/useHoldPress';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { dayCount, daysUntil } from '../utils/tripDates';
import { fallbackGradientFor } from './PlaceTile';
import { avatarColorFor, initialsFor } from '../utils/avatars';
import { formatMoney } from '../utils/money';

export const PASS_HEIGHT = 162;
const STUB_WIDTH = 104;
// White between the tear line and the photo stub: just wider than the
// notch's reach, so the cut-out never takes a bite of the photo.
const STUB_GAP = 11;
/** How far the tear line (the dots before the photo stub) is from the right edge. */
export const TEAR_FROM_RIGHT = STUB_WIDTH + STUB_GAP + 1;
const NOTCH = 22;
const RADIUS = 20;
/** The pass's outline, for a tip's spotlight: its corners and its two notches. */
export const PASS_TIP_SHAPE = {
  radius: RADIUS,
  notches: [
    { side: 'top', at: TEAR_FROM_RIGHT, fromEnd: true, r: NOTCH / 2 },
    { side: 'bottom', at: TEAR_FROM_RIGHT, fromEnd: true, r: NOTCH / 2 },
  ],
};
const AVATAR = 22;
const MAX_AVATARS = 3;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The destination's main name: "Goa, India" → "Goa". */
export function placeName(trip) {
  const raw = trip.primaryDestination
    || (Array.isArray(trip.stops) && trip.stops[0]?.name)
    || '';
  return raw.split(',')[0].trim();
}

/**
 * A three-letter code for a place, like an airport code: "Goa" → "GOA",
 * "New Delhi" → "NDE", "Rann of Kutch" → "ROK".
 */
export function placeCode(name) {
  const words = (name || '').toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '···';
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0]).join('');
  if (words.length === 2) return (words[0][0] + words[1].slice(0, 2)).padEnd(3, words[1][0]);
  return words[0].slice(0, 3);
}

/** "12–18 Dec", "28 Dec – 3 Jan", "From 12 Dec", or "Not set"; `withYear` adds " ’26". */
function shortRange(trip, withYear) {
  const s = trip.startDate ? new Date(trip.startDate) : null;
  const e = trip.endDate ? new Date(trip.endDate) : null;
  if (!s) return 'Not set';
  const year = withYear ? ` ’${String(s.getUTCFullYear()).slice(2)}` : '';
  if (!e) return `From ${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]}${year}`;
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[s.getUTCMonth()]}${year}`;
  }
  return `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}${year}`;
}

/**
 * Where a trip stands, from its dates: 'now' (started, not ended), 'upcoming'
 * (dated, not started), 'draft' (no dates yet) or 'past' (ended or completed).
 */
export function tripPhase(trip) {
  const status = (trip.status || '').toLowerCase();
  const until = daysUntil(trip.startDate);
  const left = trip.endDate ? daysUntil(trip.endDate) : null;
  if (status === 'completed' || (left !== null && left < 0)) return 'past';
  if (until === null) return 'draft';
  return until > 0 ? 'upcoming' : 'now';
}

const TONES = {
  todo: COLORS.accentDeep,
  info: COLORS.primaryLight,
  done: '#2F7A52',
  over: COLORS.error,
};

/**
 * What still needs doing on an upcoming or ongoing trip, from the list's
 * `summary`, most useful first, at most two: days without a plan, packing
 * (from a week out), the checklist, then the budget. "All days planned"
 * when nothing is left. Empty for past trips, drafts and older backends.
 *
 * @returns {Array<{ key, icon, text, tone: 'todo'|'info'|'done'|'over' }>}
 */
export function tripAttention(trip) {
  const s = trip.summary;
  const phase = tripPhase(trip);
  if (!s || (phase !== 'upcoming' && phase !== 'now')) return [];
  const out = [];
  const total = dayCount(trip.startDate, trip.endDate);
  const until = daysUntil(trip.startDate);
  const unplanned = total ? Math.max(0, total - (s.plannedDays || 0)) : 0;
  if (unplanned > 0) {
    out.push({
      key: 'plan',
      icon: 'calendar-outline',
      text: s.plannedDays ? `${unplanned} ${unplanned === 1 ? 'day' : 'days'} unplanned` : 'No days planned yet',
      tone: 'todo',
    });
  }
  if (s.packingTotal > 0 && s.packingDone < s.packingTotal && until !== null && until <= 7) {
    out.push({ key: 'pack', icon: 'bag-handle-outline', text: `Packing ${s.packingDone}/${s.packingTotal}`, tone: 'todo' });
  } else if (s.checklistTotal > 0 && s.checklistDone < s.checklistTotal) {
    out.push({ key: 'list', icon: 'checkbox-outline', text: `Checklist ${s.checklistDone}/${s.checklistTotal}`, tone: 'info' });
  }
  const budget = Number(trip.totalBudget) || 0;
  const spent = Number(s.spent) || 0;
  if (budget > 0 && spent > budget) {
    out.push({ key: 'money', icon: 'alert-circle-outline', text: `${formatMoney(spent - budget, trip.currency)} over budget`, tone: 'over' });
  } else if (spent > 0) {
    out.push({
      key: 'money',
      icon: 'wallet-outline',
      text: budget ? `${formatMoney(spent, trip.currency)} of ${formatMoney(budget, trip.currency)}` : `${formatMoney(spent, trip.currency)} spent`,
      tone: 'info',
    });
  }
  if (out.length === 0 && total) {
    out.push({ key: 'ready', icon: 'checkmark-circle', text: 'All days planned', tone: 'done' });
  }
  return out.slice(0, 2);
}

/**
 * What the stub says: a small label, a large value, a line under it, an
 * optional progress (0..1) while the trip is on, and the stub's tint.
 */
function stubInfo(trip) {
  const status = (trip.status || '').toLowerCase();
  const until = daysUntil(trip.startDate);
  const left = trip.endDate ? daysUntil(trip.endDate) : null;
  const total = dayCount(trip.startDate, trip.endDate);

  if (status === 'completed' || (left !== null && left < 0)) {
    const d = new Date(trip.endDate || trip.startDate || trip.createdAt || Date.now());
    return { label: 'LANDED', value: MONTHS[d.getUTCMonth()].toUpperCase(), sub: String(d.getUTCFullYear()), tint: 'rgba(38, 46, 54, 0.72)', a11y: 'Completed' };
  }
  if (until === null) {
    return { label: 'DATES', value: 'TBD', sub: 'not set', tint: 'rgba(43, 63, 81, 0.7)', a11y: 'No dates yet' };
  }
  if (until > 0) {
    return { label: 'DEPARTS IN', value: String(until), sub: until === 1 ? 'DAY' : 'DAYS', tint: 'rgba(28, 40, 51, 0.62)', a11y: until === 1 ? 'Starts tomorrow' : `Starts in ${until} days` };
  }
  if (until === 0) {
    return { label: 'DEPARTS', value: 'TODAY', sub: 'bon voyage', small: true, tint: 'rgba(28, 40, 51, 0.62)', a11y: 'Starts today' };
  }
  const dayNo = 1 - until;
  return {
    label: 'ON TRIP · DAY',
    value: String(dayNo),
    sub: total ? `OF ${total}` : '',
    progress: total ? Math.min(1, dayNo / total) : null,
    tint: 'rgba(28, 40, 51, 0.62)',
    a11y: total ? `Day ${dayNo} of ${total}` : `Day ${dayNo}`,
  };
}

/**
 * A trip as a boarding pass: on the left the place code, trip name and the
 * dates / length / travellers fields; past a perforated tear line, a photo
 * stub with the countdown (or "Day 3 of 5" while on the trip, "Landed" after).
 * A tag says whether it's your trip or one you joined (and who hosts it).
 *
 * @param {object}  trip       a trip from GET /api/Trips
 * @param {string|null} imageUri
 * @param {boolean} isOwner
 * @param {string|null} [hostName]   shown on joined trips
 * @param {boolean} [showYear]       add the year to the dates
 * @param {() => void} onPress
 * @param {() => void} [onLongPress]
 * @param {string} [notchColor]     no longer used: the notches are real cut-outs
 * @param {boolean} [flatBottom]    square bottom (another section attaches below)
 */
export default function TripBoardingPass({
  trip,
  imageUri,
  isOwner,
  hostName,
  showYear = false,
  onPress,
  onLongPress,
  accessibilityActions,
  onAccessibilityAction,
  flatBottom = false,
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [imageUri]);
  // Presses in while held, with a tick when the menu opens.
  const hold = useHoldPress();
  // The pass's width, for its notched white background.
  const [passW, setPassW] = useState(0);

  const place = placeName(trip) || trip.name;
  const code = placeCode(place);
  const days = dayCount(trip.startDate, trip.endDate);
  const stub = stubInfo(trip);
  const showImage = !!imageUri && !failed;

  const members = Array.isArray(trip.members) ? trip.members.slice(0, MAX_AVATARS) : [];
  const memberCount = typeof trip.memberCount === 'number' ? trip.memberCount : members.length;
  const extra = Math.max(0, memberCount - members.length);

  const attention = tripAttention(trip);
  const subline = !isOwner && hostName ? `Hosted by ${hostName.split(' ')[0]}` : trip.primaryDestination || '';

  const a11y = [
    trip.name,
    place !== trip.name ? place : null,
    isOwner ? 'Your trip' : `Joined${hostName ? `, hosted by ${hostName}` : ''}`,
    shortRange(trip, true),
    days ? `${days} ${days === 1 ? 'day' : 'days'}` : null,
    memberCount ? `${memberCount} ${memberCount === 1 ? 'traveller' : 'travellers'}` : null,
    stub.a11y,
    ...attention.map((a) => a.text),
  ].filter(Boolean).join(', ');

  return (
    <Animated.View style={[styles.shadow, flatBottom && styles.flatBottom, onLongPress && hold.style]}>
      {/* iOS casts one shadow per view: this one's the tight contact shadow
          under the edge (the outer view's is the soft, far one). */}
      <View style={[styles.contactShadow, flatBottom && styles.flatBottom]}>
      <TouchableOpacity
        style={[styles.pass, flatBottom && styles.flatBottom]}
        activeOpacity={0.92}
        disabled={!onPress && !onLongPress}
        onPress={onPress}
        onLongPress={hold.held(onLongPress)}
        onPressIn={onLongPress ? hold.onPressIn : undefined}
        onPressOut={onLongPress ? hold.onPressOut : undefined}
        delayLongPress={HOLD_MS}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityHint="Long press for more options"
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          if (w !== passW) setPassW(w);
        }}
      >
        {/* The white ticket, with its two notches cut out (see-through). Plain
            white for the first frame, until its width is known. */}
        {passW ? (
          <Svg width={passW} height={PASS_HEIGHT} style={styles.fill} pointerEvents="none">
            <Path
              d={ticketPath(passW, PASS_HEIGHT, {
                radius: RADIUS,
                flatBottom,
                notches: PASS_TIP_SHAPE.notches.filter((n) => !flatBottom || n.side === 'top'),
              })}
              fill={COLORS.white}
            />
          </Svg>
        ) : (
          <View style={[styles.fill, styles.plainWhite]} pointerEvents="none" />
        )}
        {/* Main part */}
        <View style={styles.main}>
          <View style={styles.codeRow}>
            <Text style={styles.code} numberOfLines={1}>{code}</Text>
            <View style={styles.route}>
              <View style={styles.routeLine}>
                {Array.from({ length: 6 }).map((_, i) => <View key={i} style={styles.routeDot} />)}
              </View>
              <Ionicons name="airplane" size={14} color={COLORS.accent} />
            </View>
            {!isOwner && (
              <View style={styles.tag}>
                <Ionicons name="people" size={10} color={COLORS.accentDeep} />
                <Text style={styles.tagText}>JOINED</Text>
              </View>
            )}
          </View>

          <Text style={styles.name} numberOfLines={1}>{trip.name}</Text>
          {!!subline && <Text style={styles.subline} numberOfLines={1}>{subline}</Text>}
          {attention.length > 0 && (
            <View style={styles.attention}>
              {attention.map((a) => (
                <View key={a.key} style={styles.attentionItem}>
                  <Ionicons name={a.icon} size={12} color={TONES[a.tone]} />
                  <Text style={[styles.attentionText, { color: TONES[a.tone] }]} numberOfLines={1}>{a.text}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>DATES</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>{shortRange(trip, showYear)}</Text>
            </View>
            <View style={styles.fieldShort}>
              <Text style={styles.fieldLabel}>DAYS</Text>
              <Text style={styles.fieldValue}>{days || '–'}</Text>
            </View>
            <View style={styles.fieldShort}>
              <Text style={styles.fieldLabel}>CREW</Text>
              {members.length > 0 ? (
                <View style={styles.avatars}>
                  {members.map((m, i) => (
                    <View
                      key={m.userId || i}
                      style={[styles.avatar, { backgroundColor: avatarColorFor(m.name), marginLeft: i ? -7 : 0, zIndex: MAX_AVATARS - i }]}
                    >
                      {m.photoUrl ? (
                        <Image source={{ uri: m.photoUrl }} style={styles.avatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.avatarText}>{initialsFor(m.name)}</Text>
                      )}
                    </View>
                  ))}
                  {extra > 0 && <Text style={styles.extra}>+{extra}</Text>}
                </View>
              ) : (
                <Text style={styles.fieldValue}>{trip.travelersCount || 1}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Tear line: dots between two notches cut into the edges. */}
        <View style={styles.tear} pointerEvents="none">
          {Array.from({ length: 9 }).map((_, i) => <View key={i} style={styles.tearDot} />)}
        </View>

        {/* Stub: the destination photo with the countdown on top. */}
        <View style={styles.stub}>
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
          <View style={[styles.fill, { backgroundColor: stub.tint }]} />
          <Text style={styles.stubLabel} numberOfLines={1}>{stub.label}</Text>
          <Text style={[styles.stubValue, stub.small && styles.stubValueSmall]} numberOfLines={1} adjustsFontSizeToFit>
            {stub.value}
          </Text>
          {!!stub.sub && <Text style={styles.stubSub} numberOfLines={1}>{stub.sub}</Text>}
          {stub.progress != null && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(8, stub.progress * 100)}%` }]} />
            </View>
          )}
        </View>

      </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Layered for depth: a soft shadow far below (lifted off the page) and a
  // tight, darker one right under the edge (where it meets it).
  // iOS: the shadows follow what's drawn, notches included. Android's
  // elevation would show grey through the notches, so it gets outer box
  // shadows (drawn only outside the card), all three layers in one.
  shadow: {
    borderRadius: RADIUS,
    ...Platform.select({
      ios: {
        shadowColor: '#1C2833',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.13,
        shadowRadius: 16,
      },
      default: {
        boxShadow: '0px 1px 2px rgba(28, 40, 51, 0.12), 0px 4px 8px rgba(28, 40, 51, 0.07), 0px 12px 22px rgba(28, 40, 51, 0.12)',
      },
    }),
  },
  contactShadow: {
    borderRadius: RADIUS,
    ...Platform.select({
      ios: {
        shadowColor: '#1C2833',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.14,
        shadowRadius: 2.5,
      },
      default: {},
    }),
  },
  // Attached to a section below: square bottom, and no shadow of its own
  // (it would fall across the join; the whole ticket casts one).
  flatBottom: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    shadowOpacity: 0,
    boxShadow: 'none',
  },
  pass: {
    height: PASS_HEIGHT,
    flexDirection: 'row',
    borderRadius: RADIUS,
    // No fill: the notched white shape behind the content is the ticket.
    overflow: 'hidden',
  },
  plainWhite: {
    backgroundColor: COLORS.white,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  main: {
    flex: 1,
    paddingLeft: SIZES.spacing_base + 2,
    paddingRight: SIZES.spacing_md,
    paddingTop: SIZES.spacing_md,
    paddingBottom: SIZES.spacing_md,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  code: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
    letterSpacing: 2,
    includeFontPadding: false,
  },
  route: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeLine: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  routeDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.border,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  tagText: {
    fontSize: 9,
    lineHeight: 14,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 0.8,
    color: COLORS.accentDeep,
    includeFontPadding: false,
  },
  attention: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    marginTop: 5,
    overflow: 'hidden',
  },
  attentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  attentionText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Poppins_600SemiBold',
    includeFontPadding: false,
    flexShrink: 1,
  },
  name: {
    fontSize: SIZES.base - 1,
    lineHeight: 20,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    includeFontPadding: false,
  },
  subline: {
    fontSize: SIZES.sm,
    lineHeight: 16,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    includeFontPadding: false,
  },
  fields: {
    flexDirection: 'row',
    marginTop: 'auto',
    gap: SIZES.spacing_md,
  },
  field: { flex: 1, minWidth: 0 },
  fieldShort: { flexShrink: 0 },
  fieldLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textLight,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  fieldValue: {
    fontSize: SIZES.md - 1,
    lineHeight: AVATAR,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
    includeFontPadding: false,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
    height: AVATAR,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1.5,
    borderColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: {
    fontSize: 8,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  extra: {
    marginLeft: 4,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  tear: {
    width: 2,
    paddingVertical: NOTCH / 2 + 6,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tearDot: {
    width: 2,
    height: 5,
    borderRadius: 1,
    backgroundColor: COLORS.border,
  },
  stub: {
    width: STUB_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.spacing_sm,
    marginLeft: STUB_GAP,
    overflow: 'hidden',
  },
  stubLabel: {
    fontSize: 9,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.85)',
  },
  stubValue: {
    fontSize: 38,
    lineHeight: 44,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    includeFontPadding: false,
  },
  stubValueSmall: {
    fontSize: 22,
    lineHeight: 30,
  },
  stubSub: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.85)',
  },
  progressTrack: {
    marginTop: 6,
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#7FD8A6',
  },
  // Semicircle cut-outs where the stub tears off (page colour, so they read as holes).
});
