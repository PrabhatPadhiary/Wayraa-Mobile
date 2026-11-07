import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions } from 'react-native';
import { COLORS, SIZES } from '../constants';

/**
 * Scrollable month-by-month range calendar (pure JS, no native module).
 *
 * Tap a day to set the start, tap a later day to set the end. Tapping again
 * after a full range starts a new one; tapping a day before the start moves
 * the start. Dates are whole days in UTC (the backend stores trip dates as
 * UTC midnight), passed in and out as ISO strings.
 *
 * @param {string|null} startDate  ISO
 * @param {string|null} endDate    ISO
 * @param {(range: { startDate: string|null, endDate: string|null }) => void} onChange
 * @param {string|null} [minDate]  ISO; earlier days are disabled. Defaults to today.
 * @param {number} [horizontalPadding] padding of the parent, to size the grid
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_AHEAD = 18;
const CELL_HEIGHT = 44;
const MONTH_TITLE_HEIGHT = 44;
// Every month is drawn with 6 week rows so all items share one height,
// which lets the list jump straight to the selected month.
const MONTH_HEIGHT = MONTH_TITLE_HEIGHT + CELL_HEIGHT * 6 + SIZES.spacing_md;

/** Whole-day number (days since epoch) of an ISO date, read in UTC. */
export function isoToDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

/** ISO string (UTC midnight) of a whole-day number. */
export function dayToIso(day) {
  return day == null ? null : new Date(day * DAY_MS).toISOString();
}

/** Today's calendar date on the device, as a whole-day number. */
export function todayDay() {
  const now = new Date();
  return Math.round(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS);
}

/** Nights between two ISO dates, or null. */
export function nightsBetween(startIso, endIso) {
  const s = isoToDay(startIso);
  const e = isoToDay(endIso);
  return s == null || e == null ? null : e - s;
}

function monthKey(year, month) {
  return `${year}-${month}`;
}

export default function DateRangeCalendar({
  startDate,
  endDate,
  onChange,
  minDate,
  horizontalPadding = SIZES.spacing_lg,
}) {
  const start = isoToDay(startDate);
  const end = isoToDay(endDate);
  const today = todayDay();
  // Never disable a day that is already selected (e.g. editing a past trip).
  const minDay = Math.min(minDate ? isoToDay(minDate) : today, start ?? Infinity);

  const cellWidth = Math.floor((Dimensions.get('window').width - horizontalPadding * 2) / 7);

  const months = useMemo(() => {
    const first = new Date(minDay * DAY_MS);
    const list = [];
    for (let i = 0; i < MONTHS_AHEAD; i += 1) {
      const y = first.getUTCFullYear() + Math.floor((first.getUTCMonth() + i) / 12);
      const m = (first.getUTCMonth() + i) % 12;
      list.push({ key: monthKey(y, m), year: y, month: m });
    }
    return list;
  }, [minDay]);

  // Open on the month of the start date (or the first month).
  const initialIndex = useMemo(() => {
    if (start == null) return 0;
    const d = new Date(start * DAY_MS);
    const idx = months.findIndex((mo) => mo.key === monthKey(d.getUTCFullYear(), d.getUTCMonth()));
    return Math.max(0, idx);
    // Only on mount: later taps shouldn't jump the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  const pick = useCallback((day) => {
    if (start == null || end != null || day < start) {
      onChange({ startDate: dayToIso(day), endDate: null });
    } else {
      onChange({ startDate: dayToIso(start), endDate: dayToIso(day) });
    }
  }, [start, end, onChange]);

  const renderMonth = ({ item }) => {
    const firstDay = Math.round(Date.UTC(item.year, item.month, 1) / DAY_MS);
    const daysInMonth = new Date(Date.UTC(item.year, item.month + 1, 0)).getUTCDate();
    const lead = new Date(firstDay * DAY_MS).getUTCDay();

    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const dateNum = i - lead + 1;
      if (dateNum < 1 || dateNum > daysInMonth) {
        cells.push(<View key={i} style={{ width: cellWidth, height: CELL_HEIGHT }} />);
        continue;
      }
      const day = firstDay + dateNum - 1;
      const disabled = day < minDay;
      const isStart = day === start;
      const isEnd = day === end;
      const inRange = start != null && end != null && day > start && day < end;
      const hasRange = start != null && end != null && end > start;
      const isToday = day === today;
      const selected = isStart || isEnd;

      cells.push(
        <TouchableOpacity
          key={i}
          style={{ width: cellWidth, height: CELL_HEIGHT, justifyContent: 'center', alignItems: 'center' }}
          onPress={() => pick(day)}
          disabled={disabled}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected, disabled }}
          accessibilityLabel={`${dateNum} ${MONTHS[item.month]} ${item.year}${isStart ? ', start' : ''}${isEnd ? ', end' : ''}`}
        >
          {/* Range band: full width in the middle, half width on the start/end days. */}
          {(inRange || (hasRange && (isStart || isEnd))) && (
            <View
              style={[
                styles.band,
                isStart && styles.bandStart,
                isEnd && styles.bandEnd,
              ]}
            />
          )}
          <View style={[styles.dayCircle, selected && styles.dayCircleSelected]}>
            <Text
              style={[
                styles.dayText,
                disabled && styles.dayTextDisabled,
                inRange && styles.dayTextInRange,
                selected && styles.dayTextSelected,
              ]}
            >
              {dateNum}
            </Text>
            {isToday && !selected && <View style={styles.todayDot} />}
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <View style={{ height: MONTH_HEIGHT }}>
        <Text style={styles.monthTitle}>{MONTHS[item.month]} {item.year}</Text>
        <View style={styles.grid}>{cells}</View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.weekdays}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[styles.weekday, { width: cellWidth }]}>{w}</Text>
        ))}
      </View>
      <FlatList
        data={months}
        keyExtractor={(m) => m.key}
        renderItem={renderMonth}
        extraData={`${start}-${end}`}
        getItemLayout={(_, index) => ({ length: MONTH_HEIGHT, offset: MONTH_HEIGHT * index, index })}
        initialScrollIndex={initialIndex}
        initialNumToRender={3}
        windowSize={5}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekdays: {
    flexDirection: 'row',
    paddingBottom: SIZES.spacing_sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  weekday: {
    textAlign: 'center',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  monthTitle: {
    height: MONTH_TITLE_HEIGHT,
    lineHeight: MONTH_TITLE_HEIGHT,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  band: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    right: 0,
    backgroundColor: '#ffe6d5',
  },
  bandStart: {
    left: '50%',
  },
  bandEnd: {
    right: '50%',
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircleSelected: {
    backgroundColor: COLORS.accent,
  },
  dayText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  dayTextDisabled: {
    color: '#c8c8c8',
  },
  dayTextInRange: {
    color: COLORS.accentDeep,
  },
  dayTextSelected: {
    color: COLORS.white,
    fontFamily: 'Poppins_700Bold',
  },
  todayDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
});
