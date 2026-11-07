import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Pressable,
  Dimensions,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import { normalizePhotoUrl, placePhotoUrl } from '../utils/placePhotos';
import {
  ITINERARY_CATEGORIES,
  QUICK_SLOTS,
  dayToIso,
  isoToDay,
  dayLabel,
  weekdayOf,
  dateOf,
  stopForDay,
  timeToMinutes,
  minutesToTime,
  placeToItineraryCategory,
} from '../utils/itinerary';

const WINDOW_HEIGHT = Dimensions.get('window').height;
const MAX_SHEET_HEIGHT = WINDOW_HEIGHT * 0.9;

function timeToDate(time) {
  const minutes = timeToMinutes(time) ?? 9 * 60;
  const d = new Date();
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function dateToTime(date) {
  return minutesToTime(date.getHours() * 60 + date.getMinutes());
}

/** Which quick slot (if any) matches a start/end pair. */
function slotKeyFor(start, end) {
  if (!start) return 'anytime';
  const match = QUICK_SLOTS.find((s) => s.start === start && s.end === end);
  return match ? match.key : 'custom';
}

/**
 * Bottom sheet to add something to a day of the trip, or edit / move / delete
 * an existing plan item.
 *
 * Add mode lets you pick one of the stop's saved places (title and category
 * fill in) or write a custom entry (e.g. "Train to Tokyo").
 *
 * @param {boolean} visible
 * @param {object|null} item       existing itinerary item, or null to add
 * @param {Array<{ day, index, color }>} days   trip days (see utils/itinerary.tripDays)
 * @param {number} initialDay      day to preselect when adding
 * @param {object|null} [initialPlace]  saved place to preselect when adding
 * @param {object[]} sortedDests   trip destinations (with places), in order
 * @param {Set<string>} plannedPlaceIds  trip place ids already on the plan
 * @param {(day: number) => { startTime, endTime }} suggestSlot  next free slot for a day
 * @param {() => void} onClose
 * @param {(payload) => Promise<void>} onSave   may throw; message shown inline
 * @param {() => Promise<void>} [onDelete]
 */
export default function ItinerarySheet({
  visible,
  item,
  days,
  initialDay,
  initialPlace,
  sortedDests,
  plannedPlaceIds,
  suggestSlot,
  onClose,
  onSave,
  onDelete,
}) {
  const insets = useSafeAreaInsets();
  const iosKeyboard = useKeyboardHeight();
  const keyboardHeight = Platform.OS === 'ios' ? iosKeyboard : 0;
  const isEdit = !!item;

  const [mode, setMode] = useState('place'); // place | custom
  const [placeId, setPlaceId] = useState(null); // trip place id
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('activity');
  const [day, setDay] = useState(initialDay);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [slot, setSlot] = useState('morning');
  const [editingTime, setEditingTime] = useState(null); // null | 'start' | 'end'
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allPlaces = useMemo(
    () => sortedDests.flatMap((d) => (d.places || []).map((p) => ({ ...p, destId: d.id }))),
    [sortedDests]
  );

  useEffect(() => {
    if (!visible) return;
    setError('');
    setSaving(false);
    setEditingTime(null);
    if (item) {
      setMode(item.tripPlaceId ? 'place' : 'custom');
      setPlaceId(item.tripPlaceId || null);
      setTitle(item.title || '');
      setCategory(item.category || 'custom');
      setDay(isoToDay(item.scheduledDate) ?? initialDay);
      setStartTime(item.startTime || '09:00');
      setEndTime(item.endTime || '');
      setSlot(slotKeyFor(item.startTime || null, item.endTime || null));
      setNotes(item.notes || '');
    } else {
      const suggestion = suggestSlot(initialDay);
      setMode('place');
      setPlaceId(initialPlace?.id || null);
      setTitle(initialPlace?.placeName || '');
      setCategory(initialPlace ? placeToItineraryCategory(initialPlace.category) : 'activity');
      setDay(initialDay);
      setStartTime(suggestion.startTime);
      setEndTime(suggestion.endTime);
      setSlot(slotKeyFor(suggestion.startTime, suggestion.endTime));
      setNotes('');
    }
    // Only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item]);

  // Saved places for the chosen day's stop, unplanned ones first.
  const stop = stopForDay(day, sortedDests);
  const stopPlaces = (stop?.places || [])
    .map((p) => ({ ...p, planned: plannedPlaceIds.has(p.id) && p.id !== item?.tripPlaceId }))
    .sort((a, b) => Number(a.planned) - Number(b.planned));

  const pickPlace = (place) => {
    setPlaceId(place.id);
    setTitle(place.placeName);
    setCategory(placeToItineraryCategory(place.category));
    setError('');
  };

  const pickSlot = (s) => {
    setSlot(s.key);
    setEditingTime(null);
    if (s.key === 'anytime') return;
    setStartTime(s.start);
    setEndTime(s.end);
  };

  const onTimeChange = (event, date) => {
    const field = editingTime;
    if (Platform.OS === 'android') setEditingTime(null);
    if (event?.type === 'dismissed' || !date || !field) return;
    const value = dateToTime(date);
    setSlot('custom');
    if (field === 'start') {
      setStartTime(value);
      // Keep the end after the start.
      const s = timeToMinutes(value);
      const e = timeToMinutes(endTime);
      if (e == null || e <= s) setEndTime(minutesToTime(s + 60));
    } else {
      setEndTime(value);
    }
  };

  const save = async () => {
    setError('');
    const finalTitle = title.trim();
    if (!finalTitle) {
      setError(mode === 'place' ? 'Pick a saved place, or switch to Custom.' : 'Add a title, e.g. "Train to Tokyo".');
      return;
    }
    const anytime = slot === 'anytime';
    let start = anytime ? null : startTime;
    let end = anytime ? null : endTime || null;
    if (start && end && timeToMinutes(end) <= timeToMinutes(start)) {
      end = minutesToTime(timeToMinutes(start) + 60);
    }
    const place = mode === 'place' ? allPlaces.find((p) => p.id === placeId) : null;
    const destinationId = place?.destId || stop?.id || sortedDests[0]?.id;
    setSaving(true);
    try {
      await onSave({
        destinationId,
        tripPlaceId: place?.id || null,
        title: finalTitle,
        category,
        scheduledDate: dayToIso(day),
        startTime: start,
        endTime: end,
        notes: notes.trim(),
      });
    } catch (e) {
      setError(e?.message || 'Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Remove from plan?', `"${item?.title}" will be removed from the itinerary.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await onDelete();
          } catch (e) {
            setError(e?.message || 'Could not remove. Please try again.');
            setSaving(false);
          }
        },
      },
    ]);
  };

  const sheetMaxHeight = keyboardHeight
    ? WINDOW_HEIGHT - keyboardHeight - insets.top - SIZES.spacing_sm
    : MAX_SHEET_HEIGHT;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { maxHeight: sheetMaxHeight, marginBottom: keyboardHeight },
            { paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_base },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>{isEdit ? 'Edit plan' : 'Add to plan'}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            {/* Day */}
            <Text style={styles.label}>Day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
              {days.map((d) => {
                const active = d.day === day;
                return (
                  <TouchableOpacity
                    key={d.day}
                    style={[styles.dayPill, active && styles.dayPillActive]}
                    onPress={() => setDay(d.day)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Day ${d.index + 1}, ${dayLabel(d.day)}`}
                  >
                    <Text style={[styles.dayPillTop, active && styles.dayPillTextActive]}>
                      {weekdayOf(d.day)}
                    </Text>
                    <Text style={[styles.dayPillDate, active && styles.dayPillTextActive]}>{dateOf(d.day)}</Text>
                    <View style={[styles.dayDot, { backgroundColor: d.color }]} />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Saved place / custom */}
            {!isEdit && (
              <View style={styles.modeRow}>
                {[
                  { key: 'place', label: 'Saved place', icon: 'bookmark' },
                  { key: 'custom', label: 'Custom', icon: 'create' },
                ].map((m) => {
                  const active = m.key === mode;
                  return (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.modeButton, active && styles.modeButtonActive]}
                      onPress={() => {
                        setMode(m.key);
                        setError('');
                        if (m.key === 'custom') { setPlaceId(null); setTitle(''); setCategory('activity'); }
                      }}
                      activeOpacity={0.85}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons name={m.icon} size={15} color={active ? COLORS.white : COLORS.textSecondary} />
                      <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {mode === 'place' && !isEdit && (
              stopPlaces.length === 0 ? (
                <Text style={styles.hint}>
                  No saved places in {stop?.name || 'this stop'} yet. Add some from Overview, or use Custom.
                </Text>
              ) : (
                <View style={styles.placeList}>
                  {stopPlaces.map((p) => {
                    const active = p.id === placeId;
                    const thumb = placePhotoUrl(p.placeId, 120) || normalizePhotoUrl(p.photoUrl, 120);
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.placeRow, active && styles.placeRowActive]}
                        onPress={() => pickPlace(p)}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${p.placeName}${p.planned ? ', already planned' : ''}`}
                      >
                        {thumb ? (
                          <Image source={{ uri: thumb }} style={styles.placeThumb} contentFit="cover" cachePolicy="memory-disk" />
                        ) : (
                          <View style={[styles.placeThumb, styles.placeThumbEmpty]}>
                            <Ionicons name="image-outline" size={16} color={COLORS.textMuted} />
                          </View>
                        )}
                        <Text style={styles.placeName} numberOfLines={1}>{p.placeName}</Text>
                        {p.planned && <Text style={styles.plannedTag}>Planned</Text>}
                        {active && <Ionicons name="checkmark-circle" size={20} color={COLORS.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )
            )}

            {(mode === 'custom' || isEdit) && (
              <>
                <Text style={styles.label}>Title</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Train to Tokyo"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={120}
                  accessibilityLabel="Title"
                />
                <View style={[styles.chipWrap, styles.gapTop]}>
                  {ITINERARY_CATEGORIES.map((c) => {
                    const active = c.key === category;
                    return (
                      <TouchableOpacity
                        key={c.key}
                        style={[styles.chip, active && { backgroundColor: c.color, borderColor: c.color }]}
                        onPress={() => setCategory(c.key)}
                        activeOpacity={0.85}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <Ionicons name={c.icon} size={13} color={active ? COLORS.white : c.color} />
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* Time */}
            <Text style={styles.label}>Time</Text>
            <View style={styles.chipWrap}>
              {QUICK_SLOTS.map((s) => {
                const active = s.key === slot;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.chip, active && styles.chipNavy]}
                    onPress={() => pickSlot(s)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {s.start ? `${s.label} ${s.start}` : s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {slot !== 'anytime' && (
              <View style={styles.timeRow}>
                {[
                  { key: 'start', label: 'Start', value: startTime },
                  { key: 'end', label: 'End', value: endTime },
                ].map((f) => {
                  const active = editingTime === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.timeField, active && styles.timeFieldActive]}
                      onPress={() => { Keyboard.dismiss(); setEditingTime(active ? null : f.key); }}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`${f.label} time ${f.value || 'not set'}. Tap to change.`}
                    >
                      <Text style={styles.timeLabel}>{f.label}</Text>
                      <Text style={styles.timeValue}>{f.value || '--:--'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {!!editingTime && (
              <DateTimePicker
                value={timeToDate(editingTime === 'start' ? startTime : endTime || startTime)}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minuteInterval={5}
                onChange={onTimeChange}
                style={styles.picker}
              />
            )}

            {/* Notes */}
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.notes]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional, e.g. booking ref, meeting point"
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={500}
              accessibilityLabel="Notes"
            />

            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <View style={styles.footer}>
            {isEdit && onDelete ? (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={confirmDelete}
                disabled={saving}
                activeOpacity={0.85}
                accessibilityLabel="Remove from plan"
              >
                <Ionicons name="trash-outline" size={20} color={COLORS.error} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={save}
              disabled={saving}
              activeOpacity={0.9}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isEdit ? 'Save changes' : `Add to Day ${(days.find((d) => d.day === day)?.index ?? 0) + 1}`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SIZES.spacing_md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  label: {
    marginTop: SIZES.spacing_base,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  gapTop: {
    marginTop: SIZES.spacing_sm,
  },

  dayRow: {
    gap: SIZES.spacing_sm,
  },
  dayPill: {
    width: 52,
    alignItems: 'center',
    paddingVertical: SIZES.spacing_sm,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  dayPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dayPillTop: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  dayPillDate: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  dayPillTextActive: {
    color: COLORS.white,
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },

  modeRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_base,
    padding: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: SIZES.radius_full,
  },
  modeButtonActive: {
    backgroundColor: COLORS.accent,
  },
  modeText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  modeTextActive: {
    color: COLORS.white,
  },

  placeList: {
    marginTop: SIZES.spacing_md,
    gap: SIZES.spacing_sm,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: 6,
    paddingRight: SIZES.spacing_md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  placeRowActive: {
    borderColor: COLORS.accent,
    backgroundColor: '#fff8f3',
  },
  placeThumb: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  placeThumbEmpty: {
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeName: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  plannedTag: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  hint: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },

  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  notes: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipNavy: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
  },
  timeRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_md,
  },
  timeField: {
    flex: 1,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_sm,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeFieldActive: {
    borderColor: COLORS.accent,
    backgroundColor: '#fff8f3',
  },
  timeLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  timeValue: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  picker: {
    alignSelf: 'stretch',
  },
  error: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
  },

  footer: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_md,
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  secondaryButton: {
    minHeight: 50,
    paddingHorizontal: SIZES.spacing_lg,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  deleteButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
