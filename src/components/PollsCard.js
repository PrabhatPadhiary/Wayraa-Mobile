import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import PollCard, { pickFocusPoll } from './PollCard';
import PollComposer from './PollComposer';
import { getPolls, peekPolls, rememberPolls } from '../services/pollsService';
import { useLiveArrivals } from './Motion';

// Which polls were open on each trip, so coming back keeps them open.
const openByTrip = new Map(); // tripId -> Set of poll ids

/**
 * Polls on the trip's Overview, each its own card. At first one is open
 * (the one waiting for your vote and closing soonest) and the rest are
 * folded to their header; tap a header to open or fold that poll, and any
 * number can be open at once. Closed polls sit behind "+N closed". Owners and members start polls and vote; viewers see them
 * once there are any.
 *
 * @param {object} trip
 * @param {object[]} sortedDests
 * @param {boolean} canEdit  owner or member (may start polls and vote)
 * @param {number} liveKey  bumps when someone changes the trip: reload
 * @param {() => void} [onItineraryChanged]  the winner went into the itinerary
 */
export default function PollsCard({ trip, sortedDests, canEdit, liveKey, onItineraryChanged }) {
  const tripId = trip?.id;
  // As last loaded, at once; the fresh copy loads behind it.
  const [polls, setPolls] = useState(() => peekPolls(tripId) || []);
  const [loaded, setLoaded] = useState(() => !!peekPolls(tripId));
  useEffect(() => {
    if (loaded) rememberPolls(tripId, polls);
  }, [loaded, polls, tripId]);
  const [showClosed, setShowClosed] = useState(false);
  const [composer, setComposer] = useState(null); // null | {}
  // Polls a friend just started (live): they glow once.
  const freshPolls = useLiveArrivals(polls, liveKey);
  // Polls showing their options. The first one is picked once, after loading.
  const [openIds, setOpenIds] = useState(() => openByTrip.get(tripId) || new Set());
  const picked = useRef(openByTrip.has(tripId));
  useEffect(() => {
    if (picked.current) openByTrip.set(tripId, openIds);
  }, [openIds, tripId]);

  const load = useCallback(() => {
    if (!tripId) return;
    getPolls(tripId)
      .then((list) => { setPolls(list); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [tripId]);
  useEffect(() => { load(); }, [load, liveKey]);

  useEffect(() => {
    if (!loaded || picked.current) return;
    picked.current = true;
    const focus = pickFocusPoll(polls.filter((p) => !p.isClosed));
    const first = focus ? new Set([focus.id]) : new Set();
    openByTrip.set(tripId, first);
    setOpenIds(first);
  }, [loaded, polls]);

  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const replace = (poll) => setPolls((prev) => prev.map((p) => (p.id === poll.id ? poll : p)));
  const remove = (id) => setPolls((prev) => prev.filter((p) => p.id !== id));

  const composerEl = (
    <PollComposer
      trip={trip}
      sortedDests={sortedDests}
      draft={composer}
      onClose={() => setComposer(null)}
      onCreated={(poll) => { setPolls((prev) => [poll, ...prev]); setOpenIds((prev) => new Set(prev).add(poll.id)); setComposer(null); }}
    />
  );

  if (!loaded || (!canEdit && polls.length === 0)) return composerEl;

  const open = polls.filter((p) => !p.isClosed);
  const closed = polls.filter((p) => p.isClosed);
  const shown = [...open, ...(showClosed ? closed : !open.length ? closed.slice(0, 1) : [])];
  const hiddenClosed = closed.length - shown.filter((p) => p.isClosed).length;
  const single = shown.length === 1 && !shown[0].isClosed;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Ionicons name="stats-chart" size={14} color={COLORS.primaryLight} />
          </View>
          <Text style={styles.title}>Polls</Text>
          {open.length > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{open.length} open</Text></View>
          )}
        </View>
        {canEdit && polls.length > 0 && (
          <TouchableOpacity
            style={styles.newButton}
            onPress={() => setComposer({})}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Start a poll"
          >
            <Ionicons name="add" size={16} color={COLORS.primary} />
            <Text style={styles.newButtonText}>New</Text>
          </TouchableOpacity>
        )}
      </View>

      {polls.length === 0 ? (
        <TouchableOpacity
          style={styles.empty}
          onPress={() => setComposer({})}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Start a poll"
        >
          <Text style={styles.emptyText}>
            Can't decide where to eat or what to do? Put it to a vote. Add your saved places as options.
          </Text>
          <View style={styles.emptyCta}>
            <Ionicons name="stats-chart" size={14} color={COLORS.white} />
            <Text style={styles.emptyCtaText}>Start a poll</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.list}>
            {shown.map((p) => (
              <PollCard
                key={p.id}
                poll={p}
                tripId={tripId}
                sortedDests={sortedDests}
                canEdit={canEdit}
                arrived={freshPolls.has(p.id)}
                expanded={single || openIds.has(p.id)}
                onToggle={single ? undefined : () => toggle(p.id)}
                onChange={replace}
                onRemoved={remove}
                onAddedToItinerary={onItineraryChanged}
              />
            ))}
          </View>
          {(showClosed ? closed.length > (open.length ? 0 : 1) : hiddenClosed > 0) && (
            <TouchableOpacity
              style={styles.more}
              onPress={() => setShowClosed((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.moreText}>{showClosed ? 'Hide closed polls' : `+${hiddenClosed} closed`}</Text>
              <Ionicons name={showClosed ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.primaryLight} />
            </TouchableOpacity>
          )}
        </>
      )}

      {composerEl}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
    shadowColor: '#2B3F51',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  titleIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
  },
  title: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  badgeText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.backgroundWarm,
  },
  newButtonText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  list: {
    marginTop: SIZES.spacing_sm,
    gap: SIZES.spacing_sm,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingTop: SIZES.spacing_md,
  },
  moreText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primaryLight,
  },
  empty: {
    marginTop: SIZES.spacing_sm,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.cardBackground,
  },
  emptyText: {
    fontSize: SIZES.sm,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.primary,
  },
  emptyCtaText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
