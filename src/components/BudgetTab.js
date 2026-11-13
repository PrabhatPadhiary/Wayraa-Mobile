import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  setTripBudget,
  getStoredUser,
} from '../services';
import { formatDay, dayCount } from '../utils/tripDates';
import ExpenseSheet, { EXPENSE_CATEGORIES } from './ExpenseSheet';
import { isoToDay, todayDay } from './DateRangeCalendar';
import { BudgetSkeleton } from './skeletons';

const CATEGORY_BY_KEY = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c]));

/** Same currency list as the website. */
const CURRENCIES = ['₹', '$', '€', '£', '¥', 'A$', 'S$', 'AED', 'THB฿'];

/** Symbols that read better with a space before the number ("AED 1,200"). */
function formatMoney(amount, currency) {
  const n = Math.round(Number(amount) || 0).toLocaleString();
  const cur = currency || '₹';
  return /^[A-Z]{2,}/.test(cur) ? `${cur} ${n}` : `${cur}${n}`;
}

function dayHeading(iso) {
  const day = isoToDay(iso);
  const today = todayDay();
  if (day === today) return 'Today';
  if (day === today - 1) return 'Yesterday';
  return formatDay(new Date(iso), true);
}

/**
 * Small sheet for the trip's total budget + currency (owners only).
 */
function BudgetSheet({ visible, totalBudget, currency, onClose, onSave }) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState('₹');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setAmount(totalBudget ? String(Math.round(totalBudget)) : '');
    setCur(currency || '₹');
    setError('');
    setSaving(false);
  }, [visible, totalBudget, currency]);

  const save = async () => {
    const value = Number(amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a budget greater than zero.');
      return;
    }
    setSaving(true);
    try {
      await onSave({ totalBudget: value, currency: cur });
    } catch (e) {
      setError(e?.message || 'Could not save. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Trip budget</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountCurrency}>{cur}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9,]/g, ''))}
              placeholder="0"
              placeholderTextColor={COLORS.border}
              keyboardType="number-pad"
              autoFocus
              maxLength={12}
              accessibilityLabel="Total budget"
            />
          </View>
          <View style={styles.currencyRow}>
            {CURRENCIES.map((c) => {
              const active = c === cur;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.currencyChip, active && styles.currencyChipActive]}
                  onPress={() => setCur(c)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.currencyText, active && styles.currencyTextActive]}>{c}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.sheetFooter}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, saving && { opacity: 0.6 }]}
              onPress={save}
              disabled={saving}
              activeOpacity={0.9}
            >
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryButtonText}>Save budget</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Budget tab of the trip screen: spent vs budget, category breakdown and the
 * expense list. Renders section cards for the trip sheet's grey canvas.
 *
 * @param {object} trip  trip from GET /Trips/{id} (totalBudget, currency, members, ...)
 * @param {boolean} canEdit  owners and editors can add expenses
 * @param {(b: { totalBudget, currency }) => void} onBudgetSaved
 * @param {boolean} [openBudgetSheet]  open the budget sheet on arrival (owners)
 * @param {() => void} [onBudgetSheetOpened]  called once it has been opened
 */
export default function BudgetTab({ trip, canEdit, onBudgetSaved, openBudgetSheet, onBudgetSheetOpened, liveKey = 0 }) {
  const [expenses, setExpenses] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [myUserId, setMyUserId] = useState(null);
  const [sheet, setSheet] = useState(null); // null | { expense: object|null }
  const [budgetOpen, setBudgetOpen] = useState(false);

  const role = (trip.myRole || '').toLowerCase();
  const isOwner = role === 'owner';
  const currency = trip.currency || '₹';
  const budget = trip.totalBudget || 0;
  const members = useMemo(
    () => (trip.members || []).filter((m) => m.userId).map((m) => ({ userId: m.userId, name: m.name })),
    [trip.members]
  );

  const load = useCallback(async () => {
    try {
      const data = await getExpenses(trip.id);
      setExpenses(data);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }, [trip.id]);

  useEffect(() => {
    setStatus('loading');
    load();
    getStoredUser().then((u) => setMyUserId(u?.id || null));
  }, [load]);

  // A friend changed the trip (live update): reload quietly.
  useEffect(() => {
    if (liveKey) load();
  }, [liveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving from the Overview "Set budget" card opens the sheet straight away.
  useEffect(() => {
    if (!openBudgetSheet) return;
    if (isOwner) setBudgetOpen(true);
    onBudgetSheetOpened?.();
  }, [openBudgetSheet, isOwner, onBudgetSheetOpened]);

  // Owners can change any expense; editors only the ones they paid (backend rule).
  const canChange = (expense) => isOwner || (canEdit && !!myUserId && expense.paidByMemberId === myUserId);

  const saveExpense = async (draft) => {
    const editing = sheet?.expense;
    if (editing) {
      const updated = await updateExpense(trip.id, editing.id, draft);
      setExpenses((prev) => prev.map((e) => (e.id === editing.id ? { ...e, ...updated } : e)));
    } else {
      const created = await createExpense(trip.id, draft);
      setExpenses((prev) => [...prev, created]);
    }
    setSheet(null);
  };

  const removeExpense = async () => {
    const editing = sheet?.expense;
    if (!editing) return;
    await deleteExpense(trip.id, editing.id);
    setExpenses((prev) => prev.filter((e) => e.id !== editing.id));
    setSheet(null);
  };

  const saveBudget = async (value) => {
    const res = await setTripBudget(trip.id, value);
    onBudgetSaved?.({ totalBudget: res.totalBudget ?? value.totalBudget, currency: res.currency || value.currency });
    setBudgetOpen(false);
  };

  // ── Numbers ────────────────────────────────────────────────────────────
  const spent = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const ratio = budget > 0 ? spent / budget : 0;
  const left = budget - spent;
  const travellers = Math.max(1, trip.travelersCount || members.length || 1);
  const days = dayCount(trip.startDate, trip.endDate);
  const barColor = ratio >= 1 ? COLORS.error : ratio >= 0.8 ? '#d97706' : '#2e7d32';

  const byCategory = EXPENSE_CATEGORIES
    .map((c) => ({
      ...c,
      total: expenses.filter((e) => (CATEGORY_BY_KEY[e.category] ? e.category : 'other') === c.key)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // Newest day first; within a day, newest first.
  const groups = [];
  [...expenses]
    .sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((e) => {
      const key = isoToDay(e.date);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.items.push(e);
      else groups.push({ key, date: e.date, items: [e] });
    });

  const defaultPayerId = members.some((m) => m.userId === myUserId) ? myUserId : members[0]?.userId || null;

  // Loading: placeholders shaped like the tab, so nothing jumps when it arrives.
  if (status === 'loading') return <BudgetSkeleton />;

  return (
    <View>
      {/* Summary */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <View style={[styles.headerIcon, { backgroundColor: '#fff6e0' }]}>
              <Ionicons name="wallet" size={16} color="#b7791f" />
            </View>
            <Text style={styles.title}>Budget</Text>
          </View>
          {isOwner && (
            <TouchableOpacity
              style={styles.outlineButton}
              onPress={() => setBudgetOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={budget ? 'Edit budget' : 'Set budget'}
            >
              <Ionicons name={budget ? 'create-outline' : 'add'} size={15} color={COLORS.primary} />
              <Text style={styles.outlineButtonText}>{budget ? 'Edit' : 'Set budget'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {status === 'error' ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Couldn't load expenses.</Text>
            <TouchableOpacity onPress={() => { setStatus('loading'); load(); }}>
              <Text style={styles.retryLink}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.spentRow}>
              <Text style={styles.spentValue}>{formatMoney(spent, currency)}</Text>
              <Text style={styles.spentLabel}>
                {budget ? ` spent of ${formatMoney(budget, currency)}` : ' spent'}
              </Text>
            </View>

            {budget > 0 && (
              <>
                <View style={styles.track}>
                  <View
                    style={[styles.fill, { width: `${Math.min(100, Math.round(ratio * 100))}%`, backgroundColor: barColor }]}
                  />
                </View>
                <Text style={[styles.leftText, left < 0 && { color: COLORS.error }]}>
                  {left >= 0
                    ? `${formatMoney(left, currency)} left · ${Math.round(ratio * 100)}% used`
                    : `${formatMoney(-left, currency)} over budget`}
                </Text>
              </>
            )}
            {!budget && (
              <Text style={styles.leftText}>
                {isOwner ? 'Set a budget to track how much is left.' : 'No budget set for this trip yet.'}
              </Text>
            )}

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{formatMoney(spent / travellers, currency)}</Text>
                <Text style={styles.statLabel}>per person</Text>
              </View>
              {!!days && (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatMoney(spent / days, currency)}</Text>
                  <Text style={styles.statLabel}>per day</Text>
                </View>
              )}
              {budget > 0 && !!days && (
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{formatMoney(budget / days, currency)}</Text>
                  <Text style={styles.statLabel}>daily target</Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>

      {/* Breakdown */}
      {status === 'ready' && byCategory.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Where it's going</Text>
          <View style={styles.stack}>
            {byCategory.map((c) => (
              <View key={c.key} style={{ flex: c.total, backgroundColor: c.color }} />
            ))}
          </View>
          {byCategory.map((c) => (
            <View key={c.key} style={styles.breakRow}>
              <View style={[styles.breakIcon, { backgroundColor: c.tint }]}>
                <Ionicons name={c.icon} size={14} color={c.color} />
              </View>
              <Text style={styles.breakLabel}>{c.label}</Text>
              <Text style={styles.breakPct}>{Math.round((c.total / spent) * 100)}%</Text>
              <Text style={styles.breakAmount}>{formatMoney(c.total, currency)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Expenses */}
      {status === 'ready' && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Expenses</Text>
            {canEdit && members.length > 0 && (
              <TouchableOpacity
                style={styles.outlineButton}
                onPress={() => setSheet({ expense: null })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add expense"
              >
                <Ionicons name="add" size={16} color={COLORS.primary} />
                <Text style={styles.outlineButtonText}>Add expense</Text>
              </TouchableOpacity>
            )}
          </View>

          {expenses.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.emptyTitle}>No expenses yet</Text>
              <Text style={styles.emptyText}>
                {canEdit ? 'Log what you spend and see it add up here.' : 'Nothing has been logged for this trip.'}
              </Text>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.key}>
                <Text style={styles.dayHeading}>{dayHeading(g.date)}</Text>
                {g.items.map((e) => {
                  const c = CATEGORY_BY_KEY[e.category] || CATEGORY_BY_KEY.other;
                  const editable = canChange(e);
                  return (
                    <TouchableOpacity
                      key={e.id}
                      style={styles.expenseRow}
                      onPress={() => editable && setSheet({ expense: e })}
                      disabled={!editable}
                      activeOpacity={0.8}
                      accessibilityRole={editable ? 'button' : undefined}
                      accessibilityLabel={`${e.title}, ${formatMoney(e.amount, currency)}, paid by ${e.paidByName}`}
                    >
                      <View style={[styles.expenseIcon, { backgroundColor: c.tint }]}>
                        <Ionicons name={c.icon} size={16} color={c.color} />
                      </View>
                      <View style={styles.expenseText}>
                        <Text style={styles.expenseTitle} numberOfLines={1}>{e.title}</Text>
                        <Text style={styles.expenseMeta} numberOfLines={1}>
                          {[`Paid by ${e.paidByName || 'someone'}`, e.notes].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={styles.expenseAmount}>{formatMoney(e.amount, currency)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
        </View>
      )}

      <ExpenseSheet
        visible={!!sheet}
        expense={sheet?.expense || null}
        currency={currency}
        members={members}
        defaultPayerId={defaultPayerId}
        earliestDate={trip.startDate}
        canDelete={!!sheet?.expense && canChange(sheet.expense)}
        onClose={() => setSheet(null)}
        onSave={saveExpense}
        onDelete={removeExpense}
      />

      <BudgetSheet
        visible={budgetOpen}
        totalBudget={budget}
        currency={currency}
        onClose={() => setBudgetOpen(false)}
        onSave={saveBudget}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the trip screen's section cards.
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
    borderWidth: 1,
    borderColor: '#e9edf1',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  cardTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  outlineButtonText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  loader: {
    marginVertical: SIZES.spacing_lg,
  },
  errorBox: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_md,
  },
  errorText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  retryLink: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },

  spentRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: SIZES.spacing_md,
  },
  spentValue: {
    fontSize: 30,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  spentLabel: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  track: {
    height: 10,
    marginTop: SIZES.spacing_sm,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: COLORS.borderLight,
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  leftText: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_md,
  },
  stat: {
    flex: 1,
    paddingVertical: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_sm,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
    alignItems: 'center',
  },
  statValue: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },

  stack: {
    flexDirection: 'row',
    height: 10,
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
    borderRadius: 5,
    overflow: 'hidden',
    gap: 2,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingVertical: 6,
  },
  breakIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakLabel: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  breakPct: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  breakAmount: {
    minWidth: 80,
    textAlign: 'right',
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: SIZES.spacing_lg,
    gap: 4,
  },
  emptyTitle: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  emptyText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  dayHeading: {
    marginTop: SIZES.spacing_md,
    marginBottom: 2,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_sm,
  },
  expenseIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseText: {
    flex: 1,
  },
  expenseTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  expenseMeta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  expenseAmount: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },

  // Budget sheet
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
  sheetTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: SIZES.spacing_md,
  },
  amountCurrency: {
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
  currencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
    justifyContent: 'center',
  },
  currencyChip: {
    minWidth: 44,
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 7,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencyChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  currencyText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  currencyTextActive: {
    color: COLORS.white,
  },
  error: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
    textAlign: 'center',
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_lg,
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
