import React, { useState, useEffect } from 'react';
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
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import { updateTrip, updateDestinationDates, AuthRequiredError } from '../services';
import DateRangeCalendar from './DateRangeCalendar';
import { DateRangeField, DateRangeSummary } from './DateRangeSheet';
import TravellerStepper from './TravellerStepper';
import { formatDateRange } from '../utils/tripDates';

const WINDOW_HEIGHT = Dimensions.get('window').height;
const MAX_SHEET_HEIGHT = WINDOW_HEIGHT * 0.9;

/**
 * Bottom sheet to edit a trip's name, description, travellers and dates
 * (owners only). Saves itself and reports back via `onSaved`.
 *
 * Dates: on a single-stop trip, the stop is given the same dates so the two
 * never drift apart (the backend recalculates trip dates from its stops). On
 * multi-stop trips dates are managed per stop, so they're shown read-only.
 *
 * @param {boolean} visible
 * @param {object} trip   full trip from GET /Trips/{id} (with destinations)
 * @param {() => void} onClose
 * @param {() => void} onSaved
 */
export default function EditTripSheet({ visible, trip, onClose, onSaved }) {
  const insets = useSafeAreaInsets();
  // On both platforms: Android is drawn edge to edge, so its window isn't
  // resized for the keyboard and the sheet has to make room itself.
  const keyboardHeight = useKeyboardHeight();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [travelers, setTravelers] = useState(1);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [pickingDates, setPickingDates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const stops = [...(trip?.destinations || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const multiStop = stops.length > 1;

  useEffect(() => {
    if (!visible || !trip) return;
    setName(trip.name || '');
    setDescription(trip.description || '');
    setTravelers(Math.max(1, trip.travelersCount || 1));
    setStartDate(trip.startDate || null);
    setEndDate(trip.endDate || null);
    setPickingDates(false);
    setSaving(false);
    setError('');
  }, [visible, trip]);

  const save = async () => {
    setError('');
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your trip a name.');
      return;
    }
    // The backend can change dates but not remove them.
    if (!multiStop && (trip.startDate || trip.endDate) && !startDate) {
      setError("Trip dates can't be removed, but you can change them.");
      return;
    }

    const changes = {
      name: trimmed,
      description: description.trim(),
      travelersCount: travelers,
    };
    const end = endDate || startDate;
    const datesChanged = !multiStop && startDate
      && (startDate !== trip.startDate || end !== trip.endDate);
    if (datesChanged) {
      changes.startDate = startDate;
      changes.endDate = end;
    }

    setSaving(true);
    try {
      await updateTrip(trip.id, changes);
      if (datesChanged && stops[0]) {
        await updateDestinationDates(trip.id, [
          { destinationId: stops[0].id, startDate, endDate: end },
        ]);
      }
      onSaved?.();
    } catch (e) {
      setError(e instanceof AuthRequiredError
        ? 'Sign in again to edit this trip.'
        : (e?.message || 'Could not save. Please try again.'));
      setSaving(false);
    }
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
            pickingDates && { height: MAX_SHEET_HEIGHT },
            { paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_base },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>{pickingDates ? 'Trip dates' : 'Edit trip'}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={pickingDates ? () => setPickingDates(false) : onClose}
              accessibilityLabel={pickingDates ? 'Back' : 'Close'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={pickingDates ? 'chevron-back' : 'close'} size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {pickingDates ? (
            <View style={styles.datesBody}>
              <DateRangeSummary startDate={startDate} endDate={endDate} startLabel="Start" endLabel="End" />
              <Text style={styles.hint}>
                {!startDate ? 'Tap the first day of the trip' : !endDate ? 'Now tap the last day' : ' '}
              </Text>
              <DateRangeCalendar
                startDate={startDate}
                endDate={endDate}
                onChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); }}
              />
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => { setStartDate(trip.startDate || null); setEndDate(trip.endDate || null); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.secondaryButtonText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={() => setPickingDates(false)} activeOpacity={0.9}>
                  <Text style={styles.primaryButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.body}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.label}>Trip name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Summer in Kyoto"
                  placeholderTextColor={COLORS.textMuted}
                  maxLength={100}
                  accessibilityLabel="Trip name"
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Optional"
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  maxLength={500}
                  accessibilityLabel="Description"
                />

                <Text style={styles.label}>Dates</Text>
                {multiStop ? (
                  <View style={styles.readOnlyDates}>
                    <View style={styles.readOnlyRow}>
                      <Ionicons name="calendar" size={20} color={COLORS.accent} />
                      <Text style={styles.readOnlyValue}>
                        {formatDateRange(trip?.startDate, trip?.endDate) || 'Dates not set'}
                      </Text>
                    </View>
                    <View style={styles.readOnlyNote}>
                      <Ionicons name="information-circle" size={20} color={COLORS.primaryLight} />
                      <View style={styles.readOnlyText}>
                        <Text style={styles.readOnlyNoteTitle}>
                          Set by your {stops.length} stops
                        </Text>
                        <Text style={styles.readOnlyHint}>
                          The trip runs from the first stop's start to the last stop's end. To change it, go to
                          {' '}<Text style={styles.readOnlyStrong}>Destinations</Text> on the Overview, tap
                          {' '}<Text style={styles.readOnlyStrong}>⋯</Text> next to a stop and choose
                          {' '}<Text style={styles.readOnlyStrong}>Edit dates</Text>.
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <DateRangeField
                    startDate={startDate}
                    endDate={endDate}
                    startLabel="Start"
                    endLabel="End"
                    onPress={() => { Keyboard.dismiss(); setPickingDates(true); }}
                  />
                )}

                <Text style={styles.label}>Travellers</Text>
                <TravellerStepper value={travelers} onChange={setTravelers} />

                {!!error && <Text style={styles.error}>{error}</Text>}
              </ScrollView>

              <View style={styles.footer}>
                <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.85}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, saving && styles.buttonDisabled]}
                  onPress={save}
                  disabled={saving}
                  activeOpacity={0.9}
                >
                  {saving ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Save changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
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
    marginBottom: SIZES.spacing_sm,
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
  datesBody: {
    flex: 1,
  },
  hint: {
    marginTop: SIZES.spacing_xs,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accentDeep,
  },
  label: {
    marginTop: SIZES.spacing_base,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
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
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  readOnlyDates: {
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
  },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  readOnlyText: {
    flex: 1,
  },
  readOnlyValue: {
    flex: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  // "Set by your 4 stops" + how to change them
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_md,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: '#ECF1F5',
  },
  readOnlyNoteTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  readOnlyHint: {
    marginTop: 4,
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  readOnlyStrong: {
    fontFamily: 'Poppins_600SemiBold',
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
  buttonDisabled: {
    opacity: 0.6,
  },
});
