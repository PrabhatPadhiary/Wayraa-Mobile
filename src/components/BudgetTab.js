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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ArrivalGlow, useLiveArrivals } from './Motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import { formatMoney, groupDigits, formatAmountInput } from '../utils/money';
import {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  setTripBudget,
  getStoredUser,
  peekExpenses,
  getBalances,
  peekBalances,
  settleUp,
  deleteSettlement,
} from '../services';
import { showAlert } from './AppDialog';
import { setCache, CacheKeys } from '../services/cache';
import { formatDay, dayCount } from '../utils/tripDates';
import ExpenseSheet, { EXPENSE_CATEGORIES } from './ExpenseSheet';
import { isoToDay, todayDay } from './DateRangeCalendar';
import { BudgetSkeleton } from './skeletons';
import { useOnReconnect } from '../hooks/useNetwork';

const firstName = (name) => (name || 'Traveller').trim().split(/\s+/)[0];

const CATEGORY_BY_KEY = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.key, c]));

/** Same currency list as the website. */
const CURRENCIES = ['₹', '$', '€', '£', '¥', 'A$', 'S$', 'AED', 'THB฿'];


function dayHeading(iso) {
  const day = isoToDay(iso);
  const today = todayDay();
  if (day === today) return 'Today';
  if (day === today - 1) return 'Yesterday';
  return formatDay(new Date(iso), true);
}

/**
 * Small sheet for the trip's total budget + currency (owners and editors).
 */
function BudgetSheet({ visible, totalBudget, currency, onClose, onSave }) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState('');
  const [cur, setCur] = useState('₹');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setAmount(totalBudget ? groupDigits(Math.round(totalBudget), currency || '₹') : '');
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
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Trip budget</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountCurrency}>{cur}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(formatAmountInput(t, cur))}
              placeholder="0"
              placeholderTextColor={COLORS.border}
              keyboardType="number-pad"
              autoFocus
              maxLength={16}
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
                  onPress={() => {
                    setCur(c);
                    // Rupees group 1,00,000; others 100,000.
                    setAmount((a) => formatAmountInput(a, c));
                  }}
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
  // As last loaded for this trip, at once (switching tabs is instant); the
  // fresh copy loads behind it.
  const [expenses, setExpenses] = useState(() => peekExpenses(trip.id) || []);
  // Expenses a friend just added (live): they glow once.
  const freshExpenses = useLiveArrivals(expenses, liveKey);
  const [status, setStatus] = useState(() => (peekExpenses(trip.id) ? 'ready' : 'loading')); // loading | ready | error
  // What you see is what the next visit starts from (your own edits too).
  useEffect(() => {
    if (status === 'ready') setCache(CacheKeys.expenses(trip.id), expenses);
  }, [status, expenses, trip.id]);
  const [myUserId, setMyUserId] = useState(null);
  // Who owes whom (from the server, so every screen agrees). Null until loaded.
  const [balances, setBalances] = useState(() => peekBalances(trip.id) || null);
  useEffect(() => {
    if (balances) setCache(CacheKeys.balances(trip.id), balances);
  }, [balances, trip.id]);
  const [sheet, setSheet] = useState(null); // null | { expense: object|null }
  const [budgetOpen, setBudgetOpen] = useState(false);

  const role = (trip.myRole || '').toLowerCase();
  const isOwner = role === 'owner';
  const currency = trip.currency || '₹';
  const budget = trip.totalBudget || 0;
  const members = useMemo(
    () => (trip.members || []).filter((m) => m.userId).map((m) => ({ userId: m.userId, name: m.name, photoUrl: m.photoUrl })),
    [trip.members]
  );

  // Quietly: when it can't load, the saved copy (or nothing) stays.
  const loadBalances = useCallback(async () => {
    try {
      setBalances(await getBalances(trip.id));
    } catch {}
  }, [trip.id]);

  const load = useCallback(async () => {
    loadBalances();
    try {
      const data = await getExpenses(trip.id);
      setExpenses(data);
      setStatus('ready');
    } catch (e) {
      // Offline or the server didn't answer: keep showing the saved copy if
      // there is one; only show the error when there's nothing to show.
      setStatus(peekExpenses(trip.id) ? 'ready' : 'error');
    }
  }, [trip.id, loadBalances]);
  // Back online: reload what may have failed.
  useOnReconnect(load);

  useEffect(() => {
    if (!peekExpenses(trip.id)) setStatus('loading');
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
    if (canEdit) setBudgetOpen(true);
    onBudgetSheetOpened?.();
  }, [openBudgetSheet, canEdit, onBudgetSheetOpened]);

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
    loadBalances();
  };

  const removeExpense = async () => {
    const editing = sheet?.expense;
    if (!editing) return;
    await deleteExpense(trip.id, editing.id);
    setExpenses((prev) => prev.filter((e) => e.id !== editing.id));
    setSheet(null);
    loadBalances();
  };

  // ── Settling up ────────────────────────────────────────────────────────
  const people = balances?.people || [];
  const personName = (id) =>
    id === myUserId ? 'You' : firstName(people.find((p) => p.userId === id)?.name || members.find((m) => m.userId === id)?.name);
  // Either person in a payment can mark it paid; the owner can mark any.
  const canSettle = (t) => isOwner || t.fromUserId === myUserId || t.toUserId === myUserId;

  const confirmSettle = (t) => {
    const from = personName(t.fromUserId);
    const to = personName(t.toUserId);
    showAlert(
      'Mark as paid?',
      `${from} paid ${to === 'You' ? 'you' : to} ${formatMoney(t.amount, currency)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark paid',
          onPress: async () => {
            try {
              setBalances(await settleUp(trip.id, t));
            } catch (e) {
              showAlert("Couldn't save that", e?.message || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const confirmUndoSettlement = (s) => {
    showAlert(
      'Undo this repayment?',
      `${personName(s.fromUserId)} paid ${personName(s.toUserId)} ${formatMoney(s.amount, currency)}. Removing it puts the amount back in the balances.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Undo',
          style: 'destructive',
          onPress: async () => {
            try {
              setBalances(await deleteSettlement(trip.id, s.id));
            } catch (e) {
              showAlert("Couldn't undo that", e?.message || 'Please try again.');
            }
          },
        },
      ]
    );
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
  // Split trips: what's yours, not the average.
  const isGroup = members.length > 1 || people.length > 1;
  const me = people.find((p) => p.userId === myUserId);
  const myShareOf = (e) => {
    // The server's figure when it sends one (amount and percent splits).
    if (Array.isArray(e.shares)) return Number(e.shares.find((x) => x.userId === myUserId)?.amount) || 0;
    const split = e.splitWith?.length ? e.splitWith : members.map((m) => m.userId);
    return split.includes(myUserId) ? (Number(e.amount) || 0) / split.length : 0;
  };
  // How many people share it ("split 8 ways").
  const splitCount = (e) => (Array.isArray(e.shares)
    ? e.shares.filter((x) => Number(x.amount) > 0).length
    : (e.splitWith?.length || members.length));
  const myShare = expenses.reduce((sum, e) => sum + myShareOf(e), 0);
  const barColor = ratio >= 1 ? COLORS.error : ratio >= 0.8 ? '#C94016' : '#327956';

  const byCategory = EXPENSE_CATEGORIES
    .map((c) => ({
      ...c,
      total: expenses.filter((e) => (CATEGORY_BY_KEY[e.category] ? e.category : 'other') === c.key)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  // Newest day first; within a day, newest first. Repayments sit among the
  // expenses on the day they were made.
  const groups = [];
  [...expenses, ...(balances?.settlements || []).map((s) => ({ ...s, isSettlement: true }))]
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
      {/* Budget: the plan. Its own card, so a trip with no budget doesn't
          look like it has one. Viewers see it only once one is set. */}
      {(budget > 0 || canEdit) && (
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <View style={[styles.headerIcon, { backgroundColor: '#FCE9E3' }]}>
                <Ionicons name="wallet" size={16} color="#B7421F" />
              </View>
              <Text style={styles.title}>Trip budget</Text>
            </View>
            {canEdit && (
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

          {budget > 0 ? (
            <>
              <View style={styles.spentRow}>
                <Text style={styles.spentValue}>{formatMoney(budget, currency)}</Text>
                {!!days && (
                  <Text style={styles.spentLabel}>{` · ${formatMoney(budget / days, currency)} a day`}</Text>
                )}
              </View>
              {status === 'ready' && (
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
            </>
          ) : (
            <Text style={styles.budgetEmpty}>Set a budget to see how much is left as you spend.</Text>
          )}
        </View>
      )}

      {/* Spent: what's actually gone out. */}
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <View style={[styles.headerIcon, { backgroundColor: '#EEF3F7' }]}>
            <Ionicons name="receipt" size={15} color="#6089B0" />
          </View>
          <Text style={styles.title}>Spent</Text>
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
              <Text style={styles.spentLabel}> in total</Text>
            </View>

            {spent > 0 && (
              <View style={styles.statsRow}>
                {isGroup && me ? (
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{formatMoney(myShare, currency)}</Text>
                    <Text style={styles.statLabel}>your share</Text>
                  </View>
                ) : (
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{formatMoney(spent / travellers, currency)}</Text>
                    <Text style={styles.statLabel}>per person</Text>
                  </View>
                )}
                {!!days && (
                  <View style={styles.stat}>
                    <Text style={styles.statValue}>{formatMoney(spent / days, currency)}</Text>
                    <Text style={styles.statLabel}>per day</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </View>

      {/* Balances: who owes whom. Only on trips with more than one person. */}
      {status === 'ready' && isGroup && balances && (expenses.length > 0 || balances.settlements?.length > 0) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Balances</Text>
          {me && (
            <Text
              style={[
                styles.myBalance,
                me.net >= 0.5 && { color: '#327956' },
                me.net <= -0.5 && { color: '#C94016' },
              ]}
            >
              {me.net >= 0.5
                ? `You're owed ${formatMoney(me.net, currency)}`
                : me.net <= -0.5
                  ? `You owe ${formatMoney(-me.net, currency)}`
                  : "You're all settled up"}
            </Text>
          )}
          {balances.transfers.length === 0 ? (
            <View style={styles.settledRow}>
              <Ionicons name="checkmark-circle" size={16} color="#327956" />
              <Text style={styles.settledText}>Everyone's square. Nothing to pay back.</Text>
            </View>
          ) : (
            balances.transfers.map((t) => {
              const from = personName(t.fromUserId);
              const to = personName(t.toUserId);
              return (
                <View key={`${t.fromUserId}-${t.toUserId}`} style={styles.transferRow}>
                  <Text style={styles.transferText} numberOfLines={2}>
                    <Text style={styles.transferName}>{from}</Text>
                    {from === 'You' ? ' pay ' : ' pays '}
                    <Text style={styles.transferName}>{to === 'You' ? 'you' : to}</Text>
                  </Text>
                  <Text style={styles.transferAmount}>{formatMoney(t.amount, currency)}</Text>
                  {canSettle(t) && (
                    <TouchableOpacity
                      style={styles.settleButton}
                      onPress={() => confirmSettle(t)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${formatMoney(t.amount, currency)} from ${from} to ${to} as paid`}
                    >
                      <Text style={styles.settleButtonText}>Settle</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

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
                  if (e.isSettlement) {
                    const undoable = isOwner || [e.createdByUserId, e.fromUserId, e.toUserId].includes(myUserId);
                    const from = personName(e.fromUserId);
                    const to = personName(e.toUserId);
                    return (
                      <TouchableOpacity
                        key={e.id}
                        style={styles.expenseRow}
                        onPress={() => undoable && confirmUndoSettlement(e)}
                        disabled={!undoable}
                        activeOpacity={0.8}
                        accessibilityLabel={`${from} paid ${to} ${formatMoney(e.amount, currency)}`}
                      >
                        <View style={[styles.expenseIcon, { backgroundColor: '#E8F5EE' }]}>
                          <Ionicons name="swap-horizontal" size={16} color="#327956" />
                        </View>
                        <View style={styles.expenseText}>
                          <Text style={styles.expenseTitle} numberOfLines={1}>
                            {from} paid {to === 'You' ? 'you' : to}
                          </Text>
                          <Text style={styles.expenseMeta}>Paid back</Text>
                        </View>
                        <Text style={[styles.expenseAmount, styles.settlementAmount]}>
                          {formatMoney(e.amount, currency)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
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
                      <ArrivalGlow active={freshExpenses.has(e.id)} radius={12} style={styles.expenseGlow} />
                      <View style={[styles.expenseIcon, { backgroundColor: c.tint }]}>
                        <Ionicons name={c.icon} size={16} color={c.color} />
                      </View>
                      <View style={styles.expenseText}>
                        <Text style={styles.expenseTitle} numberOfLines={1}>{e.title}</Text>
                        <Text style={styles.expenseMeta} numberOfLines={1}>
                          {[
                            e.paidByMemberId === myUserId ? 'Paid by you' : `Paid by ${e.paidByName || 'someone'}`,
                            isGroup && splitCount(e) > 1 ? `split ${splitCount(e)} ways` : null,
                            isGroup && myShareOf(e) > 0 ? `your share ${formatMoney(myShareOf(e), currency)}` : null,
                            e.notes,
                          ].filter(Boolean).join(' · ')}
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
    borderColor: '#E9EDF1',
    shadowColor: '#2B3F51',
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
  budgetEmpty: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
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
  myBalance: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  settledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_xs,
    marginTop: SIZES.spacing_sm,
  },
  settledText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginTop: SIZES.spacing_xs,
  },
  transferText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  transferName: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  transferAmount: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  settleButton: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.primary,
  },
  settleButtonText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  settlementAmount: {
    color: COLORS.textMuted,
    fontFamily: 'Poppins_600SemiBold',
  },
  // The "just added by a friend" wash, a little wider than the row.
  expenseGlow: {
    left: -8,
    right: -8,
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
