import React, { useState, useEffect, useRef } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import { searchPlaces, getPlaceDetails } from '../services';
import DateRangeCalendar from './DateRangeCalendar';
import { DateRangeSummary } from './DateRangeSheet';
import { isoToDay } from '../utils/itinerary';
import { formatDateRange } from '../utils/tripDates';

/**
 * Other stops these dates overlap by more than a travel day. Sharing a single
 * day where one stay ends and the other starts (leave Kyoto, arrive in Osaka
 * on the 12th) is normal and not reported.
 */
function overlappingStops(startDate, endDate, otherStops) {
  const s = isoToDay(startDate);
  const e = isoToDay(endDate) ?? s;
  if (s == null) return [];
  return otherStops.filter((o) => {
    const os = isoToDay(o.startDate);
    const oe = isoToDay(o.endDate) ?? os;
    if (os == null) return false;
    const shared = Math.min(e, oe) - Math.max(s, os) + 1;
    if (shared <= 0) return false;
    const travelDay = shared === 1 && (s === oe || e === os);
    return !travelDay;
  });
}

const MAX_SHEET_HEIGHT = Dimensions.get('window').height * 0.88;
// The dates step holds a scrolling calendar, so the sheet gets a fixed height.
const DATES_SHEET_HEIGHT = Dimensions.get('window').height * 0.86;
const SEARCH_DELAY_MS = 300;

/**
 * Bottom sheet for adding a stop to a trip, or editing a stop's dates.
 *
 * Add mode: search a city/place -> pick it -> optional dates on a range
 * calendar -> confirm.
 * Edit mode (`editing` set): the destination is fixed, only the dates change.
 *
 * The parent does the API call in `onSubmit`, which may throw; the error
 * message is shown inline and the sheet stays open.
 *
 * @param {boolean} visible
 * @param {{ id, name, startDate, endDate }} [editing]  destination being edited
 * @param {string[]} [existingPlaceIds]  googlePlaceIds already in the trip
 * @param {string|null} [suggestedStart]  prefill for the start date (add mode)
 * @param {Array} [otherStops]  the trip's other stops, to note overlapping dates
 * @param {() => void} onClose
 * @param {(result: { destination?: object, startDate: string|null, endDate: string|null }) => Promise<void>} onSubmit
 *   `destination` (add mode only): { googlePlaceId, name, latitude, longitude, photoUrl }
 */
export default function DestinationSheet({
  visible,
  editing,
  existingPlaceIds = [],
  suggestedStart = null,
  otherStops = [],
  onClose,
  onSubmit,
}) {
  const insets = useSafeAreaInsets();
  const isEdit = !!editing;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null); // search result chosen
  // ISO strings (UTC midnight) or null.
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Latest query text, so slow responses for an older query are ignored.
  const latestQuery = useRef('');

  // Reset every time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setResults([]);
    setSearching(false);
    setPicked(null);
    setError('');
    setSubmitting(false);
    latestQuery.current = '';
    if (editing) {
      setStartDate(editing.startDate || null);
      setEndDate(editing.endDate || null);
    } else {
      setStartDate(suggestedStart || null);
      setEndDate(null);
    }
  }, [visible, editing, suggestedStart]);

  // Debounced search.
  useEffect(() => {
    if (!visible || isEdit || picked) return undefined;
    const text = query.trim();
    latestQuery.current = text;
    if (text.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchPlaces(text);
      if (latestQuery.current !== text) return;
      setResults(Array.isArray(found) ? found : []);
      setSearching(false);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, visible, isEdit, picked]);

  const alreadyInTrip = (result) => existingPlaceIds.includes(result.placeId);

  const submit = async () => {
    setError('');

    const startIso = startDate || null;
    const endIso = endDate || null;

    setSubmitting(true);
    try {
      if (isEdit) {
        await onSubmit({ startDate: startIso, endDate: endIso });
      } else {
        // Coordinates and a photo come from the place details.
        const details = await getPlaceDetails(picked.placeId);
        const geo = details?.geometry;
        await onSubmit({
          destination: {
            googlePlaceId: picked.placeId,
            name: picked.name || details?.name || picked.description,
            latitude: geo?.latitude ?? geo?.location?.lat ?? null,
            longitude: geo?.longitude ?? geo?.location?.lng ?? null,
            photoUrl: details?.photoUrl || null,
          },
          startDate: startIso,
          endDate: endIso,
        });
      }
    } catch (e) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderSearch = () => (
    <>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search a city or place"
          placeholderTextColor={COLORS.textMuted}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search destinations"
        />
        {searching && <ActivityIndicator size="small" color={COLORS.accent} />}
      </View>

      {query.trim().length >= 2 && !searching && results.length === 0 && (
        <Text style={styles.hint}>No matches. Try another spelling.</Text>
      )}

      {results.map((r) => {
        const taken = alreadyInTrip(r);
        return (
          <TouchableOpacity
            key={r.placeId}
            style={[styles.resultRow, taken && styles.resultRowDisabled]}
            onPress={() => { setPicked(r); setError(''); }}
            disabled={taken}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${r.name}${taken ? ', already in this trip' : ''}`}
          >
            <View style={styles.resultIcon}>
              <Ionicons name="location" size={16} color={COLORS.accent} />
            </View>
            <View style={styles.resultText}>
              <Text style={styles.resultName} numberOfLines={1}>{r.name || r.description}</Text>
              {!!r.secondary && <Text style={styles.resultSub} numberOfLines={1}>{r.secondary}</Text>}
            </View>
            {taken && <Text style={styles.takenText}>Added</Text>}
          </TouchableOpacity>
        );
      })}
    </>
  );

  const renderDates = () => (
    <>
      {isEdit ? (
        <View style={styles.pickedCard}>
          <Ionicons name="location" size={18} color={COLORS.accent} />
          <Text style={styles.pickedName} numberOfLines={1}>{editing.name}</Text>
        </View>
      ) : (
        <View style={styles.pickedCard}>
          <Ionicons name="location" size={18} color={COLORS.accent} />
          <View style={styles.resultText}>
            <Text style={styles.pickedName} numberOfLines={1}>{picked.name || picked.description}</Text>
            {!!picked.secondary && <Text style={styles.resultSub} numberOfLines={1}>{picked.secondary}</Text>}
          </View>
          <TouchableOpacity
            onPress={() => setPicked(null)}
            accessibilityRole="button"
            accessibilityLabel="Change destination"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.datesSummary}>
        <DateRangeSummary startDate={startDate} endDate={endDate} />
      </View>
      <Text style={styles.hint}>
        {!startDate
          ? 'Optional. Tap your arrival day, or skip and add dates later.'
          : !endDate
            ? 'Now tap your departure day.'
            : 'The trip\'s dates update to cover every stop.'}
      </Text>
      {/* A gentle note, never a block: overlaps are often day or side trips. */}
      {(() => {
        const overlaps = overlappingStops(startDate, endDate, otherStops);
        if (!overlaps.length) return null;
        const names = overlaps
          .map((o) => `${o.name}${formatDateRange(o.startDate, o.endDate) ? ` (${formatDateRange(o.startDate, o.endDate)})` : ''}`)
          .join(', ');
        return (
          <View style={styles.overlapNote} accessibilityRole="text">
            <Ionicons name="information-circle-outline" size={16} color="#8a5a00" />
            <Text style={styles.overlapText}>
              Overlaps {names}. That's fine for a day trip or a side trip.
            </Text>
          </View>
        );
      })()}
      <DateRangeCalendar
        startDate={startDate}
        endDate={endDate}
        onChange={(r) => { setStartDate(r.startDate); setEndDate(r.endDate); setError(''); }}
      />
    </>
  );

  const showDates = isEdit || !!picked;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior="padding"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            showDates && { height: DATES_SHEET_HEIGHT },
            { paddingBottom: insets.bottom + SIZES.spacing_base },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>{isEdit ? 'Edit dates' : 'Add a destination'}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {showDates ? (
            <View style={styles.datesBody}>
              {renderDates()}
              {!!error && <Text style={styles.error}>{error}</Text>}
            </View>
          ) : (
            <ScrollView
              style={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {renderSearch()}
              {!!error && <Text style={styles.error}>{error}</Text>}
            </ScrollView>
          )}

          {showDates && (
            <View style={styles.footer}>
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, submitting && styles.buttonDisabled]}
                onPress={submit}
                disabled={submitting}
                activeOpacity={0.9}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <Text style={styles.primaryButtonText}>{isEdit ? 'Save dates' : 'Add to trip'}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: MAX_SHEET_HEIGHT,
    minHeight: 320,
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
    marginBottom: SIZES.spacing_md,
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
  },

  // Search
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBackground,
    marginBottom: SIZES.spacing_sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: SIZES.spacing_md,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  resultRowDisabled: {
    opacity: 0.5,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff1e8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultText: {
    flex: 1,
  },
  resultName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  resultSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  takenText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },

  // Picked + dates
  pickedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: '#fff1e8',
  },
  pickedName: {
    flexShrink: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  changeText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  datesBody: {
    flex: 1,
  },
  datesSummary: {
    marginTop: SIZES.spacing_base,
  },
  overlapNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: '#fff8e6',
  },
  overlapText: {
    flex: 1,
    fontSize: SIZES.sm,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
    color: '#6b4a00',
  },
  hint: {
    marginTop: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  error: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_lg,
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: SIZES.spacing_base,
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
