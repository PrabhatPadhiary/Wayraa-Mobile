import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { fallbackGradientFor } from './PlaceTile';
import { avatarColorFor, initialsFor } from './TripStackCard';
import { timeAgo } from './JournalCard';
import { getJournalsForPlace } from '../services';
import useAuth from '../hooks/useAuth';
import { showAlert } from './AppDialog';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

const CARD_WIDTH = 220;

/**
 * "Stories from Wayraa travellers" on a place's page: public stories that
 * tagged this place, as a sideways row of small cards (cover, title, author,
 * likes). Tapping one opens the story. With none yet, a prompt to share the
 * first. Hidden if the stories can't be loaded, so it never shows an error.
 *
 * @param {string} placeId     Google place id
 * @param {string} placeName
 * @param {object} navigation
 * @param {object} [prefill]   { placeId, name, address, coords, category } for
 *                             the composer, so "Share a story" starts with this
 *                             place and its city filled in
 */
export default function PlaceStories({ placeId, placeName, navigation, prefill }) {
  const { isAuthenticated } = useAuth();
  const [stories, setStories] = useState(null); // null = loading
  const [failed, setFailed] = useState(false);

  // Reload on focus, so a story just posted about this place shows up.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getJournalsForPlace(placeId)
        .then((list) => { if (!cancelled) { setStories(list); setFailed(false); } })
        .catch(() => { if (!cancelled) setFailed(true); });
      return () => { cancelled = true; };
    }, [placeId])
  );

  const shareStory = () => {
    if (!isAuthenticated) {
      showAlert('Sign in to share', 'Create an account or sign in to post your trip stories.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => navigation.navigate('Welcome') },
      ]);
      return;
    }
    navigation.navigate('WriteJournal', prefill ? { prefillPlace: prefill } : undefined);
  };

  if (failed || !placeId) return null;
  if (stories === null) return null; // quiet while loading: the page has plenty above

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleIcon}>
            <Feather name="book-open" size={15} color={COLORS.accentDeep} />
          </View>
          <Text style={styles.title} numberOfLines={1}>Stories from Wayraa</Text>
        </View>
        {stories.length > 0 && (
          <TouchableOpacity
            style={styles.shareLink}
            onPress={shareStory}
            accessibilityRole="button"
            accessibilityLabel={`Share your story about ${placeName || 'this place'}`}
            hitSlop={8}
          >
            <Feather name="plus" size={14} color={COLORS.accentDeep} />
            <Text style={styles.shareLinkText}>Share yours</Text>
          </TouchableOpacity>
        )}
      </View>

      {stories.length === 0 ? (
        <TouchableOpacity
          style={styles.empty}
          onPress={shareStory}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Share a story about ${placeName || 'this place'}`}
        >
          <View style={styles.emptyIcon}>
            <Feather name="edit-3" size={18} color={COLORS.accentDeep} />
          </View>
          <View style={styles.emptyText}>
            <Text style={styles.emptyTitle}>Been here? Share the first story</Text>
            <Text style={styles.emptySub} numberOfLines={2}>
              Tell other travellers what {placeName || 'this place'} was like.
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + SIZES.spacing_md}
        >
          {stories.map((j) => {
            const cover = cloudinarySized(j.photos?.[0]?.url, IMAGE_WIDTH.COVER);
            const author = j.author?.name || 'Traveller';
            return (
              <TouchableOpacity
                key={j.id}
                style={styles.story}
                onPress={() => navigation.navigate('JournalDetail', { journalId: j.id, title: j.title })}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={`${j.title}, by ${author}`}
              >
                <View style={styles.cover}>
                  {cover ? (
                    <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                  ) : (
                    <LinearGradient
                      colors={fallbackGradientFor(j.destination)}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <View style={styles.likes}>
                    <Ionicons name={j.isLiked ? 'heart' : 'heart-outline'} size={12} color={j.isLiked ? '#e0245e' : COLORS.textPrimary} />
                    <Text style={styles.likesText}>{j.likesCount || 0}</Text>
                  </View>
                </View>
                <View style={styles.storyBody}>
                  <Text style={styles.storyTitle} numberOfLines={2}>{j.title}</Text>
                  <View style={styles.authorRow}>
                    <View style={[styles.avatar, { backgroundColor: avatarColorFor(author) }]}>
                      {j.author?.photoUrl
                        ? <Image source={{ uri: cloudinarySized(j.author.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} contentFit="cover" />
                        : <Text style={styles.avatarText}>{initialsFor(author)}</Text>}
                    </View>
                    <Text style={styles.authorName} numberOfLines={1}>{author}</Text>
                    <Text style={styles.ago}>{timeAgo(j.publishedAt || j.createdAt)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Matches the place page's cards (same as the trip page).
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e9edf1',
    shadowColor: '#043247',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  titleIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff1e8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SIZES.spacing_base,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    flexShrink: 1,
  },
  title: {
    flexShrink: 1,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  shareLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#fff1e8',
  },
  shareLinkText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  row: {
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_base,
  },
  story: {
    width: CARD_WIDTH,
    borderRadius: SIZES.radius_md,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e9edf1',
  },
  cover: {
    height: 130,
    backgroundColor: COLORS.cardBackground,
  },
  likes: {
    position: 'absolute',
    top: SIZES.spacing_sm,
    right: SIZES.spacing_sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  likesText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  storyBody: {
    padding: SIZES.spacing_md,
  },
  storyTitle: {
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SIZES.spacing_sm,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 9,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  authorName: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  ago: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginHorizontal: SIZES.spacing_base,
    marginBottom: SIZES.spacing_base,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: '#fff8f3',
    borderWidth: 1,
    borderColor: '#ffdcc6',
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffe8d9',
  },
  emptyText: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  emptySub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
});
