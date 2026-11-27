import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { COLORS, SIZES } from '../constants';
import { dayCount, daysUntil } from '../utils/tripDates';
import { avatarColorFor, initialsFor } from '../utils/avatars';
import { tripPhase } from './TripBoardingPass';

export const TICKET_HEIGHT = 164;
const STUB_WIDTH = 100;
// The stub is a rounded panel inset from the ticket's edges (so it never
// looks cut off where the ticket ends or joins the section below).
const STUB_INSET = 8;
/** How far the tear line (before the stub) is from the right edge. */
export const TICKET_TEAR_FROM_RIGHT = STUB_WIDTH + STUB_INSET * 2 + 1;
const NOTCH = 20;
const AVATAR = 26;
const MAX_AVATARS = 3;
const QR = 54;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2–16 Jan", "28 Dec – 3 Jan", or "Not set". */
function shortRange(start, end) {
  const s = start ? new Date(start) : null;
  const e = end ? new Date(end) : null;
  if (!s) return 'Not set';
  if (!e) return `From ${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]}`;
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[s.getUTCMonth()]}`;
  }
  return `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
}

/** A place's main name: "Goa, India" → "Goa". */
const shortName = (name) => (name || '').split(',')[0].trim();

/**
 * The trip's route from its own stops, in order: { from, to, via } (via =
 * how many stops between), or { only } for a one-stop trip.
 */
export function ticketRoute(places) {
  const names = (places || []).map(shortName).filter(Boolean);
  if (names.length <= 1) return { only: names[0] || 'Somewhere new' };
  return { from: names[0], to: names[names.length - 1], via: names.length - 2 };
}

/** What the stub says, from the dates: { top, big, bottom, live, done }. */
function stubState(trip) {
  const phase = tripPhase(trip);
  if (phase === 'past') return { top: 'TRIP', big: '✓', bottom: 'DONE', done: true };
  if (phase === 'draft') return { top: 'DATES', big: 'TBD', bottom: 'not set' };
  const until = daysUntil(trip.startDate);
  if (phase === 'now') {
    const total = dayCount(trip.startDate, trip.endDate);
    const day = 1 - until;
    return { top: 'DAY', big: total ? `${day}/${total}` : String(day), bottom: 'ON TRIP', live: true };
  }
  return until === 1
    ? { top: 'DEPARTS', big: '1', bottom: 'DAY' }
    : { top: 'IN', big: String(until), bottom: 'DAYS' };
}

/**
 * The trip's ticket, as a boarding pass: its route (one stop's name, or
 * first → last stop with "+2 stops" between), the dates, stops, spots and
 * crew as fields, and a stub with what changes (IN 12 DAYS / DAY 1/4 / ✓
 * DONE) and, for people who can invite, a QR code a friend scans to join.
 *
 * @param {object} trip              startDate, endDate, status
 * @param {string[]} places          the stops' names, in route order
 * @param {number} stops
 * @param {number} spots
 * @param {Array} members            [{ userId, name, photoUrl }]
 * @param {number} memberCount
 * @param {string|null} [qrValue]    invite link for the QR
 * @param {() => void} [onPressDates]
 * @param {() => void} [onPressCrew]
 * @param {() => void} [onPressQr]
 * @param {boolean} [flatBottom]     square bottom (a section attaches below)
 * @param {string} [notchColor]
 */
export default function TripTicket({
  trip,
  places,
  stops,
  spots,
  members = [],
  memberCount,
  qrValue,
  onPressDates,
  onPressCrew,
  onPressQr,
  flatBottom = false,
  notchColor,
}) {
  const stub = stubState(trip);
  const shown = members.slice(0, MAX_AVATARS);
  const crew = Math.max(memberCount || 0, members.length, 1);
  const extra = Math.max(0, crew - shown.length);
  const notch = notchColor ? { backgroundColor: notchColor } : null;

  const route = ticketRoute(places);
  const days = dayCount(trip.startDate, trip.endDate);
  const dates = shortRange(trip.startDate, trip.endDate);
  // One plane between the places (or after a single place), with the stops
  // in between above it.
  const plane = (via) => (
    <View style={styles.plane}>
      {!!via && <Text style={styles.via} numberOfLines={1}>{via}</Text>}
      <Ionicons name="airplane" size={16} color={COLORS.accent} />
    </View>
  );

  return (
    <View style={[styles.shadow, flatBottom && styles.flat]}>
      <View style={[styles.ticket, flatBottom && styles.flat]}>
        <View style={styles.main}>
          <View>
            {/* Route: the stop's name, or first → last stop. */}
            {route.only ? (
              <View accessible accessibilityLabel={`Trip to ${route.only}`}>
                <Text style={styles.routeLabel}>TRIP TO</Text>
                <View style={styles.route}>
                  <Text style={styles.placeOnly} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{route.only}</Text>
                  {plane(null)}
                </View>
              </View>
            ) : (
              <View
                accessible
                accessibilityLabel={`${route.from} to ${route.to}${route.via ? `, ${route.via} more ${route.via === 1 ? 'stop' : 'stops'} between` : ''}`}
              >
                <Text style={styles.routeLabel}>ROUTE</Text>
                <View style={styles.route}>
                  <Text style={styles.place} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{route.from}</Text>
                  {plane(route.via ? `+${route.via}` : null)}
                  <Text style={styles.place} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{route.to}</Text>
                </View>
              </View>
            )}

            {/* Dates, on their own line under the place (never cut off). */}
            <TouchableOpacity
              style={styles.datesRow}
              onPress={onPressDates}
              disabled={!onPressDates}
              activeOpacity={0.6}
              hitSlop={6}
              accessibilityRole={onPressDates ? 'button' : undefined}
              accessibilityLabel={`Dates ${dates}${days ? `, ${days} days` : ''}${onPressDates ? '. Change dates' : ''}`}
            >
              <Text style={styles.datesText} numberOfLines={1}>
                {dates}
                {days ? <Text style={styles.datesDays}>{`  ·  ${days} ${days === 1 ? 'day' : 'days'}`}</Text> : null}
              </Text>
              {!!onPressDates && <MaterialCommunityIcons name="pencil" size={15} color={COLORS.accent} />}
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.label}>STOPS</Text>
              <Text style={styles.value}>{stops}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>SPOTS</Text>
              <Text style={styles.value}>{spots}</Text>
            </View>
            <TouchableOpacity
              style={styles.field}
              onPress={onPressCrew}
              disabled={!onPressCrew}
              activeOpacity={0.6}
              accessibilityRole={onPressCrew ? 'button' : undefined}
              accessibilityLabel={`${crew} ${crew === 1 ? 'traveller' : 'travellers'}`}
            >
              <Text style={styles.label}>CREW</Text>
              <View style={styles.avatars}>
                {shown.length ? shown.map((m, i) => (
                  <View
                    key={m.userId || i}
                    style={[styles.avatar, { backgroundColor: avatarColorFor(m.name), marginLeft: i ? -7 : 0, zIndex: MAX_AVATARS - i }]}
                  >
                    {m.photoUrl
                      ? <Image source={{ uri: m.photoUrl }} style={styles.avatarImg} contentFit="cover" />
                      : <Text style={styles.avatarText}>{initialsFor(m.name)}</Text>}
                  </View>
                )) : <Text style={styles.value}>{crew}</Text>}
                {shown.length > 0 && extra > 0 && <Text style={styles.extra}>+{extra}</Text>}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tear line */}
        <View style={styles.tear} pointerEvents="none">
          {Array.from({ length: 9 }).map((_, i) => <View key={i} style={styles.tearDot} />)}
        </View>

        {/* Stub: what changes, and the invite QR */}
        <View style={[styles.stub, stub.live && styles.stubLive, stub.done && styles.stubDone]}>
          <View style={styles.stateWrap} accessible accessibilityLabel={`${stub.top} ${stub.big} ${stub.bottom}`}>
            <View style={styles.stateTopRow}>
              {stub.live && <View style={styles.liveDot} />}
              <Text style={styles.stateTop}>{stub.top}</Text>
            </View>
            <Text style={[styles.stateBig, !qrValue && styles.stateBigLarge]} numberOfLines={1} adjustsFontSizeToFit>{stub.big}</Text>
            <Text style={styles.stateBottom}>{stub.bottom}</Text>
          </View>
          {!!qrValue && (
            <Pressable
              style={styles.qrWrap}
              onPress={onPressQr}
              disabled={!onPressQr}
              accessibilityRole="button"
              accessibilityLabel="Invite QR code. A friend scans it to join this trip"
            >
              <View style={styles.qr}>
                <QRCode value={qrValue} size={QR - 8} color={COLORS.textPrimary} backgroundColor={COLORS.white} ecl="L" />
              </View>
              <Text style={styles.qrLabel}>scan to join</Text>
            </Pressable>
          )}
        </View>

        <View style={[styles.notch, styles.notchTop, notch]} pointerEvents="none" />
        {!flatBottom && <View style={[styles.notch, styles.notchBottom, notch]} pointerEvents="none" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: 20,
    shadowColor: '#1C2833',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  flat: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  ticket: {
    height: TICKET_HEIGHT,
    flexDirection: 'row',
    borderRadius: 20,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_md + 2,
    paddingBottom: SIZES.spacing_md,
    justifyContent: 'space-between',
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  plane: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  datesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  datesText: {
    flexShrink: 1,
    fontSize: SIZES.base + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  datesDays: {
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  routeLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textLight,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  place: {
    flexShrink: 1,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
    includeFontPadding: false,
  },
  // A one-stop trip: just its name, bigger.
  placeOnly: {
    flexShrink: 1,
    fontSize: 26,
    lineHeight: 32,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
    includeFontPadding: false,
  },
  via: {
    fontSize: 9,
    lineHeight: 11,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.accentDeep,
    marginBottom: -1,
  },
  fields: {
    flexDirection: 'row',
    gap: SIZES.spacing_lg,
  },
  field: { flexShrink: 0 },
  label: {
    fontSize: 10,
    lineHeight: 13,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textLight,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  value: {
    fontSize: SIZES.lg,
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
    fontSize: 9,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  extra: {
    marginLeft: 4,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  tear: {
    width: 1,
    marginLeft: STUB_INSET,
    paddingVertical: NOTCH / 2 + 6,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tearDot: {
    width: 1.5,
    height: 5,
    borderRadius: 1,
    backgroundColor: COLORS.border,
  },
  // The stub: dark slate, green while you're on the trip, grey once done.
  stub: {
    width: STUB_WIDTH,
    margin: STUB_INSET,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  stubLive: { backgroundColor: '#1F3B2D' },
  stubDone: { backgroundColor: '#5E6B77' },
  stateWrap: { alignItems: 'center' },
  stateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7FD8A6',
  },
  stateTop: {
    fontSize: 9,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.75)',
  },
  stateBig: {
    fontSize: 20,
    lineHeight: 24,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
    includeFontPadding: false,
    maxWidth: STUB_WIDTH - 12,
  },
  stateBigLarge: {
    fontSize: 32,
    lineHeight: 38,
  },
  stateBottom: {
    fontSize: 9,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.75)',
  },
  qrWrap: { alignItems: 'center' },
  qr: {
    width: QR,
    height: QR,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLabel: {
    marginTop: 2,
    fontSize: 8,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.75)',
  },
  notch: {
    position: 'absolute',
    width: NOTCH,
    height: NOTCH,
    borderRadius: NOTCH / 2,
    backgroundColor: COLORS.backgroundWarm,
    // Centred on the tear line.
    right: TICKET_TEAR_FROM_RIGHT - 0.5 - NOTCH / 2,
  },
  notchTop: { top: -NOTCH / 2 },
  notchBottom: { bottom: -NOTCH / 2 },
});
