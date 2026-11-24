import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import {
  createPoll,
  POLL_QUESTION_MAX,
  POLL_OPTION_MAX,
  POLL_MIN_OPTIONS,
  POLL_MAX_OPTIONS,
} from '../services/pollsService';
import { normalizePhotoUrl } from '../utils/placePhotos';
import { DAY_SLOTS, tripDays, dayToIso, weekdayOf, dateOf } from '../utils/itinerary';

/** Quick starts: the question, and which saved places to offer first. */
const STARTERS = [
  { question: 'Where should we eat?', category: 'food', slot: 'evening' },
  { question: 'What should we do?', category: 'activities' },
  { question: 'Where should we stay?', category: 'stays' },
];

const CATEGORY_OF = (c) => {
  const k = (c || '').toLowerCase();
  if (['food', 'restaurant', 'restaurants'].includes(k)) return 'food';
  if (['stay', 'stays', 'hotel', 'hotels'].includes(k)) return 'stays';
  return 'activities';
};

/** Closing time choices. Each returns an ISO time, or null for "when someone ends it". */
function closeChoices(now = new Date()) {
  const inHours = (h) => new Date(now.getTime() + h * 3600000);
  const tonight = new Date(now);
  tonight.setHours(22, 0, 0, 0);
  const choices = [
    { key: 'none', label: 'When it\'s ended', at: () => null },
    { key: '1h', label: 'In 1 hour', at: () => inHours(1).toISOString() },
    { key: '3h', label: 'In 3 hours', at: () => inHours(3).toISOString() },
  ];
  if (tonight.getTime() - now.getTime() > 3.5 * 3600000) {
    choices.push({ key: 'tonight', label: 'Tonight, 10pm', at: () => tonight.toISOString() });
  }
  choices.push({ key: '24h', label: 'In 24 hours', at: () => inHours(24).toISOString() });
  return choices;
}

let rowId = 0;
const textRow = (text = '') => ({ key: `r${(rowId += 1)}`, text });
const placeRow = (p) => ({ key: `p${p.id}`, text: p.placeName, place: p });

/**
 * Bottom sheet to start a poll. `draft`: null (closed) or { day?, slot? }
 * (from an itinerary slot, those come pre-picked).
 *
 * @param {object} trip
 * @param {object[]} sortedDests
 * @param {(poll) => void} onCreated
 */
export default function PollComposer({ trip, sortedDests = [], draft, onClose, onCreated }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { height: screenH } = useWindowDimensions();
  const [question, setQuestion] = useState('');
  const [rows, setRows] = useState([textRow(), textRow()]);
  const [day, setDay] = useState(null);
  const [slot, setSlot] = useState(null);
  const [closeKey, setCloseKey] = useState('none');
  const [focusCategory, setFocusCategory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const days = useMemo(() => tripDays(trip, sortedDests), [trip, sortedDests]);
  const choices = useMemo(() => closeChoices(), [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!draft) return;
    setQuestion('');
    setRows([textRow(), textRow()]);
    setDay(draft.day ?? null);
    setSlot(draft.slot ?? null);
    setCloseKey('none');
    setFocusCategory(null);
    setSaving(false);
    setError('');
  }, [draft]);

  // Saved places not in the poll yet; the starter's category first.
  const places = useMemo(() => {
    const used = new Set(rows.filter((r) => r.place).map((r) => r.place.id));
    const all = sortedDests.flatMap((d) => (d.places || []).map((p) => ({ ...p, destName: d.name })))
      .filter((p) => !used.has(p.id));
    if (!focusCategory) return all;
    return [
      ...all.filter((p) => CATEGORY_OF(p.category) === focusCategory),
      ...all.filter((p) => CATEGORY_OF(p.category) !== focusCategory),
    ];
  }, [sortedDests, rows, focusCategory]);

  const filled = rows.filter((r) => r.place || r.text.trim());
  const full = rows.length >= POLL_MAX_OPTIONS && rows.every((r) => r.place || r.text.trim());
  const canSave = !!question.trim() && question.length <= POLL_QUESTION_MAX
    && filled.length >= POLL_MIN_OPTIONS && !saving;

  const setRowText = (key, text) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, text } : r)));
    setError('');
  };
  const removeRow = (key) => setRows((prev) => {
    const next = prev.filter((r) => r.key !== key);
    return next.length >= POLL_MIN_OPTIONS ? next : [...next, textRow()];
  });
  const addRow = () => setRows((prev) => (prev.length < POLL_MAX_OPTIONS ? [...prev, textRow()] : prev));
  const addPlace = (p) => setRows((prev) => {
    // Fill the first empty row, else add one.
    const empty = prev.findIndex((r) => !r.place && !r.text.trim());
    if (empty >= 0) return prev.map((r, i) => (i === empty ? placeRow(p) : r));
    return prev.length < POLL_MAX_OPTIONS ? [...prev, placeRow(p)] : prev;
  });

  const applyStarter = (s) => {
    setQuestion(s.question);
    setFocusCategory(s.category);
    if (s.slot && day != null && !slot) setSlot(s.slot);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const poll = await createPoll(trip.id, {
        question: question.trim(),
        options: filled.map((r) => (r.place
          ? { tripPlaceId: r.place.id }
          : { text: r.text.trim().slice(0, POLL_OPTION_MAX) })),
        scheduledDate: day != null ? dayToIso(day) : null,
        slot: day != null ? slot : null,
        closesAt: choices.find((c) => c.key === closeKey)?.at() ?? null,
      });
      onCreated(poll);
    } catch (e) {
      setError(e?.message || 'Couldn\'t start the poll. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={() => !saving && onClose()}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => !saving && onClose()} accessibilityLabel="Close" />
        <View style={[styles.sheet, { maxHeight: screenH * 0.9 - keyboardHeight, marginBottom: keyboardHeight }]}>
          <View style={styles.grabber} />
          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: SIZES.spacing_base }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetTitle}>New poll</Text>
            <Text style={styles.sheetHint}>Everyone on the trip gets a notification and can vote.</Text>

            <TextInput
              style={styles.questionInput}
              value={question}
              onChangeText={(t) => { setQuestion(t); setError(''); }}
              placeholder="Ask the group…"
              placeholderTextColor={COLORS.textMuted}
              maxLength={POLL_QUESTION_MAX}
              multiline
              autoFocus
              editable={!saving}
              accessibilityLabel="Question"
            />
            {!question.trim() && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
                {STARTERS.map((s) => (
                  <TouchableOpacity key={s.question} style={styles.starter} onPress={() => applyStarter(s)} activeOpacity={0.8}>
                    <Text style={styles.starterText}>{s.question}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <Text style={styles.label}>Options</Text>
            {rows.map((r, i) => (
              <View key={r.key} style={styles.optionRow}>
                {r.place ? (
                  <View style={styles.placeOption}>
                    {normalizePhotoUrl(r.place.photoUrl, 120)
                      ? <Image source={{ uri: normalizePhotoUrl(r.place.photoUrl, 120) }} style={styles.placeThumb} contentFit="cover" />
                      : <View style={[styles.placeThumb, styles.placeThumbEmpty]}><Ionicons name="location" size={14} color={COLORS.primaryLight} /></View>}
                    <Text style={styles.placeName} numberOfLines={1}>{r.place.placeName}</Text>
                  </View>
                ) : (
                  <TextInput
                    style={styles.optionInput}
                    value={r.text}
                    onChangeText={(t) => setRowText(r.key, t)}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor={COLORS.textMuted}
                    maxLength={POLL_OPTION_MAX}
                    editable={!saving}
                    returnKeyType="next"
                    accessibilityLabel={`Option ${i + 1}`}
                  />
                )}
                {(rows.length > POLL_MIN_OPTIONS || r.place || r.text) && (
                  <TouchableOpacity
                    onPress={() => removeRow(r.key)}
                    hitSlop={8}
                    style={styles.removeOption}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove option ${i + 1}`}
                  >
                    <Ionicons name="close" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            {rows.length < POLL_MAX_OPTIONS && (
              <TouchableOpacity style={styles.addOption} onPress={addRow} activeOpacity={0.7} accessibilityRole="button">
                <Ionicons name="add" size={16} color={COLORS.primary} />
                <Text style={styles.addOptionText}>Add option</Text>
              </TouchableOpacity>
            )}

            {places.length > 0 && !full && (
              <>
                <Text style={styles.subLabel}>From your saved places</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
                  {places.slice(0, 20).map((p) => {
                    const photo = normalizePhotoUrl(p.photoUrl, 120);
                    return (
                      <TouchableOpacity key={p.id} style={styles.placeChip} onPress={() => addPlace(p)} activeOpacity={0.8} accessibilityLabel={`Add ${p.placeName}`}>
                        {photo
                          ? <Image source={{ uri: photo }} style={styles.chipThumb} contentFit="cover" />
                          : <Ionicons name="location-outline" size={14} color={COLORS.primaryLight} />}
                        <Text style={styles.placeChipText} numberOfLines={1}>{p.placeName}</Text>
                        <Ionicons name="add" size={14} color={COLORS.accent} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {days.length > 0 && (
              <>
                <Text style={styles.label}>For a day? <Text style={styles.optional}>Optional</Text></Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Chip label="Any time" on={day == null} onPress={() => { setDay(null); setSlot(null); }} />
                  {days.map((d) => (
                    <Chip
                      key={d.day}
                      label={`${weekdayOf(d.day)} ${dateOf(d.day)}`}
                      sub={`Day ${d.index + 1}`}
                      on={day === d.day}
                      onPress={() => setDay(d.day)}
                    />
                  ))}
                </ScrollView>
                {day != null && (
                  <View style={styles.slotRow}>
                    {DAY_SLOTS.map((s) => (
                      <Chip
                        key={s.key}
                        label={s.label}
                        icon={s.icon}
                        on={slot === s.key}
                        onPress={() => setSlot(slot === s.key ? null : s.key)}
                      />
                    ))}
                  </View>
                )}
              </>
            )}

            <Text style={styles.label}>Voting closes</Text>
            <View style={styles.slotRow}>
              {choices.map((c) => (
                <Chip key={c.key} label={c.label} on={closeKey === c.key} onPress={() => setCloseKey(c.key)} />
              ))}
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled, { marginBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_base }]}
            onPress={save}
            disabled={!canSave}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveText}>Start poll</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ label, sub, icon, on, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      {!!icon && <Ionicons name={icon} size={14} color={on ? COLORS.white : COLORS.primaryLight} />}
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
      {!!sub && <Text style={[styles.chipSub, on && styles.chipTextOn]}>{sub}</Text>}
    </TouchableOpacity>
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
  scroll: {
    flexShrink: 1,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SIZES.spacing_md,
  },
  sheetTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  sheetHint: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginBottom: SIZES.spacing_md,
  },
  questionInput: {
    minHeight: 52,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  chipRow: {
    gap: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_sm,
  },
  starter: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  starterText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accentDeep,
  },
  label: {
    marginTop: SIZES.spacing_base,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  optional: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  subLabel: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.spacing_sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    minHeight: 48,
  },
  optionInput: {
    flex: 1,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: 12,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  placeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 8,
  },
  placeThumb: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.sand,
  },
  placeThumbEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeName: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  removeOption: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 12,
  },
  addOption: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 4,
  },
  addOptionText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.sand,
  },
  placeChipText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.backgroundWarm,
  },
  chipOn: {
    backgroundColor: COLORS.primary,
  },
  chipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.primary,
  },
  chipSub: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  chipTextOn: {
    color: COLORS.white,
  },
  error: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
  },
  saveButton: {
    marginTop: SIZES.spacing_sm,
    height: 50,
    borderRadius: SIZES.radius_full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
