import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView, GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { fallbackGradientFor } from './PlaceTile';
import { avatarColorFor, initialsFor } from './TripStackCard';
import { timeAgo, tripWhen } from './JournalCard';
import { vibeLabel } from '../services/journalsService';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

const PHOTO_HEIGHT = 300;
// Swipe-down to close: distance (px) or flick speed past which it closes.
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 1.1;

/**
 * Quick look at a journal from the feed (long-press a card): slides up from
 * the bottom with the photos (swipe), author, title, vibes and a longer
 * excerpt, plus Like and "Open story". Swipe down, tap outside or ✕ to close.
 *
 * @param {object|null} journal   feed item (null = closed)
 * @param {() => void} onClose
 * @param {() => void} onToggleLike
 * @param {() => void} onOpen     open the full story
 */
export default function JournalPreviewSheet({ journal, onClose, onToggleLike, onOpen }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const photoWidth = width - SIZES.spacing_base * 2;
  const [page, setPage] = useState(0);
  const [shown, setShown] = useState(journal);

  // Keep showing the last journal while the sheet slides away.
  useEffect(() => {
    if (journal) {
      if (journal.id !== shown?.id) setPage(0);
      setShown(journal);
    }
  }, [journal]); // eslint-disable-line

  // Swipe down to close, from anywhere on the sheet (photos included).
  // A native pan gesture (react-native-gesture-handler): it activates only
  // on a downward drag and fails on sideways movement, so the photo carousel
  // still swipes and buttons still tap. (The JS PanResponder never received
  // these touches inside the Modal.) Callbacks run on the JS thread.
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isOpen = !!journal;
  useEffect(() => {
    if (isOpen) dragY.setValue(0); // fresh position each time it opens
  }, [isOpen, dragY]);
  const springBack = () => {
    Animated.spring(dragY, { toValue: 0, friction: 8, useNativeDriver: true }).start();
  };
  const pan = usePanGesture({
    runOnJS: true,
    activeOffsetY: 10, // only a downward drag activates it
    failOffsetX: [-14, 14], // sideways first = let the photos scroll
    onUpdate: (e) => dragY.setValue(Math.max(0, e.translationY)),
    onDeactivate: (e) => {
      // velocityY is in points per second.
      if (e.translationY > CLOSE_DISTANCE || e.velocityY > CLOSE_VELOCITY * 1000) {
        Animated.timing(dragY, { toValue: height, duration: 180, useNativeDriver: true })
          .start(() => onCloseRef.current?.());
      } else {
        springBack();
      }
    },
  });

  const j = journal || shown;
  if (!j) return null;
  const photos = j.photos || [];
  const author = j.author?.name || 'Traveller';
  const when = tripWhen(j);

  return (
    <Modal visible={!!journal} transparent animationType="slide" onRequestClose={onClose}>
      {/* A Modal renders outside the app's GestureHandlerRootView, so it needs its own. */}
      <GestureHandlerRootView style={styles.flex}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close preview" />
        <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base, transform: [{ translateY: dragY }] }]}
        >
          <View style={styles.grabber} />

          <View style={styles.authorRow}>
            <View style={[styles.avatar, { backgroundColor: avatarColorFor(author) }]}>
              {j.author?.photoUrl
                ? <Image source={{ uri: cloudinarySized(j.author?.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} contentFit="cover" />
                : <Text style={styles.avatarText}>{initialsFor(author)}</Text>}
            </View>
            <View style={styles.flex}>
              <Text style={styles.authorName} numberOfLines={1}>{author}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {j.destination}{when ? ` · ${when}` : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Feather name="x" size={18} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={[styles.photos, { width: photoWidth }]}>
            {photos.length > 0 ? (
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / photoWidth))}
              >
                {photos.map((p) => (
                  <Image
                    key={p.id}
                    source={{ uri: cloudinarySized(p.url, IMAGE_WIDTH.PHOTO) }}
                    style={{ width: photoWidth, height: PHOTO_HEIGHT }}
                    contentFit="cover"
                    transition={150}
                  />
                ))}
              </ScrollView>
            ) : (
              <LinearGradient
                colors={fallbackGradientFor(j.destination)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            {photos.length > 1 && (
              <View style={styles.dots} pointerEvents="none">
                {photos.map((p, i) => <View key={p.id} style={[styles.dot, i === page && styles.dotOn]} />)}
              </View>
            )}
          </View>

          <Text style={styles.title} numberOfLines={2}>{j.title}</Text>
          {j.vibes?.length > 0 && (
            <View style={styles.vibes}>
              {j.vibes.slice(0, 4).map((v) => (
                <View key={v} style={styles.vibe}><Text style={styles.vibeText}>{vibeLabel(v)}</Text></View>
              ))}
            </View>
          )}
          {!!j.body && (
            <Text style={styles.excerpt} numberOfLines={5}>{j.body.replace(/\s+/g, ' ').trim()}</Text>
          )}
          <Text style={styles.posted}>
            {j.likesCount || 0} {j.likesCount === 1 ? 'like' : 'likes'} · {j.commentsCount || 0} {j.commentsCount === 1 ? 'comment' : 'comments'} · {timeAgo(j.publishedAt || j.createdAt)}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.likeButton, j.isLiked && styles.likeButtonOn]}
              onPress={onToggleLike}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: !!j.isLiked }}
              accessibilityLabel={j.isLiked ? 'Unlike' : 'Like'}
            >
              <Ionicons name={j.isLiked ? 'heart' : 'heart-outline'} size={19} color={j.isLiked ? COLORS.white : '#e0245e'} />
              <Text style={[styles.likeText, j.isLiked && styles.likeTextOn]}>{j.isLiked ? 'Liked' : 'Like'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.openButton} onPress={onOpen} activeOpacity={0.9} accessibilityRole="button">
              <Text style={styles.openText}>Open story</Text>
              <Feather name="arrow-right" size={17} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </Animated.View>
        </GestureDetector>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_sm,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SIZES.spacing_md,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginBottom: SIZES.spacing_md,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  authorName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  meta: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  photos: {
    height: PHOTO_HEIGHT,
    borderRadius: SIZES.radius_lg,
    overflow: 'hidden',
    backgroundColor: COLORS.cardBackground,
  },
  dots: {
    position: 'absolute',
    bottom: SIZES.spacing_md,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotOn: {
    width: 16,
    backgroundColor: COLORS.white,
  },
  title: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.lg,
    lineHeight: 25,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  vibes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: SIZES.spacing_sm,
  },
  vibe: {
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#fff1e8',
  },
  vibeText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  excerpt: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  posted: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_base,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SIZES.spacing_lg,
    height: 48,
    borderRadius: SIZES.radius_full,
    borderWidth: 1.5,
    borderColor: '#e0245e',
  },
  likeButtonOn: {
    backgroundColor: '#e0245e',
  },
  likeText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: '#e0245e',
  },
  likeTextOn: {
    color: COLORS.white,
  },
  openButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
  },
  openText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
