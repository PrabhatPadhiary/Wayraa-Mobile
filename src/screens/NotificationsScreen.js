import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { ScreenHeader, SignInPrompt, EmptyState } from '../components';
import { avatarColorFor, initialsFor } from '../components/TripStackCard';
import { RowListSkeleton } from '../components/skeletons';
import useAuth from '../hooks/useAuth';
import { getNotifications, markNotificationsRead } from '../services/inboxService';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';
import { timeAgo, isToday } from '../utils/timeAgo';
import RefreshSpinner from '../components/RefreshSpinner';

const PAGE = 30;

/** Small badge on the avatar: what kind of change it was. */
const TYPE_ICON = {
  announcement: { name: 'megaphone', bg: COLORS.accent },
  joined: { name: 'person-add', bg: COLORS.success },
  places: { name: 'bookmark', bg: COLORS.primaryLight },
  expenses: { name: 'wallet', bg: '#8A6D3B' },
  itinerary: { name: 'calendar', bg: COLORS.primary },
  likes: { name: 'heart', bg: '#E05024' },
  comment: { name: 'chatbubble', bg: COLORS.primaryLight },
  reply: { name: 'return-down-forward', bg: COLORS.primaryLight },
};

/**
 * NotificationsScreen (the bell on Home): what happened on your trips while
 * you were away. Friends joining, places, expenses and itinerary changes
 * (grouped, like the pushes) and the owner's announcements; and likes,
 * comments and replies on your stories. Newest first, in Today / Earlier.
 * Opening it marks everything as read; the ones that were new stay
 * highlighted for this visit. Tapping one opens its trip, or its story at the
 * comments.
 */
export default function NotificationsScreen({ navigation }) {
  const { isAuthenticated, isAuthReady } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [headerHeight, setHeaderHeight] = useState(0);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const page = await getNotifications({ limit: PAGE });
      setItems(page);
      setHasMore(page.length === PAGE);
      // Seen: clear the bell's dot. Rows keep their "new" look until you leave.
      if (page.some((n) => !n.isRead)) {
        markNotificationsRead(page[0].createdAt).catch(() => {});
      }
    } catch (e) {
      setError('Couldn\'t load your notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (!isAuthReady) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    load();
  }, [isAuthReady, isAuthenticated, load]));

  const loadMore = async () => {
    if (loadingMoreRef.current || !hasMore || items.length === 0) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getNotifications({ before: items[items.length - 1].createdAt, limit: PAGE });
      setItems((prev) => [...prev, ...page.filter((n) => !prev.some((p) => p.id === n.id))]);
      setHasMore(page.length === PAGE);
    } catch {
      // Try again on the next scroll.
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const openTrip = (item) => {
    if (item.journalId) {
      navigation.navigate('Community', {
        screen: 'JournalDetail',
        params: { journalId: item.journalId, title: item.title, focusComments: true },
        initial: false,
      });
      return;
    }
    if (!item.tripId) return;
    navigation.navigate('MyTrips', {
      screen: 'TripDetail',
      params: { tripId: item.tripId, tripName: item.title },
      initial: false, // keep My Trips underneath, so back lands there
    });
  };

  const today = items.filter((n) => isToday(n.createdAt));
  const earlier = items.filter((n) => !isToday(n.createdAt));
  const sections = [
    today.length > 0 && { key: 'today', title: 'Today', data: today },
    earlier.length > 0 && { key: 'earlier', title: today.length > 0 ? 'Earlier' : null, data: earlier },
  ].filter(Boolean);

  const renderItem = ({ item, index, section }) => {
    const name = item.actor?.name || 'Former traveller';
    const icon = TYPE_ICON[item.type] || { name: 'notifications', bg: COLORS.primaryLight };
    const first = index === 0;
    const last = index === section.data.length - 1;
    return (
      <TouchableOpacity
        style={[
          styles.row,
          !item.isRead && styles.rowNew,
          first && styles.rowFirst,
          last && styles.rowLast,
          !last && styles.rowDivider,
        ]}
        onPress={() => openTrip(item)}
        disabled={!item.tripId && !item.journalId}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${item.isRead ? '' : 'New. '}${item.body}. ${item.title}, ${timeAgo(item.createdAt)}`}
      >
        <View>
          <View style={[styles.avatar, { backgroundColor: avatarColorFor(name) }]}>
            {item.actor?.photoUrl
              ? <Image source={{ uri: cloudinarySized(item.actor.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, styles.avatarImage]} contentFit="cover" />
              : <Text style={styles.avatarText}>{initialsFor(name)}</Text>}
          </View>
          <View style={[styles.typeBadge, { backgroundColor: icon.bg }]}>
            <Ionicons name={icon.name} size={10} color={COLORS.white} />
          </View>
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.body, !item.isRead && styles.bodyNew]} numberOfLines={item.type === 'announcement' ? 4 : 3}>
            {item.body}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.trip} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.time}>· {timeAgo(item.createdAt)}</Text>
          </View>
        </View>
        {!item.isRead && <View style={styles.newDot} />}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return <RowListSkeleton thumb={44} round label="Loading notifications" />;
    if (!error) {
      return (
        <EmptyState
          style={styles.state}
          icon="notifications-outline"
          title="You're all caught up"
          text="When friends join your trips or change the plans, or someone likes or comments on your stories, you'll see it here."
        />
      );
    }
    return (
      <View style={styles.state}>
        <View style={styles.stateIcon}>
          <Feather name="cloud-off" size={28} color={COLORS.primaryLight} />
        </View>
        <Text style={styles.stateTitle}>{error}</Text>
        <Text style={styles.stateText}>Pull down to try again.</Text>
      </View>
    );
  };

  const header = (
    <ScreenHeader
      title="Notifications"
      subtitle="What's new on your trips and stories"
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
  );

  if (isAuthReady && !isAuthenticated) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={{ paddingTop: headerHeight + SIZES.spacing_lg }}>
          <SignInPrompt
            icon="notifications-outline"
            title="Sign in to see notifications"
            subtitle="Updates from the trips you plan with friends show up here."
            onSignIn={() => navigation.navigate('Welcome')}
          />
        </View>
        {header}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SectionList
        sections={sections}
        keyExtractor={(n) => String(n.id)}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (section.title
          ? <Text style={styles.sectionTitle}>{section.title}</Text>
          : <View style={styles.sectionSpacer} />)}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.more} color={COLORS.accent} /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={COLORS.accent}
            progressViewOffset={headerHeight}
          />
        )}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + SIZES.spacing_xs }]}
        showsVerticalScrollIndicator={false}
      />
      <RefreshSpinner refreshing={refreshing} top={headerHeight} />
      {header}
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
    paddingBottom: 140,
    flexGrow: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
    marginLeft: SIZES.spacing_xs,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionSpacer: {
    height: SIZES.spacing_md,
  },
  // Rows sit together in one white group per section.
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_md,
    backgroundColor: COLORS.white,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#E9EDF1',
  },
  rowNew: {
    backgroundColor: '#FFF6F1',
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: SIZES.radius_lg,
    borderTopRightRadius: SIZES.radius_lg,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: SIZES.radius_lg,
    borderBottomRightRadius: SIZES.radius_lg,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    borderRadius: 22,
  },
  avatarText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  typeBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  rowText: {
    flex: 1,
  },
  body: {
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  bodyNew: {
    fontFamily: 'Poppins_500Medium',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  trip: {
    flexShrink: 1,
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primaryLight,
  },
  time: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  newDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: COLORS.accent,
  },
  more: {
    marginVertical: SIZES.spacing_lg,
  },
  state: {
    alignItems: 'center',
    paddingTop: SIZES.spacing_xxl,
    paddingHorizontal: SIZES.spacing_xl,
  },
  stateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
    marginBottom: SIZES.spacing_md,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stateText: {
    marginTop: SIZES.spacing_xs,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
