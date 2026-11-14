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
  Platform,
  Keyboard,
  InputAccessoryView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import { formatDay } from '../utils/tripDates';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import DateRangeCalendar, { todayDay, dayToIso, isoToDay } from './DateRangeCalendar';
import { showAlert, AppDialogHost } from './AppDialog';

const WINDOW_HEIGHT = Dimensions.get('window').height;
const MAX_SHEET_HEIGHT = WINDOW_HEIGHT * 0.9;
// iOS number pads have no return key; this bar adds a "Done" above them.
const KEYBOARD_ACCESSORY_ID = 'expense-sheet-keyboard';

/** Backend expense categories. */
export const EXPENSE_CATEGORIES = [
  { key: 'stay', label: 'Stay', icon: 'bed', color: '#6089B0', tint: '#EEF3F7' },
  { key: 'food', label: 'Food', icon: 'restaurant', color: '#D33F2F', tint: '#FBEFEE' },
  { key: 'activity', label: 'Activity', icon: 'ticket', color: '#36835D', tint: '#E8F5EE' },
  { key: 'transport', label: 'Transport', icon: 'car', color: '#6F95B8', tint: '#F0F4F8' },
  { key: 'other', label: 'Other', icon: 'pricetag', color: '#6B7980', tint: '#EFF1F2' },
];

function dateLabel(iso) {
  const day = isoToDay(iso);
  const today = todayDay();
  if (day === today) return 'Today';
  if (day === today - 1) return 'Yesterday';
  return formatDay(new Date(iso), true);
}

/** Parse "1,250.50" style input into a positive number, or null. */
function parseAmount(text) {
  const n = Number(String(text).replace(/,/g, '').trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * Bottom sheet to add or edit an expense.
 *
 * @param {boolean} visible
 * @param {object|null} expense  existing expense to edit, or null to add
 * @param {string} currency      symbol shown before the amount
 * @param {Array<{ userId, name }>} members  who can be the payer
 * @param {string|null} defaultPayerId
 * @param {string|null} [defaultDate]  ISO; defaults to today
 * @param {string|null} [earliestDate] ISO; the calendar starts a month before
 *   this or today, whichever is earlier (e.g. the trip's start date)
 * @param {boolean} [canDelete]
 * @param {() => void} onClose
 * @param {(expense) => Promise<void>} onSave   may throw; message shown inline
 * @param {() => Promise<void>} [onDelete]
 */
export default function ExpenseSheet({
  visible,
  expense,
  currency,
  members,
  defaultPayerId,
  defaultDate,
  earliestDate,
  canDelete,
  onClose,
  onSave,
  onDelete,
}) {
  const insets = useSafeAreaInsets();
  // iOS only: Android already resizes the modal window for the keyboard.
  // On both platforms: Android is drawn edge to edge, so its window isn't
  // resized for the keyboard and the sheet has to make room itself.
  const keyboardHeight = useKeyboardHeight();
  const isEdit = !!expense;
  // With the keyboard up, the sheet sits on top of it and only uses the space
  // that's left (its body scrolls), so the header never goes off screen.
  const sheetMaxHeight = keyboardHeight
    ? WINDOW_HEIGHT - keyboardHeight - insets.top - SIZES.spacing_sm
    : MAX_SHEET_HEIGHT;
  // The calendar lists 18 months from this day, so keep it close to the trip.
  const calendarMin = dayToIso(
    Math.min(isoToDay(earliestDate) ?? todayDay(), isoToDay(expense?.date) ?? todayDay(), todayDay()) - 31
  );

  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('food');
  const [date, setDate] = useState(dayToIso(todayDay()));
  const [payerId, setPayerId] = useState('');
  const [notes, setNotes] = useState('');
  const [pickingDate, setPickingDate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const amountRef = useRef(null);

  // Focus the amount once when a new expense sheet opens. Not `autoFocus`:
  // the form remounts after the date picker, and autoFocus would pop the
  // number pad open again every time.
  useEffect(() => {
    if (!visible || expense) return undefined;
    const timer = setTimeout(() => amountRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [visible, expense]);

  useEffect(() => {
    if (!visible) return;
    setError('');
    setSaving(false);
    setPickingDate(false);
    if (expense) {
      setAmount(String(expense.amount ?? ''));
      setTitle(expense.title || '');
      setCategory(expense.category || 'other');
      setDate(expense.date || dayToIso(todayDay()));
      setPayerId(expense.paidByMemberId || '');
      setNotes(expense.notes || '');
    } else {
      setAmount('');
      setTitle('');
      setCategory('food');
      setDate(defaultDate || dayToIso(todayDay()));
      setPayerId(defaultPayerId || members[0]?.userId || '');
      setNotes('');
    }
  }, [visible, expense, defaultPayerId, defaultDate, members]);

  const save = async () => {
    setError('');
    const value = parseAmount(amount);
    if (!value) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!title.trim()) {
      setError('Add a short description, e.g. "Dinner at Gion".');
      return;
    }
    const payer = members.find((m) => m.userId === payerId);
    if (!payer) {
      setError('Choose who paid.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        amount: value,
        category,
        date,
        paidByMemberId: payer.userId,
        paidByName: payer.name || 'Traveller',
        notes: notes.trim() || null,
      });
    } catch (e) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    showAlert('Delete expense?', `"${expense?.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await onDelete();
          } catch (e) {
            setError(e?.message || 'Could not delete. Please try again.');
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { maxHeight: sheetMaxHeight, marginBottom: keyboardHeight },
            pickingDate && { height: MAX_SHEET_HEIGHT },
            { paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_base },
          ]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>
              {pickingDate ? 'Pick a date' : isEdit ? 'Edit expense' : 'Add expense'}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={pickingDate ? () => setPickingDate(false) : onClose}
              accessibilityLabel={pickingDate ? 'Back' : 'Close'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name={pickingDate ? 'chevron-back' : 'close'} size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {pickingDate ? (
            // Single-day pick: any tap sets the date and returns to the form.
            <View style={styles.calendarWrap}>
              <DateRangeCalendar
                startDate={date}
                endDate={null}
                minDate={calendarMin}
                onChange={(r) => {
                  // With only a start passed in, a later tap comes back as the
                  // range end and an earlier tap as a new start.
                  const picked = r.endDate || r.startDate;
                  if (picked) setDate(picked);
                  setPickingDate(false);
                }}
              />
            </View>
          ) : (
            <ScrollView
              style={styles.body}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              {/* Amount */}
              <View style={styles.amountRow}>
                <Text style={styles.currency}>{currency}</Text>
                <TextInput
                  ref={amountRef}
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ''))}
                  placeholder="0"
                  placeholderTextColor={COLORS.border}
                  keyboardType="decimal-pad"
                  maxLength={12}
                  inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
                  accessibilityLabel="Amount"
                />
              </View>

              {/* Title */}
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="What was it for?"
                placeholderTextColor={COLORS.textMuted}
                maxLength={120}
                accessibilityLabel="Description"
              />

              {/* Category */}
              <Text style={styles.label}>Category</Text>
              <View style={styles.chipWrap}>
                {EXPENSE_CATEGORIES.map((c) => {
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
                      <Ionicons name={c.icon} size={14} color={active ? COLORS.white : c.color} />
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Date + payer */}
              <Text style={styles.label}>Date</Text>
              <TouchableOpacity
                style={styles.dateField}
                onPress={() => { Keyboard.dismiss(); setPickingDate(true); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Date: ${dateLabel(date)}. Tap to change.`}
              >
                <Ionicons name="calendar" size={16} color={COLORS.accent} />
                <Text style={styles.dateText}>{dateLabel(date)}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </TouchableOpacity>

              {members.length > 0 && (
                <>
                  <Text style={styles.label}>Paid by</Text>
                  <View style={styles.chipWrap}>
                    {members.map((m) => {
                      const active = m.userId === payerId;
                      return (
                        <TouchableOpacity
                          key={m.userId}
                          style={[styles.chip, active && styles.payerActive]}
                          onPress={() => setPayerId(m.userId)}
                          activeOpacity={0.85}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                            {m.name || 'Traveller'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Notes */}
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.notes]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional"
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxLength={500}
                inputAccessoryViewID={KEYBOARD_ACCESSORY_ID}
                accessibilityLabel="Notes"
              />

              {!!error && <Text style={styles.error}>{error}</Text>}
            </ScrollView>
          )}

          {!pickingDate && (
            <View style={styles.footer}>
              {isEdit && canDelete && !!onDelete ? (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={confirmDelete}
                  disabled={saving}
                  activeOpacity={0.85}
                  accessibilityLabel="Delete expense"
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
                  <Text style={styles.primaryButtonText}>{isEdit ? 'Save changes' : 'Add expense'}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={KEYBOARD_ACCESSORY_ID}>
          <View style={styles.accessory}>
            <TouchableOpacity onPress={Keyboard.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.accessoryDone}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
      {/* Alerts from this sheet open inside its modal (see AppDialog). */}
      <AppDialogHost />
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
  accessory: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: SIZES.spacing_lg,
    paddingVertical: SIZES.spacing_sm,
    backgroundColor: '#F1F3F4',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  accessoryDone: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  calendarWrap: {
    flex: 1,
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SIZES.spacing_md,
  },
  currency: {
    fontSize: 30,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },
  amountInput: {
    minWidth: 80,
    fontSize: 40,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
    textAlign: 'center',
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
    backgroundColor: COLORS.white,
  },
  notes: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  label: {
    marginTop: SIZES.spacing_base,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
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
    maxWidth: '100%',
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
  },
  payerActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateText: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
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
    backgroundColor: '#FCF4F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
