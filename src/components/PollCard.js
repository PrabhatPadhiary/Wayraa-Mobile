import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  interpolate,
  useReducedMotion,
} from 'react-native-reanimated';
import { COLORS, SIZES } from '../constants';
import { PALETTE } from '../constants/theme';
import { avatarColorFor, initialsFor } from './TripStackCard';
import { showAlert } from './AppDialog';
import { getStoredUser } from '../services/authService';
import { votePoll, unvotePoll, closePoll, deletePoll, linkPollToItinerary } from '../services/pollsService';
import { createItineraryItem } from '../services/itineraryService';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';
import { normalizePhotoUrl } from '../utils/placePhotos';
import { DAY_SLOTS, isoToDay, dayLabel, stopForDay, placeToItineraryCategory } from '../utils/itinerary';
import { timeAgo } from '../utils/timeAgo';
import { ArrivalGlow } from './Motion';

const SLOT_LABEL = Object.fromEntries(DAY_SLOTS.map((s) => [s.key, s.label]));
const BAR_EASE = Easing.out(Easing.cubic);
// Opening and folding: quick out of the gate, soft landing.
const EXPAND_MS = 320;
const EXPAND_EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** "Sat 13 Jun · Evening", "Evening" or null. */
export function pollWhenLabel(poll) {
  const day = isoToDay(poll?.scheduledDate);
  const slot = poll?.slot && poll.slot !== 'anytime' ? SLOT_LABEL[poll.slot] : null;
  return [day != null ? dayLabel(day) : null, slot].filter(Boolean).join(' · ') || null;
}

/** "Closes in 3h", "Closes in 25 min", "Closed", or null without a deadline. */
function closesLabel(poll, now = Date.now()) {
  if (poll.isClosed) return 'Closed';
  if (!poll.closesAt) return null;
  const mins = Math.round((new Date(poll.closesAt).getTime() - now) / 60000);
  if (mins <= 1) return 'Closing now';
  if (mins < 60) return `Closes in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Closes in ${hours}h`;
  const days = Math.round(hours / 24);
  return `Closes in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Which open poll to show open at first: one you can still vote on, closing
 * soonest (then the newest); if you've voted on them all, the newest.
 */
export function pickFocusPoll(openPolls) {
  if (!openPolls.length) return null;
  const newest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
  const waiting = openPolls.filter((p) => p.canVote && !p.myOptionId);
  if (waiting.length) {
    return [...waiting].sort((a, b) => {
      const ca = a.closesAt ? new Date(a.closesAt).getTime() : Infinity;
      const cb = b.closesAt ? new Date(b.closesAt).getTime() : Infinity;
      return ca - cb || newest(a, b);
    })[0];
  }
  return [...openPolls].sort(newest)[0];
}

/** The poll as it looks after my vote moves to `optionId` (null: taken back). */
function withMyVote(poll, optionId, me) {
  const prev = poll.myOptionId;
  if (prev === optionId) return poll;
  const voter = me ? { id: me.id, name: me.name, photoUrl: me.photoUrl } : null;
  const options = poll.options.map((o) => {
    let { votes, voters } = o;
    if (o.id === prev) {
      votes -= 1;
      voters = voters.filter((v) => v.id !== me?.id);
    }
    if (o.id === optionId) {
      votes += 1;
      voters = voter ? [...voters, voter] : voters;
    }
    return { ...o, votes, voters };
  });
  const totalVotes = poll.totalVotes + (prev ? 0 : 1) - (optionId ? 0 : 1);
  const top = Math.max(0, ...options.map((o) => o.votes));
  return {
    ...poll,
    options,
    totalVotes,
    myOptionId: optionId,
    leadingOptionIds: top > 0 ? options.filter((o) => o.votes === top).map((o) => o.id) : [],
  };
}

/**
 * One poll, as its own card. The header (question, where it stands, a Vote
 * or Closed badge) is always there; the options open and fold beneath it.
 *
 * Open polls are white (an orange edge while you still need to vote); closed
 * ones sit on frost with the winner in the header.
 *
 * Tap an option to vote (again to take it back); bars fill with the share of
 * votes and faces show who picked what. Once closed, the winner can go
 * straight into the itinerary when the poll is about a day.
 *
 * @param {object} poll  as from pollsService
 * @param {string} tripId
 * @param {object[]} sortedDests  the trip's stops (to file the winner under one)
 * @param {boolean} canEdit  may add to the itinerary
 * @param {boolean} [showWhen]  show the day / part of day (off inside an itinerary slot)
 * @param {boolean} [expanded]  options showing (default true)
 * @param {() => void} [onToggle]  makes the header open / fold the card
 * @param {(poll) => void} onChange
 * @param {(id) => void} onRemoved
 * @param {(item) => void} [onAddedToItinerary]
 * @param {boolean} [arrived]  a friend just started it (live): glow once
 */
export default function PollCard({
  poll, tripId, sortedDests = [], canEdit, showWhen = true,
  expanded = true, onToggle, onChange, onRemoved, onAddedToItinerary, arrived = false,
}) {
  const [busy, setBusy] = useState(null); // null | 'close' | 'add'
  const meRef = useRef(null);
  useEffect(() => { getStoredUser().then((u) => { meRef.current = u; }).catch(() => {}); }, []);
  // Votes go out one at a time; a fast second tap waits for the first.
  const voting = useRef(Promise.resolve());

  // ── Open / fold ──────────────────────────────────────────────────────────
  const reduceMotion = useReducedMotion();
  const open = useSharedValue(expanded ? 1 : 0);
  const [bodyHeight, setBodyHeight] = useState(0);
  useEffect(() => {
    open.value = withTiming(expanded ? 1 : 0, { duration: reduceMotion ? 0 : EXPAND_MS, easing: EXPAND_EASE });
  }, [expanded, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodyStyle = useAnimatedStyle(() => ({
    height: bodyHeight * open.value,
    // Contents fade in a beat after the card starts opening, and out quickly.
    opacity: interpolate(open.value, [0.25, 1], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(open.value, [0, 1], [-8, 0]) }],
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(open.value, [0, 1], [0, 180])}deg` }],
  }));
  const collapsible = !!onToggle;

  const vote = (option) => {
    if (!poll.canVote) return;
    Haptics.selectionAsync().catch(() => {});
    const next = poll.myOptionId === option.id ? null : option.id;
    const before = poll;
    onChange(withMyVote(poll, next, meRef.current));
    voting.current = voting.current.then(async () => {
      try {
        const saved = next ? await votePoll(tripId, poll.id, next) : await unvotePoll(tripId, poll.id);
        if (saved) onChange(saved);
      } catch (e) {
        onChange(before);
        showAlert('Couldn\'t save your vote', e?.message || 'Please try again.');
      }
    });
  };

  const endPoll = () => {
    showAlert('End this poll?', 'Voting stops for everyone and the result is shared with the trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End poll',
        onPress: async () => {
          setBusy('close');
          try {
            onChange(await closePoll(tripId, poll.id));
          } catch (e) {
            showAlert('Couldn\'t end the poll', e?.message || 'Please try again.');
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const remove = () => {
    showAlert('Delete this poll?', 'It goes for everyone on the trip, votes and all.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePoll(tripId, poll.id);
            onRemoved(poll.id);
          } catch (e) {
            showAlert('Couldn\'t delete it', e?.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const openMenu = () => {
    showAlert('Poll', null, [
      ...(!poll.isClosed ? [{ text: 'End poll now', onPress: endPoll }] : []),
      { text: 'Delete poll', style: 'destructive', onPress: remove },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const day = isoToDay(poll.scheduledDate);
  const leaders = poll.options.filter((o) => poll.leadingOptionIds.includes(o.id));
  const winners = poll.isClosed ? leaders : [];
  const winner = winners.length === 1 ? winners[0] : null;
  const mine = poll.options.find((o) => o.id === poll.myOptionId);
  const needsVote = poll.canVote && !mine;
  const canAddWinner = canEdit && poll.isClosed && !!winner && day != null && !poll.itineraryItemId && sortedDests.length > 0;

  const addWinner = async () => {
    if (!canAddWinner) return;
    setBusy('add');
    try {
      const placeStop = winner.tripPlaceId
        ? sortedDests.find((d) => (d.places || []).some((p) => p.id === winner.tripPlaceId))
        : null;
      const stop = placeStop || stopForDay(day, sortedDests) || sortedDests[0];
      const item = await createItineraryItem(tripId, {
        destinationId: stop.id,
        tripPlaceId: winner.tripPlaceId,
        title: winner.text,
        category: winner.tripPlaceId ? placeToItineraryCategory(winner.category) : 'custom',
        scheduledDate: poll.scheduledDate,
        slot: poll.slot || 'anytime',
        sortOrder: 999, // after what's already there
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onChange({ ...poll, itineraryItemId: item.id });
      onAddedToItinerary?.(item);
      linkPollToItinerary(tripId, poll.id, item.id).catch(() => {});
    } catch (e) {
      showAlert('Couldn\'t add it to the plan', e?.message || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  // Header's second line: where it stands. Same open or folded, so the card
  // reads as one thing opening rather than swapping for another.
  const when = showWhen ? pollWhenLabel(poll) : null;
  let standing;
  if (poll.isClosed) standing = winner ? `${winner.text} won` : winners.length ? 'Ended in a tie' : 'No votes';
  else if (mine) standing = `You voted ${mine.text}`;
  else if (leaders.length === 1) standing = `${leaders[0].text} leads`;
  else standing = poll.totalVotes ? 'Tied so far' : 'No votes yet';
  const voteCount = poll.totalVotes ? `${poll.totalVotes} ${poll.totalVotes === 1 ? 'vote' : 'votes'}` : null;

  const closes = closesLabel(poll);
  const asker = (poll.createdBy?.name || 'Former traveller').split(' ')[0];
  const max = Math.max(1, ...poll.options.map((o) => o.votes));

  const header = (
    <View style={styles.head}>
      <View style={[styles.headIcon, poll.isClosed ? styles.headIconClosed : needsVote && styles.headIconVote]}>
        <Ionicons
          name={poll.isClosed ? 'trophy' : 'stats-chart'}
          size={14}
          color={poll.isClosed ? COLORS.textSecondary : needsVote ? COLORS.accent : COLORS.primaryLight}
        />
      </View>
      <View style={styles.headText}>
        <Text style={[styles.question, poll.isClosed && styles.questionClosed]} numberOfLines={expanded ? undefined : 2}>
          {poll.question}
        </Text>
        <Text style={styles.standing} numberOfLines={1}>
          <Text style={poll.isClosed && winner ? styles.standingWon : null}>{standing}</Text>
          {voteCount ? ` · ${voteCount}` : ''}
          {when ? ` · ${when}` : ''}
        </Text>
      </View>
      {poll.isClosed ? (
        <View style={styles.closedBadge}><Text style={styles.closedBadgeText}>Closed</Text></View>
      ) : needsVote ? (
        <View style={styles.votePill}>
          <View style={styles.voteDot} />
          <Text style={styles.votePillText}>Vote</Text>
        </View>
      ) : mine ? (
        <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
      ) : null}
      {collapsible && (
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={18} color={COLORS.textMuted} />
        </Animated.View>
      )}
    </View>
  );

  const body = (
    <View style={styles.body}>
      <View style={styles.options} accessibilityRole="radiogroup">
        {poll.options.map((o) => (
          <OptionRow
            key={o.id}
            option={o}
            share={poll.totalVotes ? o.votes / poll.totalVotes : 0}
            fill={o.votes / max}
            mine={poll.myOptionId === o.id}
            leading={poll.leadingOptionIds.includes(o.id) && poll.totalVotes > 0}
            won={!!winner && winner.id === o.id}
            closed={poll.isClosed}
            disabled={!poll.canVote}
            onPress={() => vote(o)}
          />
        ))}
      </View>

      <View style={styles.foot}>
        <Text style={styles.footText} numberOfLines={1}>
          {asker} · {timeAgo(poll.createdAt)}{closes && !poll.isClosed ? ` · ${closes}` : ''}
        </Text>
        <View style={styles.footActions}>
          {poll.canManage && !poll.isClosed && (
            <TouchableOpacity
              style={styles.endButton}
              onPress={endPoll}
              disabled={busy === 'close'}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              {busy === 'close'
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Text style={styles.endText}>End poll</Text>}
            </TouchableOpacity>
          )}
          {poll.canManage && (
            <TouchableOpacity
              onPress={openMenu}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.menu}
              accessibilityRole="button"
              accessibilityLabel="Poll options"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {poll.isClosed && !!poll.itineraryItemId && (
        <View style={styles.planned}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
          <Text style={styles.plannedText} numberOfLines={1}>
            {winner ? `${winner.text} is in the plan` : 'In the plan'}
            {pollWhenLabel(poll) ? ` · ${pollWhenLabel(poll)}` : ''}
          </Text>
        </View>
      )}
      {canAddWinner && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={addWinner}
          disabled={busy === 'add'}
          activeOpacity={0.9}
          accessibilityRole="button"
        >
          {busy === 'add' ? <ActivityIndicator color={COLORS.white} /> : (
            <>
              <Ionicons name="calendar" size={15} color={COLORS.white} />
              <Text style={styles.addText} numberOfLines={1}>Add {winner.text} to {pollWhenLabel(poll)}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.card, poll.isClosed ? styles.cardClosed : needsVote && styles.cardVote]}>
      <ArrivalGlow active={arrived} />
      {collapsible ? (
        <Pressable
          onPress={onToggle}
          style={({ pressed }) => pressed && styles.headPressed}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${poll.question}. ${needsVote ? 'You haven\'t voted. ' : ''}${standing}. ${expanded ? 'Fold' : 'Open'} poll`}
        >
          {header}
        </Pressable>
      ) : header}

      {collapsible ? (
        // The body is measured at full size off to the side, and the clip
        // around it grows from 0 to that height; the cards below move with it.
        <Animated.View
          style={[styles.clip, bodyStyle]}
          pointerEvents={expanded ? 'auto' : 'none'}
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
        >
          <View
            style={styles.measure}
            onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
          >
            {body}
          </View>
        </Animated.View>
      ) : body}
    </View>
  );
}

function OptionRow({ option, share, fill, mine, leading, won, closed, disabled, onPress }) {
  const width = useSharedValue(fill);
  useEffect(() => {
    width.value = withTiming(fill, { duration: 420, easing: BAR_EASE });
  }, [fill]); // eslint-disable-line react-hooks/exhaustive-deps
  const barStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, width.value) * 100}%` }));

  const photo = normalizePhotoUrl(option.photoUrl, 120);
  const pct = Math.round(share * 100);
  const highlighted = closed ? won : mine;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.option,
        closed && styles.optionClosed,
        highlighted && styles.optionOn,
        pressed && styles.optionPressed,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ checked: mine, disabled }}
      accessibilityLabel={`${option.text}, ${option.votes} ${option.votes === 1 ? 'vote' : 'votes'}${won ? ', winner' : ''}`}
    >
      <Animated.View style={[styles.bar, highlighted ? styles.barOn : leading ? styles.barLead : null, barStyle]} />
      <View style={styles.optionRow}>
        {!closed && (
          <View style={[styles.radio, mine && styles.radioOn]}>
            {mine && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
          </View>
        )}
        {won && <Ionicons name="trophy" size={15} color={COLORS.accentDeep} />}
        {!!photo && <Image source={{ uri: photo }} style={[styles.thumb, closed && !won && styles.thumbFaded]} contentFit="cover" />}
        <Text style={[styles.optionText, closed && !won && styles.optionTextFaded, highlighted && styles.optionTextOn]} numberOfLines={2}>
          {option.text}
        </Text>
        <Faces voters={option.voters} />
        <Text style={[styles.pct, highlighted && styles.optionTextOn]}>{option.votes ? `${pct}%` : ''}</Text>
      </View>
    </Pressable>
  );
}

/** Up to three faces, then "+n". */
function Faces({ voters }) {
  if (!voters?.length) return null;
  const shown = voters.slice(0, 3);
  const extra = voters.length - shown.length;
  return (
    <View style={styles.faces}>
      {shown.map((v, i) => {
        const name = v.name || 'Traveller';
        return (
          <View key={v.id} style={[styles.face, { backgroundColor: avatarColorFor(name), marginLeft: i ? -6 : 0 }]}>
            {v.photoUrl
              ? <Image source={{ uri: cloudinarySized(v.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, styles.faceImage]} contentFit="cover" />
              : <Text style={styles.faceText}>{initialsFor(name)}</Text>}
          </View>
        );
      })}
      {extra > 0 && <Text style={styles.facesMore}>+{extra}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SIZES.spacing_md,
    overflow: 'hidden',
  },
  cardVote: {
    borderColor: '#F2C3AF',
  },
  cardClosed: {
    backgroundColor: COLORS.cardBackground,
    borderColor: COLORS.borderLight,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_md,
  },
  headPressed: {
    opacity: 0.7,
  },
  headIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
  },
  headIconVote: {
    backgroundColor: '#FDEFEA',
  },
  headIconClosed: {
    backgroundColor: PALETTE.frostDeep,
  },
  headText: {
    flex: 1,
  },
  question: {
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  questionClosed: {
    color: COLORS.textSecondary,
  },
  standing: {
    marginTop: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  standingWon: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  votePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  voteDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  votePillText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  closedBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: PALETTE.frostDeep,
  },
  closedBadgeText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  clip: {
    overflow: 'hidden',
  },
  measure: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  body: {
    paddingBottom: SIZES.spacing_md,
  },
  menu: {
    paddingHorizontal: 4,
  },
  options: {
    gap: 6,
  },
  option: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  optionClosed: {
    backgroundColor: COLORS.white,
  },
  optionOn: {
    borderColor: COLORS.accent,
  },
  optionPressed: {
    opacity: 0.85,
  },
  bar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: COLORS.border,
    opacity: 0.55,
  },
  barLead: {
    backgroundColor: PALETTE.slatePale,
    opacity: 0.9,
  },
  barOn: {
    backgroundColor: '#FDEFEA',
    opacity: 1,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_sm,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.textLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOn: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  thumb: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.sand,
  },
  thumbFaded: {
    opacity: 0.6,
  },
  optionText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  optionTextFaded: {
    color: COLORS.textMuted,
  },
  optionTextOn: {
    color: COLORS.accentDeep,
    fontFamily: 'Poppins_600SemiBold',
  },
  pct: {
    minWidth: 34,
    textAlign: 'right',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  face: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  faceImage: {
    borderRadius: 10,
  },
  faceText: {
    fontSize: 8,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  facesMore: {
    marginLeft: 3,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_sm,
    minHeight: 30,
  },
  footText: {
    flexShrink: 1,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  footActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  endButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.backgroundWarm,
    minWidth: 76,
    alignItems: 'center',
  },
  endText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  planned: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SIZES.spacing_sm,
  },
  plannedText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.success,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SIZES.spacing_sm,
    height: 44,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  addText: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
