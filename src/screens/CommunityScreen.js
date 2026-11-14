import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import useAuth from '../hooks/useAuth';
import StoryUploadCard from '../components/StoryUploadCard';
import JournalPreviewSheet from '../components/JournalPreviewSheet';
import {
  getStoryUpload,
  subscribeStoryUpload,
  retryStoryUpload,
  dismissStoryUpload,
} from '../services/storyUpload';
import { COLORS, SIZES } from '../constants';
import { ScreenHeader, FilterChips, Skeleton, JournalCard } from '../components';
import { getJournalFeed, peekJournalFeed, toggleJournalLike, vibeLabel, AuthRequiredError, getStoredUser } from '../services';
import { openStoryMenu, isMyStory } from '../utils/storyActions';
import { showAlert } from '../components/AppDialog';

const SORTS = [
  { key: 'recent', label: 'Recent' },
  { key: 'popular', label: 'Popular' },
];

/** Most liked first, then most discussed, then newest. */
function byPopularity(a, b) {
  return (b.likesCount || 0) - (a.likesCount || 0)
    || (b.commentsCount || 0) - (a.commentsCount || 0)
    || new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
}

/**
 * CommunityScreen — trip journals shared by travellers (public + published).
 *
 * Sort by Recent / Popular, filter by vibe (built from the vibes in the feed),
 * and search by destination, title or author. Hearts toggle likes right on
 * the card; tapping a card opens the full story.
 */
export default function CommunityScreen({ navigation }) {
  // Open with the feed Home already loaded (if any), then refresh quietly.
  const [journals, setJournals] = useState(() => peekJournalFeed() || []);
  const [loading, setLoading] = useState(() => !peekJournalFeed());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState('recent');
  const [vibe, setVibe] = useState('all');
  const [query, setQuery] = useState('');
  const [headerHeight, setHeaderHeight] = useState(0);
  // Header collapses on scroll down (title + share row fold away, leaving the
  // sort switch and the "+" button); expands again near the top.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const collapseAnim = useRef(new Animated.Value(0)).current; // 0 open, 1 collapsed
  useEffect(() => {
    Animated.timing(collapseAnim, {
      toValue: headerCollapsed ? 1 : 0,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animating height
    }).start();
  }, [headerCollapsed, collapseAnim]);
  const onListScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 40 && !headerCollapsed) setHeaderCollapsed(true);
    else if (y < 15 && headerCollapsed) setHeaderCollapsed(false);
  };
  const likeBusy = useRef(new Set());
  // Long-press preview: id of the journal shown in the bottom sheet.
  const [previewId, setPreviewId] = useState(null);

  // Who you are, to tell your own stories apart (their ⋯ has edit / delete).
  const [myUserId, setMyUserId] = useState(null);
  useEffect(() => {
    getStoredUser().then((u) => setMyUserId(u?.id || null)).catch(() => {});
  }, []);
  const openMenu = (item) => openStoryMenu({
    journal: item,
    isMine: isMyStory(item, myUserId),
    signedIn: !!myUserId,
    navigation,
    onRemoved: () => setJournals((prev) => prev.filter((x) => x.id !== item.id)),
    onBlocked: (userId) => setJournals((prev) => prev.filter((x) => x.author?.id !== userId)),
    // Hidden stories leave the feed (it only shows public ones).
    onChanged: (j) => setJournals((prev) => (j.visibility === 'private'
      ? prev.filter((x) => x.id !== j.id)
      : prev.map((x) => (x.id === j.id ? { ...x, ...j } : x)))),
    onDeleted: () => setJournals((prev) => prev.filter((x) => x.id !== item.id)),
  });
  const listRef = useRef(null);
  const { isAuthenticated } = useAuth();


  // Open the story composer (signed-in only).
  const startStory = () => {
    if (!isAuthenticated) {
      showAlert('Sign in to share', 'Create an account or sign in to post your trip stories.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => navigation.navigate('Welcome') },
      ]);
      return;
    }
    navigation.navigate('WriteJournal');
  };

  const load = useCallback(async () => {
    setError(false);
    try {
      setJournals(await getJournalFeed());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Background story upload (started from the composer): show its progress
  // at the top of the feed, then refresh so the new story appears.
  const [upload, setUpload] = useState(getStoryUpload);
  useEffect(() => subscribeStoryUpload(setUpload), []);
  const lastStatus = useRef(upload.status);
  useEffect(() => {
    const prev = lastStatus.current;
    lastStatus.current = upload.status;
    if (upload.status === 'uploading' && prev !== 'uploading') {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    if (upload.status === 'done' && prev !== 'done') {
      load();
      const timer = setTimeout(dismissStoryUpload, 6000); // "Posted" fades out
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [upload.status, load]);

  // Refresh on focus so likes / comments made on a story show up here.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Vibe chips: only vibes that actually appear in the feed, most used first.
  const vibeCounts = {};
  journals.forEach((j) => j.vibes.forEach((v) => {
    const key = v.toLowerCase();
    vibeCounts[key] = (vibeCounts[key] || 0) + 1;
  }));
  const vibeChips = Object.keys(vibeCounts).sort((a, b) => vibeCounts[b] - vibeCounts[a]);

  const q = query.trim().toLowerCase();
  const matching = journals
    .filter((j) => vibe === 'all' || j.vibes.some((v) => v.toLowerCase() === vibe))
    .filter((j) => !q
      || (j.destination || '').toLowerCase().includes(q)
      || (j.title || '').toLowerCase().includes(q)
      || (j.author?.name || '').toLowerCase().includes(q));
  // The feed already comes newest first.
  const shown = sort === 'popular' ? [...matching].sort(byPopularity) : matching;

  const handleLike = async (journal) => {
    if (likeBusy.current.has(journal.id)) return;
    likeBusy.current.add(journal.id);
    // Optimistic: flip now, settle with the server's count.
    const flip = (j) => (j.id === journal.id
      ? { ...j, isLiked: !j.isLiked, likesCount: Math.max(0, (j.likesCount || 0) + (j.isLiked ? -1 : 1)) }
      : j);
    setJournals((prev) => prev.map(flip));
    try {
      const res = await toggleJournalLike(journal.id);
      setJournals((prev) => prev.map((j) => (j.id === journal.id
        ? { ...j, isLiked: res.liked, likesCount: res.likesCount }
        : j)));
    } catch (e) {
      setJournals((prev) => prev.map(flip)); // undo
      if (e instanceof AuthRequiredError) {
        showAlert('Sign in to like stories', 'Create an account or sign in to like and comment.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Sign in', onPress: () => navigation.navigate('Welcome') },
        ]);
      }
    } finally {
      likeBusy.current.delete(journal.id);
    }
  };

  const listHeader = (
    <View>
      {upload.status !== 'idle' && (
        <StoryUploadCard
          upload={upload}
          onRetry={retryStoryUpload}
          onDismiss={dismissStoryUpload}
          onView={() => {
            const id = upload.journalId;
            dismissStoryUpload();
            if (id) navigation.navigate('JournalDetail', { journalId: id, title: upload.title });
          }}
        />
      )}

      <View style={styles.search}>
        <Feather name="search" size={17} color={COLORS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search destinations, stories, travellers"
          placeholderTextColor={COLORS.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search journals"
        />
        {!!query && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <Feather name="x-circle" size={17} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {vibeChips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.vibeScroll}
          contentContainerStyle={styles.vibeRow}
        >
          {['all', ...vibeChips].map((v) => {
            const on = vibe === v;
            return (
              <TouchableOpacity
                key={v}
                style={[styles.vibeChip, on && styles.vibeChipOn]}
                onPress={() => setVibe(v)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.vibeChipText, on && styles.vibeChipTextOn]}>
                  {v === 'all' ? 'All vibes' : vibeLabel(v)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  const renderEmpty = () => {
    if (loading) {
      return (
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Loading stories">
          {[0, 1].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <Skeleton width="100%" height={190} radius={0} />
              <View style={styles.skeletonBody}>
                <Skeleton width="75%" height={18} />
                <Skeleton width="100%" height={12} style={styles.skeletonGap} />
                <Skeleton width="60%" height={12} style={styles.skeletonGap} />
              </View>
            </View>
          ))}
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.state}>
          <Feather name="wifi-off" size={40} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Couldn't load stories</Text>
          <Text style={styles.stateText}>Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (journals.length === 0) {
      return (
        <View style={styles.state}>
          <Feather name="book-open" size={40} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>No stories yet</Text>
          <Text style={styles.stateText}>Trip journals travellers share publicly will show up here.</Text>
          <TouchableOpacity style={styles.retry} onPress={startStory} accessibilityRole="button">
            <Text style={styles.retryText}>Share the first one</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.state}>
        <Feather name="search" size={36} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>No matching stories</Text>
        <Text style={styles.stateText}>Try another search or vibe.</Text>
      </View>
    );
  };

  return (
    // Top padding comes from the floating header (it clears the notch itself).
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={(j) => String(j.id)}
        renderItem={({ item }) => (
          <JournalCard
            journal={item}
            onPress={() => navigation.navigate('JournalDetail', { journalId: item.id, title: item.title })}
            onToggleLike={() => handleLike(item)}
            onDoubleTapLike={() => { if (!item.isLiked) handleLike(item); }}
            onLongPress={() => setPreviewId(item.id)}
            onMore={() => openMenu(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + SIZES.spacing_md }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onListScroll}
        scrollEventThrottle={16}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.accent}
            progressViewOffset={headerHeight}
          />
        )}
      />

      <ScreenHeader
        title="Community"
        subtitle="Trip stories from fellow travellers"
        collapsed={headerCollapsed}
        // Keep the expanded height: the list's top padding stays put while the
        // header shrinks over it.
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setHeaderHeight((prev) => (h > prev ? h : prev));
        }}
      >
        <View style={styles.sortRow}>
          <View style={styles.sortSwitch}>
            <FilterChips
              filters={SORTS}
              activeKey={sort}
              onChange={setSort}
              variant="pills"
              fullWidth
              tinted={false}
            />
          </View>
          {/* Always-visible "+" (stays when the header collapses). */}
          <TouchableOpacity
            style={styles.plusButton}
            onPress={startStory}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share a trip story"
          >
            <Feather name="plus" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>
        {/* Share a trip story: shown at the top, folds away on scroll. */}
        <Animated.View
          style={{
            opacity: collapseAnim.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }),
            maxHeight: collapseAnim.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }),
            overflow: 'hidden',
          }}
          pointerEvents={headerCollapsed ? 'none' : 'auto'}
        >
          <TouchableOpacity
            style={[styles.shareRow, styles.shareRowInHeader]}
            onPress={startStory}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share a trip story"
          >
            <Feather name="plus-circle" size={20} color={COLORS.accentDeep} />
            <Text style={styles.shareRowText}>Share a trip story</Text>
            <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      </ScreenHeader>

      {/* Long-press preview (reads the live item so likes stay in sync). */}
      <JournalPreviewSheet
        journal={previewId ? journals.find((j) => j.id === previewId) || null : null}
        onClose={() => setPreviewId(null)}
        onToggleLike={() => {
          const j = journals.find((x) => x.id === previewId);
          if (j) handleLike(j);
        }}
        onOpen={() => {
          const j = journals.find((x) => x.id === previewId);
          setPreviewId(null);
          if (j) navigation.navigate('JournalDetail', { journalId: j.id, title: j.title });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm, // alpine frost (60%)
  },
  list: {
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: 140,
    flexGrow: 1,
  },
  gap: {
    height: SIZES.spacing_base,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_lg,
  },
  sortSwitch: {
    flex: 1,
  },
  plusButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accentDeep,
  },

  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    height: 48,
    paddingHorizontal: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
    // Fully rounded pill with a soft warm tint.
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDF1EE',
    borderWidth: 1,
    borderColor: '#F9D6CC',
  },
  // In the header: inset like the sort switch, a little gap above.
  shareRowInHeader: {
    marginTop: SIZES.spacing_md,
    marginBottom: 0,
    marginHorizontal: SIZES.spacing_lg,
  },
  shareRowText: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    height: 46,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E9EDF1',
  },
  searchInput: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  vibeScroll: {
    marginHorizontal: -SIZES.spacing_base,
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_base,
    flexGrow: 0,
  },
  vibeRow: {
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
  },
  vibeChip: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E9EDF1',
  },
  vibeChipOn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  vibeChipText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  vibeChipTextOn: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
  },

  skeletonCard: {
    marginTop: SIZES.spacing_base,
    borderRadius: SIZES.radius_xl,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
  },
  skeletonBody: {
    padding: SIZES.spacing_base,
  },
  skeletonGap: {
    marginTop: SIZES.spacing_sm,
  },

  state: {
    alignItems: 'center',
    paddingTop: SIZES.spacing_xxl,
    paddingHorizontal: SIZES.spacing_xl,
  },
  stateTitle: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  stateText: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  retry: {
    marginTop: SIZES.spacing_lg,
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
});
