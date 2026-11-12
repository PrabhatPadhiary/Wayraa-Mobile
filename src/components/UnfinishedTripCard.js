import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { getTripDrafts, clearTripDraft } from '../services/tripDraft';
import { formatDateRange } from '../utils/tripDates';
import { showAlert } from './AppDialog';

/**
 * Trips you started creating but didn't finish (see services/tripDraft): a
 * quiet card per trip (up to 3), side by side — swipe between them, with dots
 * under them. They slide on by themselves every few seconds (pausing for a
 * while after you swipe, and while the screen isn't in view). Renders nothing when there are none. Re-checks whenever its
 * screen comes back into view.
 *
 *  - Tap a row: Create trip opens with that trip filled back in.
 *  - ✕: forgets that one (after "Discard this trip?").
 *
 * @param {object} navigation
 * @param {object} [style]
 * @param {(height: number) => void} [onHeight]  its height (0 when hidden), for
 *   screens that lay it over content
 */
export default function UnfinishedTripCard({ navigation, style, onHeight }) {
  const [drafts, setDrafts] = useState([]);
  const [width, setWidth] = useState(0); // one page = the full width
  const [page, setPage] = useState(0);
  const scrollRef = useRef(null);
  const pausedUntil = useRef(0);
  const isFocused = useIsFocused();

  // Auto-slide to the next trip (back to the first after the last).
  useEffect(() => {
    if (!isFocused || drafts.length < 2 || !width) return undefined;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setPage((p) => {
        const next = (p + 1) % drafts.length;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, AUTO_SLIDE_MS);
    return () => clearInterval(timer);
  }, [isFocused, drafts.length, width]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getTripDrafts().then((list) => {
      if (cancelled) return;
      setDrafts(list);
      if (!list.length) onHeight?.(0);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  if (!drafts.length) return null;

  const discard = (draft) => showAlert('Discard this trip?', `"${draft.tripName || 'Your trip'}" won't be saved.`, [
    { text: 'Keep it', style: 'cancel' },
    {
      text: 'Discard',
      style: 'destructive',
      onPress: async () => {
        await clearTripDraft(draft.id);
        const left = drafts.filter((d) => d.id !== draft.id);
        setDrafts(left);
        setPage((p) => Math.min(p, Math.max(0, left.length - 1)));
        if (!left.length) onHeight?.(0);
      },
    },
  ]);

  const renderRow = (draft) => {
    const place = draft.dest?.name;
    const details = [
      formatDateRange(draft.startDate, draft.endDate),
      draft.travelers > 1 ? `${draft.travelers} travellers` : null,
    ].filter(Boolean).join(' · ') || (place ? `To ${place}` : 'Dates not set yet');
    return (
      <TouchableOpacity
        key={draft.id}
        style={[styles.card, width ? { width } : null]}
        onPress={() => navigation.navigate('CreateTrip', { resumeDraftId: draft.id })}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Continue planning ${draft.tripName || 'your trip'}`}
      >
        <View style={styles.icon}>
          <Feather name="edit-3" size={15} color={COLORS.accentDeep} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {draft.tripName || (place ? `Trip to ${place}` : 'Your trip')}
          </Text>
          <Text style={styles.details} numberOfLines={1}>Unfinished · {details}</Text>
        </View>
        <Text style={styles.continueText}>Continue</Text>
        <TouchableOpacity
          style={styles.close}
          onPress={() => discard(draft)}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Discard ${draft.tripName || 'this unfinished trip'}`}
        >
          <Ionicons name="close" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={style}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        onHeight?.(e.nativeEvent.layout.height);
      }}
    >
      {drafts.length === 1 ? renderRow(drafts[0]) : (
        <>
          <ScrollView
            ref={scrollRef}
            onScrollBeginDrag={() => { pausedUntil.current = Date.now() + PAUSE_AFTER_SWIPE_MS; }}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => width && setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {drafts.map(renderRow)}
          </ScrollView>
          <View style={styles.dots} accessibilityLabel={`Unfinished trip ${page + 1} of ${drafts.length}`}>
            {drafts.map((d, i) => <View key={d.id} style={[styles.dot, i === page && styles.dotOn]} />)}
          </View>
        </>
      )}
    </View>
  );
}

const AUTO_SLIDE_MS = 4000;          // time on each trip
const PAUSE_AFTER_SWIPE_MS = 8000;   // after you swipe, leave it be for a bit

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: SIZES.spacing_sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#d5dbe2',
  },
  dotOn: {
    width: 16,
    backgroundColor: COLORS.accent,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff1e8',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: SIZES.md + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  details: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  continueText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  close: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
