import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  Dimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import DateRangeCalendar from './DateRangeCalendar';
import { dayCount, formatDateRange } from '../utils/tripDates';
import { duplicateTrip } from '../services';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.86;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Use this plan again": copy a trip under a new name, starting on a new day.
 * The copy keeps the trip's length, so picking a start date fills in the end;
 * the stops, saved places, checklist and day plans all move with it. A trip
 * without dates is copied without dates.
 *
 * @param {boolean} visible
 * @param {object|null} trip     a trip from the list (name, startDate, endDate)
 * @param {() => void} onClose
 * @param {(created: { id, name }) => void} onDone
 */
export default function DuplicateTripSheet({ visible, trip, onClose, onDone }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [start, setStart] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Reset each time it opens (during render, so the calendar's first render sees it).
  const [openedFor, setOpenedFor] = useState(null);
  const key = visible && trip ? trip.id : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (key) {
      setName(`${trip.name} (copy)`);
      setStart(null);
      setError(null);
      setSaving(false);
    }
  }
  if (!trip) return null;

  const length = dayCount(trip.startDate, trip.endDate);
  const dated = !!trip.startDate;
  const end = start && length ? new Date(new Date(start).getTime() + (length - 1) * DAY_MS).toISOString() : null;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const created = await duplicateTrip(trip.id, { name: name.trim(), startDate: start });
      onDone?.(created);
    } catch (e) {
      setError(e?.message || 'Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, dated && { height: SHEET_HEIGHT }, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Use this plan again</Text>
              <Text style={styles.subtitle}>
                Copies the stops, saved places, checklist{dated ? ' and day plans' : ''}. Expenses and people stay with the original.
              </Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
              <Ionicons name="close" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Trip name"
            placeholderTextColor={COLORS.textLight}
            maxLength={120}
            returnKeyType="done"
            accessibilityLabel="Name of the new trip"
          />

          {dated && (
            <>
              <View style={styles.dateHead}>
                <Text style={styles.label}>NEW START DATE</Text>
                <Text style={styles.dateValue} numberOfLines={1}>
                  {start ? formatDateRange(start, end) : `Pick a day · ${length || 1} ${length === 1 ? 'day' : 'days'}, like before`}
                </Text>
              </View>
              <View style={styles.calendar}>
                <DateRangeCalendar
                  startDate={start}
                  endDate={end}
                  onChange={(r) => setStart(r.startDate)}
                />
              </View>
              {!start && <Text style={styles.note}>Without a start date, the copy has no dates and its day plans aren't copied.</Text>}
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.primary, (!name.trim() || saving) && styles.primaryOff]}
            onPress={save}
            disabled={!name.trim() || saving}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Create the copy"
          >
            {saving
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.primaryText}>Create copy</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(16, 24, 32, 0.45)',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
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
    alignItems: 'flex-start',
    gap: SIZES.spacing_md,
    marginBottom: SIZES.spacing_base,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: SIZES.sm,
    lineHeight: 17,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    height: 48,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_md + 2,
    backgroundColor: COLORS.backgroundWarm,
    fontSize: SIZES.base - 1,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  dateHead: {
    marginTop: SIZES.spacing_base,
  },
  dateValue: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
    marginBottom: SIZES.spacing_xs,
  },
  calendar: {
    flex: 1,
    marginHorizontal: -SIZES.spacing_lg,
    paddingHorizontal: SIZES.spacing_lg,
  },
  note: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    marginTop: SIZES.spacing_sm,
  },
  error: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
    marginTop: SIZES.spacing_sm,
  },
  primary: {
    marginTop: SIZES.spacing_md,
    minHeight: 50,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOff: { opacity: 0.5 },
  primaryText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
