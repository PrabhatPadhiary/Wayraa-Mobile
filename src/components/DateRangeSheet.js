import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import { formatDay } from '../utils/tripDates';
import DateRangeCalendar, { nightsBetween } from './DateRangeCalendar';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.82;

function dayLabel(iso) {
  return iso ? formatDay(new Date(iso), true) : null;
}

/**
 * "Arrive → Leave · N days · N-1 nights" summary of a date range. Used at the top of the
 * calendar and as the tappable field that opens it.
 */
/** "9 days · 8 nights" (or "Day trip · 1 day") for a range; nothing until both dates are set. */
export function TripLengthPill({ startDate, endDate, style }) {
  const nights = nightsBetween(startDate, endDate);
  if (nights == null) return null;
  return (
    <View style={[styles.nightsPill, style]}>
      <Text style={styles.nightsText}>
        {nights === 0
          ? 'Day trip · 1 day'
          : `${nights + 1} days · ${nights} ${nights === 1 ? 'night' : 'nights'}`}
      </Text>
    </View>
  );
}

export function DateRangeSummary({ startDate, endDate, startLabel = 'Arrive', endLabel = 'Leave', showLength = true }) {
  return (
    <View style={styles.summaryWrap}>
    {/* Arrive → Leave on one line; the length on its own line under it. */}
    <View style={styles.summary}>
      <View style={styles.summaryHalf}>
        <Text style={styles.summaryLabel}>{startLabel}</Text>
        <Text style={[styles.summaryValue, !startDate && styles.summaryPlaceholder]} numberOfLines={1}>
          {dayLabel(startDate) || 'Add date'}
        </Text>
      </View>
      <Ionicons name="arrow-forward" size={16} color={COLORS.textMuted} />
      <View style={[styles.summaryHalf, styles.summaryHalfEnd]}>
        <Text style={styles.summaryLabel}>{endLabel}</Text>
        <Text style={[styles.summaryValue, !endDate && styles.summaryPlaceholder]} numberOfLines={1}>
          {dayLabel(endDate) || 'Add date'}
        </Text>
      </View>
    </View>
      {showLength && <TripLengthPill startDate={startDate} endDate={endDate} />}
    </View>
  );
}

/**
 * Tappable field showing the chosen range; opens the calendar sheet. The
 * trip's length sits under the field, outside the box.
 */
export function DateRangeField({ startDate, endDate, onPress, startLabel, endLabel }) {
  return (
    <View>
    <TouchableOpacity
      style={styles.field}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Dates: ${dayLabel(startDate) || 'not set'} to ${dayLabel(endDate) || 'not set'}. Tap to change.`}
    >
      <Ionicons name="calendar" size={18} color={COLORS.accent} />
      <View style={styles.fieldBody}>
        <DateRangeSummary startDate={startDate} endDate={endDate} startLabel={startLabel} endLabel={endLabel} showLength={false} />
      </View>
    </TouchableOpacity>
    <TripLengthPill startDate={startDate} endDate={endDate} />
    </View>
  );
}

/**
 * Bottom sheet with a range calendar. Changes stay local until "Apply".
 *
 * @param {boolean} visible
 * @param {string} [title]
 * @param {string|null} startDate  ISO
 * @param {string|null} endDate    ISO
 * @param {string|null} [minDate]  ISO
 * @param {() => void} onClose
 * @param {(range: { startDate: string|null, endDate: string|null }) => void} onApply
 */
export default function DateRangeSheet({
  visible,
  title = 'Select dates',
  startDate,
  endDate,
  minDate,
  onClose,
  onApply,
}) {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState({ startDate: null, endDate: null });

  useEffect(() => {
    if (visible) setRange({ startDate: startDate || null, endDate: endDate || null });
  }, [visible, startDate, endDate]);

  const hint = !range.startDate
    ? 'Tap your arrival day'
    : !range.endDate
      ? 'Now tap your departure day'
      : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { height: SHEET_HEIGHT, paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <DateRangeSummary startDate={range.startDate} endDate={range.endDate} />
          <Text style={styles.hint}>{hint || ' '}</Text>

          <DateRangeCalendar
            startDate={range.startDate}
            endDate={range.endDate}
            minDate={minDate}
            onChange={setRange}
          />

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setRange({ startDate: null, endDate: null })}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => onApply(range)}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Summary
  summaryWrap: {
    alignSelf: 'stretch',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  summaryHalf: {
    flex: 1,
  },
  summaryHalfEnd: {
    alignItems: 'flex-start',
  },
  summaryLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  summaryPlaceholder: {
    color: COLORS.textMuted,
    fontFamily: 'Poppins_500Medium',
  },
  nightsPill: {
    alignSelf: 'flex-start',
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  nightsText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },

  // Field
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  fieldBody: {
    flex: 1,
  },

  // Sheet
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
  hint: {
    marginTop: SIZES.spacing_xs,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.accentDeep,
  },
  footer: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    paddingTop: SIZES.spacing_md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
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
});
