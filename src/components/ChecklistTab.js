import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import {
  getChecklist,
  createChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  AuthRequiredError,
} from '../services';
import { formatDay } from '../utils/tripDates';
import { showAlert } from './AppDialog';
import { ChecklistSkeleton } from './skeletons';

/** Backend categories, with the website's colors. */
export const CHECKLIST_CATEGORIES = [
  { key: 'packing', label: 'Packing', icon: 'briefcase', color: '#2563eb', tint: '#e8effd' },
  { key: 'bookings', label: 'Bookings', icon: 'calendar', color: '#7c3aed', tint: '#f1ebfd' },
  { key: 'documents', label: 'Documents', icon: 'document-text', color: '#0891b2', tint: '#e3f5f9' },
  { key: 'money', label: 'Money', icon: 'cash', color: '#d97706', tint: '#fdf3e3' },
  { key: 'safety', label: 'Safety', icon: 'medkit', color: '#dc2626', tint: '#fdecec' },
  { key: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#6b7280', tint: '#eff0f2' },
];
const CATEGORY_BY_KEY = Object.fromEntries(CHECKLIST_CATEGORIES.map((c) => [c.key, c]));

/** One-tap starters shown while the checklist is empty. */
const SUGGESTIONS = [
  { title: 'Passport', category: 'documents' },
  { title: 'Travel insurance', category: 'documents' },
  { title: 'Book stays', category: 'bookings' },
  { title: 'Book flights', category: 'bookings' },
  { title: 'Phone charger', category: 'packing' },
  { title: 'Local currency', category: 'money' },
  { title: 'First-aid kit', category: 'safety' },
];

function errorMessage(e) {
  if (e instanceof AuthRequiredError) return 'Sign in to edit this trip.';
  return e?.message || 'Something went wrong. Please try again.';
}

/**
 * Checklist tab of the trip screen: progress, quick add, and items grouped by
 * category with tap-to-tick. Renders section cards that sit on the trip
 * sheet's grey canvas (it is not itself scrollable).
 *
 * @param {string} tripId
 * @param {boolean} canEdit  owners and editors; viewers only see the list
 */
export default function ChecklistTab({ tripId, canEdit, liveKey = 0 }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('packing');
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(() => new Set()); // item ids mid-request
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await getChecklist(tripId);
      setItems(data);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
    }
  }, [tripId]);

  useEffect(() => {
    setStatus('loading');
    load();
  }, [load]);

  // A friend changed the trip (live update): reload quietly.
  useEffect(() => {
    if (liveKey) load();
  }, [liveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const markPending = (id, on) => setPending((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const addItem = async (itemTitle = title, itemCategory = category) => {
    const text = (itemTitle || '').trim();
    if (!text || adding) return;
    setAdding(true);
    try {
      const created = await createChecklistItem(tripId, {
        title: text,
        category: itemCategory,
        order: items.length,
      });
      setItems((prev) => [...prev, created]);
      if (itemTitle === title) setTitle('');
    } catch (e) {
      showAlert('Could not add item', errorMessage(e));
    } finally {
      setAdding(false);
    }
  };

  // Optimistic: flip immediately, then take the server's version.
  const toggle = async (item) => {
    if (!canEdit || pending.has(item.id)) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isCompleted: !i.isCompleted } : i)));
    markPending(item.id, true);
    try {
      const updated = await toggleChecklistItem(tripId, item.id);
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...updated } : i)));
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isCompleted: item.isCompleted } : i)));
      showAlert('Could not update item', errorMessage(e));
    } finally {
      markPending(item.id, false);
    }
  };

  const confirmDelete = (item) => {
    showAlert('Delete item?', `"${item.title}" will be removed from the checklist.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          markPending(item.id, true);
          try {
            await deleteChecklistItem(tripId, item.id);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
          } catch (e) {
            showAlert('Could not delete item', errorMessage(e));
          } finally {
            markPending(item.id, false);
          }
        },
      },
    ]);
  };

  // Loading: placeholders shaped like the tab, so nothing jumps when it arrives.
  if (status === 'loading') return <ChecklistSkeleton />;

  if (status === 'error') {
    return (
      <View style={[styles.card, styles.center]}>
        <Ionicons name="cloud-offline-outline" size={32} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>Couldn't load the checklist</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => { setStatus('loading'); load(); }}
          activeOpacity={0.9}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const total = items.length;
  const done = items.filter((i) => i.isCompleted).length;
  const progress = total ? done / total : 0;
  const existingTitles = new Set(items.map((i) => i.title.trim().toLowerCase()));
  const suggestions = SUGGESTIONS.filter((s) => !existingTitles.has(s.title.toLowerCase()));

  const groups = CHECKLIST_CATEGORIES
    .map((c) => ({
      ...c,
      // Open items first, ticked ones sink to the bottom.
      items: items
        .filter((i) => (CATEGORY_BY_KEY[i.category] ? i.category : 'other') === c.key)
        .sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <View>
      {/* Progress + add */}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <View style={[styles.headerIcon, { backgroundColor: '#e8f5e9' }]}>
              <Ionicons name="checkbox" size={16} color="#2e7d32" />
            </View>
            <Text style={styles.title}>Checklist</Text>
          </View>
          {total > 0 && <Text style={styles.count}>{done}/{total}</Text>}
        </View>

        {total > 0 && (
          <>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {done === total
                ? "All done. You're ready to go."
                : `${total - done} ${total - done === 1 ? 'thing' : 'things'} left to sort`}
            </Text>
          </>
        )}

        {canEdit && (
          <>
            <View style={styles.inputRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Add an item…"
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="done"
                onSubmitEditing={() => addItem()}
                maxLength={200}
                accessibilityLabel="New checklist item"
              />
              <TouchableOpacity
                style={[styles.addButton, (!title.trim() || adding) && styles.addButtonDisabled]}
                onPress={() => addItem()}
                disabled={!title.trim() || adding}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add item"
              >
                {adding ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <Ionicons name="add" size={22} color={COLORS.white} />
                )}
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              keyboardShouldPersistTaps="handled"
            >
              {CHECKLIST_CATEGORIES.map((c) => {
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
                    <Ionicons name={c.icon} size={13} color={active ? COLORS.white : c.color} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {total === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing on the list yet</Text>
            <Text style={styles.emptyText}>
              {canEdit ? 'Add your own, or start with a few essentials:' : 'Nothing has been added to this checklist.'}
            </Text>
          </View>
        )}

        {canEdit && total < 4 && suggestions.length > 0 && (
          <View style={styles.suggestions}>
            {suggestions.map((s) => {
              const c = CATEGORY_BY_KEY[s.category];
              return (
                <TouchableOpacity
                  key={s.title}
                  style={[styles.suggestion, { backgroundColor: c.tint }]}
                  onPress={() => addItem(s.title, s.category)}
                  disabled={adding}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${s.title}`}
                >
                  <Ionicons name="add" size={14} color={c.color} />
                  <Text style={[styles.suggestionText, { color: c.color }]}>{s.title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* One card per category */}
      {groups.map((g) => {
        const groupDone = g.items.filter((i) => i.isCompleted).length;
        return (
          <View key={g.key} style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.titleRow}>
                <View style={[styles.headerIcon, { backgroundColor: g.tint }]}>
                  <Ionicons name={g.icon} size={15} color={g.color} />
                </View>
                <Text style={styles.groupTitle}>{g.label}</Text>
              </View>
              <Text style={styles.count}>{groupDone}/{g.items.length}</Text>
            </View>

            {g.items.map((item, index) => {
              const busy = pending.has(item.id);
              const meta = [
                item.dueDate ? `Due ${formatDay(new Date(item.dueDate), false)}` : null,
                item.assignedToName ? item.assignedToName : null,
              ].filter(Boolean).join(' · ');
              return (
                <View
                  key={item.id}
                  style={[styles.itemRow, index < g.items.length - 1 && styles.itemDivider]}
                >
                  <TouchableOpacity
                    style={styles.itemMain}
                    onPress={() => toggle(item)}
                    disabled={!canEdit}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.isCompleted, disabled: !canEdit }}
                    accessibilityLabel={item.title}
                  >
                    <View
                      style={[
                        styles.check,
                        { borderColor: g.color },
                        item.isCompleted && { backgroundColor: g.color },
                      ]}
                    >
                      {item.isCompleted && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
                    </View>
                    <View style={styles.itemText}>
                      <Text
                        style={[styles.itemTitle, item.isCompleted && styles.itemTitleDone]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>
                      {!!meta && <Text style={styles.itemMeta} numberOfLines={1}>{meta}</Text>}
                    </View>
                  </TouchableOpacity>
                  {canEdit && (
                    busy ? (
                      <ActivityIndicator size="small" color={COLORS.textMuted} style={styles.itemAction} />
                    ) : (
                      <TouchableOpacity
                        style={styles.itemAction}
                        onPress={() => confirmDelete(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`Delete ${item.title}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="close" size={18} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    )
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
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
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SIZES.spacing_xl,
    gap: SIZES.spacing_sm,
  },
  stateTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  retryButton: {
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_xl,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  retryText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
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
    flexShrink: 1,
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
  groupTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  count: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textMuted,
  },

  progressTrack: {
    height: 8,
    marginTop: SIZES.spacing_md,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: COLORS.borderLight,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#2e7d32',
  },
  progressText: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_base,
  },
  input: {
    flex: 1,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.accentDeep,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.45,
  },
  chipRow: {
    gap: SIZES.spacing_sm,
    paddingTop: SIZES.spacing_md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
  },

  empty: {
    marginTop: SIZES.spacing_base,
  },
  emptyTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  emptyText: {
    marginTop: 2,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_md,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
  },
  suggestionText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
  },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingVertical: SIZES.spacing_md,
  },
  itemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  itemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  itemTitleDone: {
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  itemMeta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  itemAction: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
