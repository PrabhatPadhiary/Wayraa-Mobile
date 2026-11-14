import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { fallbackGradientFor } from './PlaceTile';
import { avatarColorFor, initialsFor } from './TripStackCard';
import { vibeLabel } from '../services/journalsService';
import { dayCount } from '../utils/tripDates';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "just now", "5m", "3h", "2d", "4w", else "12 Mar 2026". */
export function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const secs = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)}d ago`;
  if (secs < 86400 * 30) return `${Math.floor(secs / (86400 * 7))}w ago`;
  return `${then.getDate()} ${MONTHS[then.getMonth()]} ${then.getFullYear()}`;
}

/** "Mar 2026 · 5 days" from the trip dates, or null. */
export function tripWhen(journal) {
  if (!journal?.startDate) return null;
  const start = new Date(journal.startDate);
  const days = dayCount(journal.startDate, journal.endDate);
  const month = `${MONTHS[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
  return days ? `${month} · ${days} ${days === 1 ? 'day' : 'days'}` : month;
}

/** Story body as a short single-paragraph excerpt. */
function excerpt(body) {
  return (body || '').replace(/\s+/g, ' ').trim();
}

// Two taps on the photo within this window count as a double tap.
const DOUBLE_TAP_MS = 260;
// Same red as the liked heart button.
const LIKE_RED = '#E05024';

/**
 * Community feed card for a trip journal: cover photo (or a destination
 * gradient), destination + when, title, excerpt, vibes, author and
 * like / comment counts.
 *
 *  - tap: open the story (on the photo, after a short wait to rule out a
 *    double tap)
 *  - double-tap the photo: like it, with a heart that pops on the photo
 *  - long-press anywhere: quick preview (onLongPress)
 *  - the heart button toggles the like
 *
 * @param {object} journal       a feed item (vibes already an array)
 * @param {() => void} onPress
 * @param {() => void} onToggleLike
 * @param {() => void} [onDoubleTapLike]  like (never unlike) from a double tap
 * @param {() => void} [onLongPress]
 * @param {() => void} [onMore]   the ⋯ menu (edit, share, delete, ...)
 * @param {string} [badge]        a tag on the photo, e.g. "Hidden"
 */
export default function JournalCard({ journal, onPress, onToggleLike, onDoubleTapLike, onLongPress, onMore, badge }) {
  const [failed, setFailed] = useState(false);
  const lastTap = useRef(0);
  const singleTapTimer = useRef(null);
  const heart = useRef(new Animated.Value(0)).current;
  useEffect(() => () => clearTimeout(singleTapTimer.current), []);

  const popHeart = () => {
    heart.setValue(0);
    Animated.sequence([
      Animated.spring(heart, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      Animated.delay(350),
      Animated.timing(heart, { toValue: 2, duration: 220, useNativeDriver: true }),
    ]).start();
  };

  const onPhotoPress = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      clearTimeout(singleTapTimer.current);
      lastTap.current = 0;
      popHeart();
      onDoubleTapLike?.();
      return;
    }
    lastTap.current = now;
    singleTapTimer.current = setTimeout(() => {
      lastTap.current = 0;
      onPress?.();
    }, DOUBLE_TAP_MS);
  };
  const cover = cloudinarySized(journal.photos?.[0]?.url, IMAGE_WIDTH.COVER);
  useEffect(() => setFailed(false), [cover]);
  const showPhoto = !!cover && !failed;
  const when = tripWhen(journal);
  const author = journal.author?.name || 'Traveller';
  const photoCount = journal.photos?.length || 0;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={`${journal.title}, a trip to ${journal.destination} by ${author}`}
      accessibilityHint="Double tap the photo to like. Long press for a preview."
      accessibilityActions={[{ name: 'like', label: 'Like' }, { name: 'preview', label: 'Preview' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'like') onToggleLike?.();
        if (e.nativeEvent.actionName === 'preview') onLongPress?.();
      }}
    >
      <Pressable
        style={styles.cover}
        onPress={onPhotoPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessible={false}
      >
        {showPhoto ? (
          <Image
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            onError={() => setFailed(true)}
          />
        ) : (
          <LinearGradient
            colors={fallbackGradientFor(journal.destination)}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
          style={styles.coverShade}
          pointerEvents="none"
        />
        <View style={styles.coverMeta}>
          <View style={styles.destPill}>
            <Ionicons name="location" size={12} color={COLORS.accent} />
            <Text style={styles.destText} numberOfLines={1}>{journal.destination}</Text>
          </View>
          {!!when && <Text style={styles.whenText}>{when}</Text>}
        </View>
        {!!badge && (
          <View style={styles.badge}>
            <Feather name="eye-off" size={11} color={COLORS.white} />
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        {photoCount > 1 && (
          <View style={styles.photoCount}>
            <Feather name="image" size={11} color={COLORS.white} />
            <Text style={styles.photoCountText}>{photoCount}</Text>
          </View>
        )}

        {/* Heart that pops on a double tap. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.burst,
            {
              opacity: heart.interpolate({ inputRange: [0, 0.2, 1, 2], outputRange: [0, 1, 1, 0] }),
              transform: [{ scale: heart.interpolate({ inputRange: [0, 1, 2], outputRange: [0.3, 1, 1.25] }) }],
            },
          ]}
        >
          <Ionicons name="heart" size={84} color={LIKE_RED} />
        </Animated.View>
      </Pressable>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{journal.title}</Text>
        {!!journal.body && <Text style={styles.excerpt} numberOfLines={2}>{excerpt(journal.body)}</Text>}

        {journal.vibes?.length > 0 && (
          <View style={styles.vibes}>
            {journal.vibes.slice(0, 3).map((v) => (
              <View key={v} style={styles.vibe}>
                <Text style={styles.vibeText}>{vibeLabel(v)}</Text>
              </View>
            ))}
            {journal.vibes.length > 3 && <Text style={styles.vibeMore}>+{journal.vibes.length - 3}</Text>}
          </View>
        )}

        <View style={styles.footer}>
          <View style={[styles.avatar, { backgroundColor: avatarColorFor(author) }]}>
            {journal.author?.photoUrl
              ? <Image source={{ uri: cloudinarySized(journal.author?.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} contentFit="cover" />
              : <Text style={styles.avatarText}>{initialsFor(author)}</Text>}
          </View>
          <View style={styles.authorText}>
            <Text style={styles.authorName} numberOfLines={1}>{author}</Text>
            <Text style={styles.posted}>{timeAgo(journal.publishedAt || journal.createdAt)}</Text>
          </View>

          <TouchableOpacity
            style={styles.stat}
            onPress={onToggleLike}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            accessibilityRole="button"
            accessibilityState={{ selected: !!journal.isLiked }}
            accessibilityLabel={`${journal.isLiked ? 'Unlike' : 'Like'}, ${journal.likesCount || 0} likes`}
          >
            <Ionicons
              name={journal.isLiked ? 'heart' : 'heart-outline'}
              size={19}
              color={journal.isLiked ? '#E05024' : COLORS.textSecondary}
            />
            <Text style={[styles.statText, journal.isLiked && styles.statTextLiked]}>{journal.likesCount || 0}</Text>
          </TouchableOpacity>
          <View style={styles.stat} accessible accessibilityLabel={`${journal.commentsCount || 0} comments`}>
            <Feather name="message-circle" size={17} color={COLORS.textSecondary} />
            <Text style={styles.statText}>{journal.commentsCount || 0}</Text>
          </View>
          {onMore && (
            <TouchableOpacity
              style={styles.more}
              onPress={onMore}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="More options for this story"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E9EDF1',
  },
  cover: {
    height: 190,
    justifyContent: 'flex-end',
  },
  coverShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  coverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.spacing_sm,
    padding: SIZES.spacing_md,
  },
  destPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  destText: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  whenText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },
  burst: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  photoCount: {
    position: 'absolute',
    top: SIZES.spacing_md,
    right: SIZES.spacing_md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  photoCountText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  body: {
    padding: SIZES.spacing_base,
  },
  title: {
    fontSize: SIZES.lg,
    lineHeight: 25,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  excerpt: {
    marginTop: 4,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  vibes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: SIZES.spacing_md,
  },
  vibe: {
    paddingHorizontal: SIZES.spacing_sm,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  vibeText: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  vibeMore: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_md,
    paddingTop: SIZES.spacing_md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  authorText: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  posted: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  statText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  statTextLiked: {
    color: '#E05024',
  },
  more: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F3F5',
  },
  badge: {
    position: 'absolute',
    top: SIZES.spacing_md,
    left: SIZES.spacing_md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(43, 63, 81, 0.85)',
  },
  badgeText: {
    fontSize: SIZES.xs + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
