import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { formatMoney, groupDigits, formatAmountInput } from '../utils/money';
import { avatarColorFor, initialsFor } from '../utils/avatars';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

/**
 * Splitting an expense, for groups of any size.
 *
 *  - SplitSummary: one short row in the expense sheet ("Equally between 8 of
 *    10 · ₹400 each" with a few faces). The same height for 3 people or 30.
 *  - SplitEditor: the full list, opened from that row. Equally (tick people
 *    in or out), By amount or By %, a search box for big groups, "Split the
 *    rest evenly", and the running total pinned at the bottom with Done.
 *
 * Values are text as typed (userId -> "1,250.50"); an empty box means that
 * person isn't part of it.
 */

export const SPLIT_MODES = [
  { key: 'equal', label: 'Equally' },
  { key: 'amount', label: 'By amount' },
  { key: 'percent', label: 'By %' },
];
const SEARCH_FROM = 8; // people: show a search box from this many

/** "1,250.50" → 1250.5; empty or junk → 0. */
export function splitNumber(text) {
  const n = Number(String(text ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Even parts for the people given, to the cent (or to 0.01%), the leftover
 * going to the first ones: switching mode starts from an even split.
 */
export function evenParts(total, ids) {
  if (!ids.length || !(total > 0)) return {};
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / ids.length);
  let extra = cents - base * ids.length;
  const out = {};
  ids.forEach((id) => {
    out[id] = (base + (extra-- > 0 ? 1 : 0)) / 100;
  });
  return out;
}

/** What's left to give out: { left, ok } for the amount or percent mode. */
export function splitRemainder(mode, total, values, ids) {
  const sum = ids.reduce((s, id) => s + splitNumber(values[id]), 0);
  const target = mode === 'percent' ? 100 : total || 0;
  const left = Math.round((target - sum) * 100) / 100;
  return { left, ok: target > 0 && Math.abs(left) < 0.01 && sum > 0 };
}

/** Who's in the split right now. */
function includedIds(mode, members, splitWith, values) {
  const ids = members.map((m) => m.userId);
  return mode === 'equal'
    ? ids.filter((id) => splitWith.includes(id))
    : ids.filter((id) => splitNumber(values[id]) > 0);
}

/** The line under the list / on the summary: { text, tone: ok | warn | error | muted }. */
function splitStatus({ mode, members, total, currency, splitWith, values }) {
  const ids = members.map((m) => m.userId);
  if (mode === 'equal') {
    const n = includedIds(mode, members, splitWith, values).length;
    if (!n) return { text: 'Pick at least one person', tone: 'warn' };
    if (!(total > 0)) return { text: `${n} ${n === 1 ? 'person' : 'people'}`, tone: 'muted' };
    return {
      text: `${currency}${groupDigits(String(Math.round((total / n) * 100) / 100), currency)} each`,
      tone: 'muted',
    };
  }
  if (mode === 'amount' && !(total > 0)) return { text: 'Enter the total first', tone: 'muted' };
  const { left, ok } = splitRemainder(mode, total, values, ids);
  if (ok) return { text: 'Adds up', tone: 'ok' };
  const fmt = (n) => (mode === 'percent' ? `${groupDigits(String(n))}%` : formatMoney(n, currency));
  return left > 0
    ? { text: `${fmt(left)} left to assign`, tone: 'warn' }
    : { text: `${fmt(-left)} over`, tone: 'error' };
}

const TONE_COLOR = { ok: '#327956', warn: '#B7421F', error: COLORS.error, muted: COLORS.textMuted };

function Avatar({ member, size = 28, style }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColorFor(member?.name) },
        style,
      ]}
    >
      {member?.photoUrl ? (
        <Image
          source={{ uri: cloudinarySized(member.photoUrl, IMAGE_WIDTH.AVATAR) }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
        />
      ) : (
        <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>{initialsFor(member?.name)}</Text>
      )}
    </View>
  );
}

/** The one-row summary in the expense sheet; tap to open the editor. */
export function SplitSummary({ members, currency, total, mode, splitWith, values, onPress }) {
  const ids = includedIds(mode, members, splitWith, values);
  const people = members.filter((m) => ids.includes(m.userId));
  const status = splitStatus({ mode, members, total, currency, splitWith, values });
  const title = mode === 'equal'
    ? (ids.length === members.length ? `Equally between everyone (${members.length})` : `Equally between ${ids.length} of ${members.length}`)
    : `${mode === 'percent' ? 'By %' : 'By amount'} · ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`;
  const shown = people.slice(0, 4);

  return (
    <TouchableOpacity
      style={styles.summary}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Split: ${title}, ${status.text}. Change`}
    >
      <View style={styles.summaryText}>
        <Text style={styles.summaryTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.summaryBottom}>
          {shown.length > 0 && (
            <View style={styles.faces}>
              {shown.map((m, i) => (
                <Avatar key={m.userId} member={m} size={24} style={i > 0 && styles.faceOverlap} />
              ))}
              {people.length > shown.length && (
                <View style={[styles.avatar, styles.faceMore, styles.faceOverlap]}>
                  <Text style={styles.faceMoreText}>+{people.length - shown.length}</Text>
                </View>
              )}
            </View>
          )}
          <View style={styles.summaryStatus}>
            {status.tone === 'ok' && <Ionicons name="checkmark-circle" size={14} color={TONE_COLOR.ok} />}
            <Text style={[styles.summaryStatusText, { color: TONE_COLOR[status.tone] }]} numberOfLines={1}>
              {status.text}
            </Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

/**
 * The full split, filling the expense sheet. Edits a draft: Done hands it
 * back ({ mode, splitWith, values }); leaving another way drops it.
 */
export default function SplitEditor({
  members,
  currency,
  total,
  mode: startMode,
  splitWith: startWith,
  values: startValues,
  onDone,
  inputAccessoryViewID,
}) {
  const ids = members.map((m) => m.userId);
  const [mode, setMode] = useState(startMode);
  const [splitWith, setSplitWith] = useState(startWith);
  const [values, setValues] = useState(startValues);
  const [query, setQuery] = useState('');
  // Amount / %: people with a share first. Worked out when the list opens
  // or the mode changes, not while typing (rows mustn't jump under you).
  const [orderKey, setOrderKey] = useState(0);
  const scrollRef = useRef(null);
  const scrollY = useRef(0);
  const inputs = useRef({});

  const order = useMemo(() => {
    if (mode === 'equal') return members;
    const has = (m) => splitNumber(values[m.userId]) > 0;
    return [...members.filter(has), ...members.filter((m) => !has(m))];
  }, [mode, orderKey, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const rows = q ? order.filter((m) => (m.name || '').toLowerCase().includes(q)) : order;
  const included = includedIds(mode, members, splitWith, values);
  const allIn = included.length === ids.length;
  const status = splitStatus({ mode, members, total, currency, splitWith, values });
  const canFinish = mode === 'equal' ? included.length > 0 : status.tone === 'ok';

  // A new mode starts from an even split between whoever's in it now.
  const changeMode = (next) => {
    if (next === mode) return;
    const people = included.length ? included : ids;
    if (next === 'equal') {
      setSplitWith(people);
    } else {
      const parts = evenParts(next === 'percent' ? 100 : total || 0, people);
      setValues(Object.fromEntries(Object.entries(parts).map(([id, v]) => [id, groupDigits(String(v), currency)])));
    }
    setMode(next);
    setOrderKey((k) => k + 1);
  };

  // Whatever's left, shared evenly between the people with nothing yet.
  const { left } = mode === 'equal' ? { left: 0 } : splitRemainder(mode, total, values, ids);
  const empties = ids.filter((id) => !(splitNumber(values[id]) > 0));
  const canSpreadRest = mode !== 'equal' && left > 0 && empties.length > 0;
  const spreadRest = () => {
    const parts = evenParts(left, empties);
    setValues((prev) => ({
      ...prev,
      ...Object.fromEntries(Object.entries(parts).map(([id, v]) => [id, groupDigits(String(v), currency)])),
    }));
  };

  // A box was tapped: keep it above the keyboard.
  const keepInView = (userId) => {
    const scroll = scrollRef.current;
    const input = inputs.current[userId];
    if (!scroll || !input) return;
    setTimeout(() => {
      scroll.measureInWindow((sx, sy, sw, sh) => {
        input.measureInWindow((ix, iy, iw, ih) => {
          const keyboardTop = Keyboard.metrics()?.screenY;
          const bottom = keyboardTop ? Math.min(sy + sh, keyboardTop) : sy + sh;
          const overflow = iy + ih + SIZES.spacing_md - bottom;
          if (overflow > 0) scroll.scrollTo({ y: scrollY.current + overflow, animated: true });
        });
      });
    }, 300);
  };

  return (
    <View style={styles.editor}>
      {/* Mode */}
      <View style={styles.segment} accessibilityRole="tablist">
        {SPLIT_MODES.map((m) => {
          const on = m.key === mode;
          return (
            <TouchableOpacity
              key={m.key}
              style={[styles.segmentItem, on && styles.segmentItemOn]}
              onPress={() => changeMode(m.key)}
              activeOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {members.length >= SEARCH_FROM && (
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search name"
            placeholderTextColor={COLORS.textMuted}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search people"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>
          {mode === 'equal' ? `${included.length} of ${members.length} sharing` : `${included.length} with a share`}
        </Text>
        {mode === 'equal' ? (
          <TouchableOpacity
            onPress={() => setSplitWith(allIn ? [] : ids)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.link}>{allIn ? 'Clear' : 'Select everyone'}</Text>
          </TouchableOpacity>
        ) : canSpreadRest ? (
          <TouchableOpacity onPress={spreadRest} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Split the rest evenly</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        {rows.length === 0 && <Text style={styles.noMatch}>No one called "{query.trim()}"</Text>}
        {rows.map((m) => {
          if (mode === 'equal') {
            const on = splitWith.includes(m.userId);
            return (
              <TouchableOpacity
                key={m.userId}
                style={styles.row}
                onPress={() => setSplitWith(on ? splitWith.filter((id) => id !== m.userId) : [...splitWith, m.userId])}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={m.name || 'Traveller'}
              >
                <Avatar member={m} />
                <Text style={styles.rowName} numberOfLines={1}>{m.name || 'Traveller'}</Text>
                <View style={[styles.tick, on && styles.tickOn]}>
                  {on && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
                </View>
              </TouchableOpacity>
            );
          }
          const raw = values[m.userId] ?? '';
          const asMoney = mode === 'percent' && total > 0 && splitNumber(raw) > 0
            ? formatMoney((total * splitNumber(raw)) / 100, currency)
            : null;
          return (
            <View key={m.userId} style={styles.row}>
              <Avatar member={m} />
              <View style={styles.rowText}>
                <Text style={styles.rowName} numberOfLines={1}>{m.name || 'Traveller'}</Text>
                {!!asMoney && <Text style={styles.rowSub}>{asMoney}</Text>}
              </View>
              <View style={styles.box}>
                {mode === 'amount' && <Text style={styles.boxAffix}>{currency}</Text>}
                <TextInput
                  ref={(r) => { inputs.current[m.userId] = r; }}
                  style={styles.boxInput}
                  value={raw}
                  onChangeText={(t) => setValues((prev) => ({ ...prev, [m.userId]: formatAmountInput(t, currency, true) }))}
                  onFocus={() => keepInView(m.userId)}
                  placeholder="0"
                  placeholderTextColor={COLORS.border}
                  keyboardType="decimal-pad"
                  maxLength={mode === 'percent' ? 6 : 14}
                  selectTextOnFocus
                  inputAccessoryViewID={inputAccessoryViewID}
                  accessibilityLabel={`${m.name || 'Traveller'}'s ${mode === 'percent' ? 'percent' : 'amount'}`}
                />
                {mode === 'percent' && <Text style={styles.boxAffix}>%</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Pinned: where it stands, and Done once it adds up. */}
      <View style={styles.footer}>
        <View style={styles.footerStatus} accessibilityLiveRegion="polite">
          {status.tone === 'ok' && <Ionicons name="checkmark-circle" size={16} color={TONE_COLOR.ok} />}
          <Text style={[styles.footerStatusText, { color: TONE_COLOR[status.tone] }]} numberOfLines={2}>
            {status.text}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.doneButton, !canFinish && styles.doneButtonOff]}
          onPress={() => canFinish && onDone({ mode, splitWith, values })}
          disabled={!canFinish}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canFinish }}
        >
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Summary row (expense sheet)
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryText: {
    flex: 1,
    gap: 6,
  },
  summaryTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  summaryBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  summaryStatus: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryStatusText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceOverlap: {
    marginLeft: -8,
  },
  faceMore: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.cardBackground,
  },
  faceMoreText: {
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.white,
    overflow: 'hidden',
  },
  avatarText: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },

  // Editor (fills the sheet)
  editor: {
    flex: 1,
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: SIZES.radius_full,
  },
  segmentItemOn: {
    backgroundColor: COLORS.white,
    shadowColor: '#2B3F51',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  segmentText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  segmentTextOn: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_xs,
  },
  listHeaderText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  link: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  list: {
    flex: 1,
  },
  noMatch: {
    paddingVertical: SIZES.spacing_lg,
    textAlign: 'center',
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    minHeight: 48,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  rowSub: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tickOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    width: 120,
    paddingHorizontal: SIZES.spacing_sm,
    borderRadius: 10,
    backgroundColor: COLORS.cardBackground,
  },
  boxAffix: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  boxInput: {
    flex: 1,
    paddingVertical: 7,
    textAlign: 'right',
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingTop: SIZES.spacing_md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  footerStatus: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  footerStatusText: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
  },
  doneButton: {
    minHeight: 46,
    paddingHorizontal: SIZES.spacing_xl || 28,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneButtonOff: {
    opacity: 0.4,
  },
  doneText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
