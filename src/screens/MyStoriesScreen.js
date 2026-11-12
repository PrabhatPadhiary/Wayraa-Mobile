import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { ScreenHeader, JournalCard } from '../components';
import { getMyJournals, toggleJournalLike } from '../services';
import { openStoryMenu } from '../utils/storyActions';
import WayraaLoader from '../components/WayraaLoader';

/**
 * Your stories: everything you've posted, including ones hidden from
 * Community ("Hidden" on the photo), with the same ⋯ menu as in the feed
 * (edit, hide / show, share, delete). Opened from Profile.
 */
export default function MyStoriesScreen({ navigation }) {
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
      setError(e?.message || 'Couldn\'t load your stories.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const like = async (item) => {
    try {
      const res = await toggleJournalLike(item.id);
      setStories((prev) => prev.map((j) => (j.id === item.id ? { ...j, isLiked: res.liked, likesCount: res.likesCount } : j)));
    } catch {
      // A missed like isn't worth an alert.
    }
  };

  const renderEmpty = () => {
    if (loading) return <View style={[styles.loader, { alignItems: 'center' }]}><WayraaLoader size={72} /></View>;
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
      <View style={styles.state}>
        <Feather name="book-open" size={36} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>No stories yet</Text>
        <Text style={styles.stateText}>Share a trip with the community and it'll show up here.</Text>
        <TouchableOpacity style={styles.retry} onPress={() => navigation.navigate('WriteJournal')}>
          <Text style={styles.retryText}>Write a story</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={stories}
        keyExtractor={(j) => String(j.id)}
        renderItem={({ item }) => (
          <JournalCard
            journal={item}
            badge={item.visibility === 'private' ? 'Hidden' : undefined}
            onPress={() => navigation.navigate('JournalDetail', { journalId: item.id, title: item.title })}
            onToggleLike={() => like(item)}
            onDoubleTapLike={() => { if (!item.isLiked) like(item); }}
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
