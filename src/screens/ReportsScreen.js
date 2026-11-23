import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { ScreenHeader } from '../components';
import { getOpenReports, removeReported, dismissReports, suspendUser, REPORT_REASONS } from '../services';
import { showAlert } from '../components/AppDialog';
import { RowListSkeleton } from '../components/skeletons';
import { timeAgo } from '../components/JournalCard';

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]));

/**
 * Reports to review (moderators only, from Settings or a "New report" push):
 * every reported story and comment, with Remove or Dismiss.
 */
export default function ReportsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const load = useCallback(async () => {
    try {
      setError('');
      setItems(await getOpenReports());
    } catch (e) {
      setError(e?.message || 'Couldn\'t load reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const keyOf = (item) => `${item.kind}:${item.targetId}`;

  const act = async (item, action) => {
    setBusyKey(keyOf(item));
    try {
      if (action === 'remove' || action === 'suspend') await removeReported(item.kind, item.targetId);
      else await dismissReports(item.kind, item.targetId);
      setItems((prev) => prev.filter((i) => keyOf(i) !== keyOf(item)));
      if (action === 'suspend') {
        await suspendUser(item.authorId);
        // Their other reports are moot now: their content is hidden from everyone.
        setItems((prev) => prev.filter((i) => i.authorId !== item.authorId));
        showAlert('Account suspended', `${item.authorName || 'They'} can't use Wayraa signed in any more, and their stories and comments are hidden.`);
      }
    } catch (e) {
      showAlert('Couldn\'t do that', e?.message || 'Please try again.');
    } finally {
      setBusyKey(null);
    }
  };

  const confirmRemove = (item) => {
    const what = item.kind === 'story' ? 'story' : 'comment';
    showAlert(
      `Remove this ${what}?`,
      item.kind === 'story'
        ? 'The story, its photos, likes and comments are deleted for everyone. This can\'t be undone.'
        : 'The comment and its replies are deleted for everyone. This can\'t be undone.',
      [
        { text: 'Remove', style: 'destructive', icon: 'trash-outline', onPress: () => act(item, 'remove') },
        {
          text: `Remove and suspend ${item.authorName || 'author'}`,
          style: 'destructive',
          icon: 'ban-outline',
          onPress: () => act(item, 'suspend'),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { sheet: true },
    );
  };

  const openStory = (item) => {
    // Same stack (Home's), so back comes here.
    navigation.navigate('JournalDetail', {
      journalId: item.journalId,
      title: item.journalTitle,
      focusComments: item.kind === 'comment',
    });
  };

  const renderItem = ({ item }) => {
    const busy = busyKey === keyOf(item);
    const reasons = (item.reasons || []).map((r) => REASON_LABEL[r] || r).join(' · ');
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={[styles.kind, item.kind === 'story' ? styles.kindStory : styles.kindComment]}>
            <Text style={styles.kindText}>{item.kind === 'story' ? 'Story' : 'Comment'}</Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {item.reports} {item.reports === 1 ? 'report' : 'reports'} · {timeAgo(item.lastReportedAt)}
          </Text>
        </View>
        <Text style={styles.reasons}>{reasons}</Text>

        <TouchableOpacity onPress={() => openStory(item)} activeOpacity={0.7} accessibilityRole="link">
          <Text style={styles.by} numberOfLines={1}>
            {item.kind === 'story' ? 'By' : 'Comment by'} {item.authorName || 'a traveller'}
            {item.kind === 'comment' && item.journalTitle ? ` on “${item.journalTitle}”` : ''}
          </Text>
          {item.kind === 'story' && !!item.journalTitle && <Text style={styles.title}>{item.journalTitle}</Text>}
          {!!item.content && <Text style={styles.content} numberOfLines={6}>{item.content}</Text>}
          <Text style={styles.open}>Open {item.kind === 'story' ? 'story' : 'in story'} ›</Text>
        </TouchableOpacity>

        {(item.details || []).length > 0 && (
          <View style={styles.details}>
            {item.details.map((d, i) => <Text key={i} style={styles.detail}>“{d}”</Text>)}
          </View>
        )}

        <View style={styles.actions}>
          {busy ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : (
            <>
              <TouchableOpacity style={[styles.button, styles.dismiss]} onPress={() => act(item, 'dismiss')} accessibilityRole="button">
                <Text style={styles.dismissText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.remove]} onPress={() => confirmRemove(item)} accessibilityRole="button">
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return <RowListSkeleton thumb={42} label="Loading reports" />;
    return (
      <View style={styles.state}>
        <Feather name={error ? 'cloud-off' : 'check-circle'} size={36} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>{error || 'Nothing to review'}</Text>
        {!error && <Text style={styles.stateText}>Reported stories and comments show up here.</Text>}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + SIZES.spacing_md }]}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
            progressViewOffset={headerHeight}
          />
        )}
      />
      <ScreenHeader
        title="Reports"
        subtitle="Review within 24 hours"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        left={(
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundWarm },
  list: { paddingHorizontal: SIZES.spacing_base, paddingBottom: 120, flexGrow: 1 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  separator: { height: SIZES.spacing_md },
  card: {
    padding: SIZES.spacing_base,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SIZES.spacing_sm,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SIZES.spacing_sm },
  kind: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: SIZES.radius_full },
  kindStory: { backgroundColor: '#FDEBDD' },
  kindComment: { backgroundColor: '#E6EEF5' },
  kindText: { fontSize: SIZES.sm, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  meta: { flex: 1, fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  reasons: { fontSize: SIZES.md, fontFamily: 'Poppins_600SemiBold', color: COLORS.error },
  by: { fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  title: { fontSize: SIZES.base, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary, marginTop: 2 },
  content: { fontSize: SIZES.md, fontFamily: 'Poppins_400Regular', color: COLORS.textPrimary, marginTop: 4 },
  open: { fontSize: SIZES.sm, fontFamily: 'Poppins_600SemiBold', color: COLORS.accent, marginTop: 6 },
  details: { gap: 4, paddingLeft: SIZES.spacing_sm, borderLeftWidth: 2, borderLeftColor: COLORS.border },
  detail: { fontSize: SIZES.sm, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SIZES.spacing_sm, marginTop: 4, minHeight: 38 },
  button: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: SIZES.radius_full, justifyContent: 'center' },
  dismiss: { backgroundColor: '#F0F3F5' },
  dismissText: { fontSize: SIZES.md, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary },
  remove: { backgroundColor: COLORS.error },
  removeText: { fontSize: SIZES.md, fontFamily: 'Poppins_600SemiBold', color: COLORS.white },
  state: { alignItems: 'center', paddingTop: SIZES.spacing_xxl, paddingHorizontal: SIZES.spacing_xl, gap: SIZES.spacing_sm },
  stateTitle: { fontSize: SIZES.lg, fontFamily: 'Poppins_600SemiBold', color: COLORS.textPrimary, textAlign: 'center' },
  stateText: { fontSize: SIZES.md, fontFamily: 'Poppins_400Regular', color: COLORS.textSecondary, textAlign: 'center' },
});
