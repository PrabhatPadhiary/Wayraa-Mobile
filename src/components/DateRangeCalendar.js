import React, { useMemo, useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/**
 * Scrollable month-by-month range calendar (pure JS, no native module).
 *
 * Tap a day to set the start, tap a later day to set the end. Tapping again
 * after a full range starts a new one; tapping a day before the start moves
 * the start. Dates are whole days in UTC (the backend stores trip dates as
 * UTC midnight), passed in and out as ISO strings.
 *
 * Saturdays and Sundays are marked. The "📅 Month Year ▾" button above
 * opens a month / year picker to jump straight to a month (no scrolling
 * through years to plan far ahead).
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
const SHORT_MONTHS = MONTHS.map((m) => m.slice(0, 3));
const MONTHS_AHEAD = 36; // three years to plan ahead
const isWeekend = (col) => col === 0 || col === 6; // Sunday, Saturday
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
  const gridWidth = cellWidth * 7;
  // Month picker: 4 across, even gaps, spanning the grid.
  const CHIP_GAP = SIZES.spacing_sm;
  const chipWidth = Math.floor((gridWidth - CHIP_GAP * 3 - SIZES.spacing_base * 2) / 4);

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

  // The month at the top of the list (for the jump button), and the picker.
  const listRef = useRef(null);
  const [visibleIndex, setVisibleIndex] = useState(initialIndex);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpYear, setJumpYear] = useState(null);
  const onViewable = useRef(({ viewableItems }) => {
    if (viewableItems?.length) setVisibleIndex(viewableItems[0].index ?? 0);
  }).current;
  const visible = months[visibleIndex] || months[0];
  const years = [...new Set(months.map((m) => m.year))];
  const openJump = () => {
    setJumpYear(visible.year);
    setJumpOpen(true);
  };
  const jumpTo = (year, month) => {
    const idx = months.findIndex((m) => m.year === year && m.month === month);
    if (idx < 0) return;
    setJumpOpen(false);
    setVisibleIndex(idx);
    listRef.current?.scrollToIndex({ index: idx, animated: false });
  };

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
      const weekend = isWeekend(i % 7);
      const isStart = day === start;
      const isEnd = day === end;
      const inRange = start != null && end != null && day > start && day < end;
      const hasRange = start != null && end != null && end > start;
      const isToday = day === today;
      const selected = isStart || isEnd;

      cells.push(
        <TouchableOpacity
          key={i}
          style={[
            { width: cellWidth, height: CELL_HEIGHT, justifyContent: 'center', alignItems: 'center' },
          ]}
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
                weekend && styles.dayTextWeekend,
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
      {/* Month bar, lined up with the grid: tap to choose a month and year. */}
      <View style={[styles.monthBar, { width: gridWidth }]}>
        <TouchableOpacity
          style={styles.monthBarLabel}
          onPress={jumpOpen ? () => setJumpOpen(false) : openJump}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Showing ${MONTHS[visible.month]} ${visible.year}. Choose a month`}
        >
          <Text style={styles.monthBarText}>{MONTHS[visible.month]} {visible.year}</Text>
          <Ionicons name={jumpOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.monthBarButton, jumpOpen && styles.monthBarButtonOn]}
          onPress={jumpOpen ? () => setJumpOpen(false) : openJump}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Choose a month and year"
        >
          <Ionicons name="calendar-outline" size={18} color={jumpOpen ? COLORS.white : COLORS.accentDeep} />
        </TouchableOpacity>
      </View>

      <View style={[styles.weekdays, { width: gridWidth }]}>
        {WEEKDAYS.map((w, i) => (
          <View key={i} style={[styles.weekdayCell, { width: cellWidth }]}>
            <Text style={[styles.weekday, isWeekend(i) && styles.weekdayWeekend]}>{w}</Text>
          </View>
        ))}
      </View>
      <View style={styles.flex}>
      <FlatList
        ref={listRef}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={VIEWABILITY}
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

      {/* Month / year picker over the calendar. */}
      {jumpOpen && (
        <View style={[styles.jumpPanel, { width: gridWidth }]}>
          <View style={styles.yearRow}>
            <TouchableOpacity
              style={styles.yearArrow}
              onPress={() => setJumpYear((y) => Math.max(years[0], y - 1))}
              disabled={jumpYear <= years[0]}
              accessibilityLabel="Previous year"
            >
              <Ionicons name="chevron-back" size={20} color={jumpYear <= years[0] ? COLORS.border : COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.yearText}>{jumpYear}</Text>
            <TouchableOpacity
              style={styles.yearArrow}
              onPress={() => setJumpYear((y) => Math.min(years[years.length - 1], y + 1))}
              disabled={jumpYear >= years[years.length - 1]}
              accessibilityLabel="Next year"
            >
              <Ionicons name="chevron-forward" size={20} color={jumpYear >= years[years.length - 1] ? COLORS.border : COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={[styles.monthGrid, { columnGap: CHIP_GAP, rowGap: CHIP_GAP }]}>
            {SHORT_MONTHS.map((label, m) => {
              const available = months.some((mo) => mo.year === jumpYear && mo.month === m);
              const current = visible.year === jumpYear && visible.month === m;
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.monthChip, { width: chipWidth }, current && styles.monthChipOn, !available && styles.monthChipOff]}
                  onPress={() => jumpTo(jumpYear, m)}
                  disabled={!available}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current, disabled: !available }}
                  accessibilityLabel={`${MONTHS[m]} ${jumpYear}`}
                >
                  <Text style={[styles.monthChipText, current && styles.monthChipTextOn, !available && styles.monthChipTextOff]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      </View>
    </View>
  );
}

const VIEWABILITY = { itemVisiblePercentThreshold: 40 };

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.spacing_sm,
  },
  monthBarLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  monthBarText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  monthBarButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff1e8',
  },
  monthBarButtonOn: {
    backgroundColor: COLORS.accent,
  },
  jumpPanel: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    left: 0,
    padding: SIZES.spacing_base,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 10,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.spacing_base,
  },
  yearArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
  },
  yearText: {
    flex: 1,
    textAlign: 'center',
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthChip: {
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#f6f7f9',
  },
  monthChipOn: {
    backgroundColor: COLORS.accent,
  },
  monthChipOff: {
    backgroundColor: 'transparent',
  },
  monthChipText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  monthChipTextOn: {
    color: COLORS.white,
  },
  monthChipTextOff: {
    color: '#c8c8c8',
  },
  weekdays: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  weekdayCell: {
    paddingVertical: 6,
  },
  weekday: {
    textAlign: 'center',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  weekdayWeekend: {
    color: COLORS.accentDeep,
    fontFamily: 'Poppins_700Bold',
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
  // Saturdays and Sundays (in range / selected / past styles still win).
  dayTextWeekend: {
    color: COLORS.accentDeep,
    fontFamily: 'Poppins_600SemiBold',
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
