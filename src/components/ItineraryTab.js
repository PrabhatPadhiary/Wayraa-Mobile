import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import {
  getItinerary,
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
  deleteItineraryOutsideRange,
  AuthRequiredError,
} from '../services';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import {
  ITINERARY_CATEGORY,
  tripDays,
  isoToDay,
  dayToIso,
  todayDay,
  dayLabel,
  weekdayOf,
  dateOf,
  timeToMinutes,
  formatDuration,
  compareByTime,
  nextFreeSlot,
  placeToItineraryCategory,
} from '../utils/itinerary';
import ItinerarySheet from './ItinerarySheet';
import DateRangeSheet from './DateRangeSheet';

function errorMessage(e) {
  if (e instanceof AuthRequiredError) return 'Sign in to edit this trip.';
  return e?.message || 'Something went wrong. Please try again.';
}

/** "" and null both mean "no time". */
function hasTime(t) {
  return timeToMinutes(t) != null;
}

/**
 * Itinerary tab of the trip screen: pick a day, see its timeline, add saved
 * places or custom entries, and quick-add unplanned saved places. Renders
 * section cards for the trip's grey canvas.
 *
 * @param {object} trip      trip from GET /Trips/{id}
 * @param {object[]} sortedDests  trip destinations in order (with places)
 * @param {boolean} canEdit
 * @param {(range: { startDate, endDate }) => Promise<void>} onSetTripDates
 *   used when the trip has no dates yet
 */
export default function ItineraryTab({ trip, sortedDests, canEdit, onSetTripDates }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [selectedDay, setSelectedDay] = useState(null);
  const [sheet, setSheet] = useState(null); // null | { item, place }
  const [quickAdding, setQuickAdding] = useState(() => new Set()); // trip place ids
  const [clearing, setClearing] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const dayStripRef = useRef(null);

  const days = useMemo(() => tripDays(trip, sortedDests), [trip, sortedDests]);
  const daySet = useMemo(() => new Set(days.map((d) => d.day)), [days]);

  const load = useCallback(async () => {
    try {
      const data = await getItinerary(trip.id);
      setItems(data);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }, [trip.id]);

  useEffect(() => {
    setStatus('loading');
    load();
  }, [load]);

  // Open on today while the trip is under way, otherwise on Day 1.
  useEffect(() => {
    if (!days.length) { setSelectedDay(null); return; }
    setSelectedDay((current) => {
      if (current != null && daySet.has(current)) return current;
      const today = todayDay();
      return daySet.has(today) ? today : days[0].day;
    });
  }, [days, daySet]);

  // Scroll the day strip so the selected day is visible (pills are 64 wide + gap).
  useEffect(() => {
    const idx = days.findIndex((d) => d.day === selectedDay);
    if (idx > 2) dayStripRef.current?.scrollTo({ x: (idx - 1) * 72, animated: false });
    // Only when days first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  const itemsByDay = useMemo(() => {
    const map = new Map();
    items.forEach((i) => {
      const d = isoToDay(i.scheduledDate);
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(i);
    });
    return map;
  }, [items]);

  const plannedPlaceIds = useMemo(
    () => new Set(items.map((i) => i.tripPlaceId).filter(Boolean)),
    [items]
  );
  const placeById = useMemo(() => {
    const map = new Map();
    sortedDests.forEach((d) => (d.places || []).forEach((p) => map.set(p.id, { ...p, destId: d.id })));
    return map;
  }, [sortedDests]);

  const outside = items.filter((i) => !daySet.has(isoToDay(i.scheduledDate)));

  const suggestSlot = useCallback((day) => nextFreeSlot(itemsByDay.get(day) || []), [itemsByDay]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const saveFromSheet = async (payload) => {
    const editing = sheet?.item;
    if (editing) {
      // The backend ignores nulls on update, so clear values with "".
      const updated = await updateItineraryItem(trip.id, editing.id, {
        ...payload,
        tripPlaceId: payload.tripPlaceId || undefined,
        startTime: payload.startTime || '',
        endTime: payload.endTime || '',
        notes: payload.notes || '',
      });
      setItems((prev) => prev.map((i) => (i.id === editing.id ? { ...i, ...updated } : i)));
    } else {
      const created = await createItineraryItem(trip.id, payload);
      setItems((prev) => [...prev, created]);
    }
    const movedTo = isoToDay(payload.scheduledDate);
    if (movedTo != null && daySet.has(movedTo)) setSelectedDay(movedTo);
    setSheet(null);
  };

  const deleteFromSheet = async () => {
    const editing = sheet?.item;
    if (!editing) return;
    await deleteItineraryItem(trip.id, editing.id);
    setItems((prev) => prev.filter((i) => i.id !== editing.id));
    setSheet(null);
  };

  // One tap: put an unplanned saved place on the selected day at the next free slot.
  const quickAdd = async (place) => {
    if (selectedDay == null || quickAdding.has(place.id)) return;
    setQuickAdding((prev) => new Set(prev).add(place.id));
    try {
      const slot = suggestSlot(selectedDay);
      const created = await createItineraryItem(trip.id, {
        destinationId: place.destId,
        tripPlaceId: place.id,
        title: place.placeName,
        category: placeToItineraryCategory(place.category),
        scheduledDate: dayToIso(selectedDay),
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      setItems((prev) => [...prev, created]);
    } catch (e) {
      Alert.alert('Could not add to plan', errorMessage(e));
    } finally {
      setQuickAdding((prev) => {
        const next = new Set(prev);
        next.delete(place.id);
        return next;
      });
    }
  };

  const clearOutside = () => {
    if (!days.length) return;
    Alert.alert(
      'Clear items outside the trip?',
      `${outside.length} ${outside.length === 1 ? 'item is' : 'items are'} scheduled on days that are no longer part of this trip.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await deleteItineraryOutsideRange(trip.id, dayToIso(days[0].day), dayToIso(days[days.length - 1].day));
              setItems((prev) => prev.filter((i) => daySet.has(isoToDay(i.scheduledDate))));
            } catch (e) {
              Alert.alert('Could not clear', errorMessage(e));
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  };

  // ── States ───────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.card, styles.center]}>
        <Ionicons name="cloud-offline-outline" size={32} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>Couldn't load the itinerary</Text>
        <TouchableOpacity
          style={styles.solidButton}
          onPress={() => { setStatus('loading'); load(); }}
          activeOpacity={0.9}
        >
          <Text style={styles.solidButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!days.length) {
    return (
      <View style={[styles.card, styles.center]}>
        <View style={[styles.bigIcon, { backgroundColor: '#e6f4fb' }]}>
          <Ionicons name="calendar" size={26} color={COLORS.primaryLight} />
        </View>
        <Text style={styles.stateTitle}>Set your trip dates to plan each day</Text>
        <Text style={styles.stateText}>Once the trip has dates, you'll get a day-by-day plan here.</Text>
        {canEdit && (
          <TouchableOpacity style={styles.solidButton} onPress={() => setDatesOpen(true)} activeOpacity={0.9}>
            <Text style={styles.solidButtonText}>Set trip dates</Text>
          </TouchableOpacity>
        )}
        <DateRangeSheet
          visible={datesOpen}
          title="Trip dates"
          startDate={null}
          endDate={null}
          onClose={() => setDatesOpen(false)}
          onApply={async (range) => {
            setDatesOpen(false);
            if (!range.startDate) return;
            try {
              await onSetTripDates({ startDate: range.startDate, endDate: range.endDate || range.startDate });
            } catch (e) {
              Alert.alert('Could not set dates', errorMessage(e));
            }
          }}
        />
      </View>
    );
  }

  // ── Selected day ─────────────────────────────────────────────────────────
  const current = days.find((d) => d.day === selectedDay) || days[0];
  const dayItems = (itemsByDay.get(current.day) || []).slice();
  const anytime = dayItems.filter((i) => !hasTime(i.startTime));
  const timed = dayItems.filter((i) => hasTime(i.startTime)).sort(compareByTime);
  const unplanned = (current.stop?.places || [])
    .filter((p) => !plannedPlaceIds.has(p.id))
    .map((p) => ({ ...p, destId: current.stop.id }));
  const plannedDays = days.filter((d) => (itemsByDay.get(d.day) || []).length > 0).length;

  const renderItem = (item, { showTime }) => {
    const cat = ITINERARY_CATEGORY[item.category] || ITINERARY_CATEGORY.custom;
    const place = item.tripPlaceId ? placeById.get(item.tripPlaceId) : null;
    const thumb = place ? (placePhotoUrl(place.placeId, 160) || normalizePhotoUrl(place.photoUrl, 160)) : null;
    const range = hasTime(item.startTime)
      ? `${item.startTime}${hasTime(item.endTime) ? ` – ${item.endTime}` : ''}`
      : 'Anytime';
    return (
      <View key={item.id} style={styles.timelineRow}>
        <View style={styles.timeCol}>
          {showTime && <Text style={styles.timeText}>{item.startTime}</Text>}
        </View>
        <View style={styles.rail}>
          <View style={[styles.railDot, { backgroundColor: cat.color }]} />
          <View style={styles.railLine} />
        </View>
        <TouchableOpacity
          style={styles.itemCard}
          onPress={() => canEdit && setSheet({ item, place: null })}
          disabled={!canEdit}
          activeOpacity={0.85}
          accessibilityRole={canEdit ? 'button' : undefined}
          accessibilityLabel={`${item.title}, ${range}`}
        >
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.itemThumb} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.itemIcon, { backgroundColor: cat.tint }]}>
              <Ionicons name={cat.icon} size={16} color={cat.color} />
            </View>
          )}
          <View style={styles.itemText}>
            <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.itemMeta} numberOfLines={1}>{range} · {cat.label}</Text>
            {!!item.notes && <Text style={styles.itemNotes} numberOfLines={2}>{item.notes}</Text>}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Timed items with "N h free" gaps between them.
  const timedRows = [];
  timed.forEach((item, idx) => {
    if (idx > 0) {
      const prev = timed[idx - 1];
      const prevEnd = timeToMinutes(prev.endTime) ?? timeToMinutes(prev.startTime) + 60;
      const gap = timeToMinutes(item.startTime) - prevEnd;
      if (gap >= 60) {
        timedRows.push(
          <View key={`gap-${item.id}`} style={styles.gapRow}>
            <View style={styles.timeCol} />
            <View style={styles.rail}><View style={styles.railLineDashed} /></View>
            <Text style={styles.gapText}>{formatDuration(gap)} free</Text>
          </View>
        );
      }
    }
    timedRows.push(renderItem(item, { showTime: true }));
  });

  return (
    <View>
      {/* Day strip */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <View style={[styles.headerIcon, { backgroundColor: '#e6f4fb' }]}>
              <Ionicons name="calendar" size={16} color={COLORS.primaryLight} />
            </View>
            <Text style={styles.title}>{days.length} {days.length === 1 ? 'day' : 'days'}</Text>
          </View>
          <Text style={styles.count}>{plannedDays}/{days.length} planned</Text>
        </View>
        <ScrollView
          ref={dayStripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dayStrip}
        >
          {days.map((d) => {
            const active = d.day === current.day;
            const n = (itemsByDay.get(d.day) || []).length;
            return (
              <TouchableOpacity
                key={d.day}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => setSelectedDay(d.day)}
                activeOpacity={0.85}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Day ${d.index + 1}, ${dayLabel(d.day)}, ${n} planned`}
              >
                <Text style={[styles.dayPillSmall, active && styles.dayPillTextActive]}>Day {d.index + 1}</Text>
                <Text style={[styles.dayPillDate, active && styles.dayPillTextActive]}>{dateOf(d.day)}</Text>
                <Text style={[styles.dayPillSmall, active && styles.dayPillTextActive]}>{weekdayOf(d.day)}</Text>
                <View style={styles.dayPillFoot}>
                  <View style={[styles.dayDot, { backgroundColor: d.color }]} />
                  {n > 0 && <Text style={[styles.dayCount, active && styles.dayPillTextActive]}>{n}</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Selected day */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.dayHeading}>
            <Text style={styles.dayTitle}>Day {current.index + 1} · {dayLabel(current.day)}</Text>
            {!!current.stop && (
              <View style={styles.stopChip}>
                <View style={[styles.dayDot, { backgroundColor: current.color }]} />
                <Text style={styles.stopChipText} numberOfLines={1}>{current.stop.name}</Text>
              </View>
            )}
          </View>
          {canEdit && (
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => setSheet({ item: null, place: null })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Add to day ${current.index + 1}`}
            >
              <Ionicons name="add" size={16} color={COLORS.primary} />
              <Text style={styles.outlineButtonText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {dayItems.length === 0 ? (
          <View style={styles.emptyDay}>
            <Ionicons name="sunny-outline" size={28} color={COLORS.textMuted} />
            <Text style={styles.emptyTitle}>Nothing planned yet</Text>
            <Text style={styles.stateText}>
              {canEdit
                ? (unplanned.length ? 'Add something, or tap + on a saved place below.' : 'Tap Add to plan this day.')
                : 'Nothing has been planned for this day.'}
            </Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {anytime.length > 0 && (
              <>
                <Text style={styles.groupLabel}>Anytime</Text>
                {anytime.map((i) => renderItem(i, { showTime: false }))}
              </>
            )}
            {timedRows}
          </View>
        )}
      </View>

      {/* Not planned yet */}
      {canEdit && unplanned.length > 0 && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Not planned yet</Text>
            <Text style={styles.count}>{unplanned.length}</Text>
          </View>
          <Text style={styles.subText}>Saved in {current.stop?.name}. Tap + to add to Day {current.index + 1}.</Text>
          {unplanned.map((p) => {
            const thumb = placePhotoUrl(p.placeId, 120) || normalizePhotoUrl(p.photoUrl, 120);
            const busy = quickAdding.has(p.id);
            return (
              <View key={p.id} style={styles.unplannedRow}>
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.unplannedThumb} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.unplannedThumb, styles.thumbEmpty]}>
                    <Ionicons name="image-outline" size={16} color={COLORS.textMuted} />
                  </View>
                )}
                <Text style={styles.unplannedName} numberOfLines={1}>{p.placeName}</Text>
                <TouchableOpacity
                  style={styles.quickAdd}
                  onPress={() => quickAdd(p)}
                  disabled={busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${p.placeName} to day ${current.index + 1}`}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Ionicons name="add" size={18} color={COLORS.white} />
                  )}
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Items on days outside the trip */}
      {outside.length > 0 && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Outside trip dates</Text>
            {canEdit && (
              clearing ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <TouchableOpacity onPress={clearOutside} accessibilityRole="button">
                  <Text style={styles.clearText}>Clear these</Text>
                </TouchableOpacity>
              )
            )}
          </View>
          {outside.map((i) => (
            <Text key={i.id} style={styles.outsideItem} numberOfLines={1}>
              {dayLabel(isoToDay(i.scheduledDate))} · {i.title}
            </Text>
          ))}
        </View>
      )}

      <ItinerarySheet
        visible={!!sheet}
        item={sheet?.item || null}
        days={days}
        initialDay={current.day}
        initialPlace={sheet?.place || null}
        sortedDests={sortedDests}
        plannedPlaceIds={plannedPlaceIds}
        suggestSlot={suggestSlot}
        onClose={() => setSheet(null)}
        onSave={saveFromSheet}
        onDelete={deleteFromSheet}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the trip screen's section cards.
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
    borderWidth: 1,
    borderColor: '#e9edf1',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  center: {
    alignItems: 'center',
    paddingVertical: SIZES.spacing_xl,
    gap: SIZES.spacing_sm,
  },
  bigIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stateTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stateText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  solidButton: {
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
  },
  solidButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  cardTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  count: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  subText: {
    marginTop: 2,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  outlineButtonText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },

  // Day strip
  dayStrip: {
    gap: SIZES.spacing_sm,
    paddingTop: SIZES.spacing_md,
  },
  dayPill: {
    width: 64,
    alignItems: 'center',
    paddingVertical: SIZES.spacing_sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  dayPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayPillSmall: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  dayPillDate: {
    fontSize: SIZES.xl,
    lineHeight: 28,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  dayPillTextActive: {
    color: COLORS.white,
  },
  dayPillFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 14,
    marginTop: 2,
  },
  dayDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dayCount: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },

  // Day card
  dayHeading: {
    flexShrink: 1,
    gap: 4,
  },
  dayTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  stopChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
  },
  stopChipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  emptyDay: {
    alignItems: 'center',
    paddingVertical: SIZES.spacing_lg,
    gap: 4,
  },
  emptyTitle: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  timeline: {
    marginTop: SIZES.spacing_md,
  },
  groupLabel: {
    marginBottom: SIZES.spacing_xs,
    marginLeft: 50 + 20,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timeCol: {
    width: 50,
    paddingTop: SIZES.spacing_md,
  },
  timeText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  rail: {
    width: 20,
    alignItems: 'center',
  },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: SIZES.spacing_md + 4,
  },
  railLine: {
    flex: 1,
    width: 2,
    marginTop: 2,
    backgroundColor: COLORS.borderLight,
  },
  railLineDashed: {
    flex: 1,
    width: 0,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
  },
  itemCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#eef1f4',
    backgroundColor: COLORS.white,
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: SIZES.md,
    lineHeight: 19,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  itemMeta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  itemNotes: {
    marginTop: 2,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    fontStyle: 'italic',
    color: COLORS.textSecondary,
  },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
    marginBottom: SIZES.spacing_sm,
  },
  gapText: {
    marginLeft: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },

  // Not planned yet
  unplannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: 6,
  },
  unplannedThumb: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  thumbEmpty: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unplannedName: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  quickAdd: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accentDeep,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Outside range
  clearText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.error,
  },
  outsideItem: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
});
