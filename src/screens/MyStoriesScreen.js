import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { ScreenHeader, JournalCard, EmptyState } from '../components';
import { getMyJournals, toggleLike, setLiked } from '../services';
import { openStoryMenu } from '../utils/storyActions';
import { RowListSkeleton } from '../components/skeletons';
import RefreshSpinner from '../components/RefreshSpinner';
import useHideTabBarOnScroll from '../hooks/useHideTabBarOnScroll';
import { loadFailureKind } from '../hooks/useNetwork';

// Why it failed, in words (no internet vs our server down vs anything else).
function failureText(e, fallback) {
  const kind = loadFailureKind(e);
  if (kind === 'offline') return 'You\'re offline. Connect to the internet and try again.';
  if (kind === 'server') return 'Wayraa isn\'t responding right now. Try again in a moment.';
  return e?.message || fallback;
}

/**
 * Your stories: everything you've posted, including ones hidden from
 * Community ("Hidden" on the photo), with the same ⋯ menu as in the feed
 * (edit, hide / show, share, delete). Opened from Profile.
 */
export default function MyStoriesScreen({ navigation }) {
  // The bottom bar slides away while scrolling down, back on scroll up.
  const onBarScroll = useHideTabBarOnScroll();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [headerHeight, setHeaderHeight] = useState(0);

  const load = useCallback(async () => {
    try {
      setError('');
      // Unfinished uploads (drafts) aren't stories yet.
      setStories((await getMyJournals()).filter((j) => j.status === 'published'));
    } catch (e) {
      setError(failureText(e, 'Couldn\'t load your stories.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Shows at once (likesStore); a failed one quietly goes back.
  const like = (item) => toggleLike(item);

  const renderEmpty = () => {
    if (loading) return <RowListSkeleton thumb={64} label="Loading your stories" />;
    if (error) {
      return (
        <View style={styles.state}>
          <Feather name="cloud-off" size={36} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>{error}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <EmptyState
        style={styles.emptyState}
        icon="book-outline"
        title="No stories yet"
        text="Write about a trip, add your photos and tag the places you went. Everything you share shows up here, hidden stories too."
        actionLabel="Write a story"
        onAction={() => navigation.navigate('WriteJournal')}
      />
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        onScroll={onBarScroll}
        scrollEventThrottle={16}
        data={stories}
        keyExtractor={(j) => String(j.id)}
        renderItem={({ item }) => (
          <JournalCard
            journal={item}
            badge={item.visibility === 'private' ? 'Hidden' : undefined}
            onPress={() => navigation.navigate('JournalDetail', { journalId: item.id, title: item.title })}
            onToggleLike={() => like(item)}
            onDoubleTapLike={() => setLiked(item, true)}
            onMore={() => openStoryMenu({
              journal: item,
              isMine: true,
              navigation,
              onChanged: (j) => setStories((prev) => prev.map((x) => (x.id === j.id ? { ...x, ...j } : x))),
              onDeleted: () => setStories((prev) => prev.filter((x) => x.id !== item.id)),
            })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + SIZES.spacing_md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.accent}
            progressViewOffset={headerHeight}
          />
        )}
      />

      {/* iPhone: the refresh spinner, below the header (see RefreshSpinner). */}
      <RefreshSpinner refreshing={refreshing} top={headerHeight} />
      <ScreenHeader
        title="Your stories"
        subtitle={stories.length ? `${stories.length} ${stories.length === 1 ? 'story' : 'stories'}` : 'Trips you\'ve shared'}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
  },
  list: {
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: 120,
    flexGrow: 1,
  },
  gap: {
    height: SIZES.spacing_base,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    marginTop: SIZES.spacing_xxl,
  },
  state: {
    alignItems: 'center',
    paddingTop: SIZES.spacing_xxl,
    paddingHorizontal: SIZES.spacing_xl,
    gap: SIZES.spacing_sm,
  },
  emptyState: {
    paddingTop: SIZES.spacing_xxl,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stateText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  retry: {
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_lg,
    paddingVertical: SIZES.spacing_sm,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  retryText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
