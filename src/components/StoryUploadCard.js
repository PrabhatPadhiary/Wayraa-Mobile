import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/**
 * Instagram-style "posting…" card shown at the top of the Community feed
 * while a story uploads in the background (see services/storyUpload).
 *
 *  - uploading: cover thumbnail, "Uploading photo 2 of 5…", animated bar
 *  - error:     what went wrong, with Retry and Discard
 *  - done:      "Posted" with a View button (the feed refreshes itself)
 *
 * @param {object} upload       state from services/storyUpload
 * @param {() => void} onRetry
 * @param {() => void} onDismiss
 * @param {() => void} onView   open the new story (done state)
 */
export default function StoryUploadCard({ upload, onRetry, onDismiss, onView }) {
  const width = useRef(new Animated.Value(upload.progress || 0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: upload.progress || 0,
      duration: 350,
      useNativeDriver: false, // animating width
    }).start();
  }, [upload.progress, width]);

  const isError = upload.status === 'error';
  const isDone = upload.status === 'done';
  const headline = isDone
    ? (upload.visibility === 'private' ? 'Saved privately' : 'Posted to Community')
    : isError ? 'Couldn\'t post your story' : upload.message;

  return (
    <View
      style={[styles.card, isError && styles.cardError]}
      accessible={!isError && !isDone}
      accessibilityRole="progressbar"
      accessibilityLabel={`${headline}. ${Math.round((upload.progress || 0) * 100)} percent`}
    >
      <View style={styles.row}>
        <View style={styles.thumb}>
          {upload.coverUri ? (
            <Image source={{ uri: upload.coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Feather name="image" size={18} color={COLORS.textMuted} />
          )}
          {isDone && (
            <View style={styles.doneBadge}>
              <Feather name="check" size={12} color={COLORS.white} />
            </View>
          )}
        </View>

        <View style={styles.text}>
          <Text style={[styles.headline, isError && styles.headlineError]} numberOfLines={1}>{headline}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {isError ? upload.error : upload.title}
          </Text>
        </View>

        {upload.status === 'uploading' && <ActivityIndicator size="small" color={COLORS.accent} />}
        {isError && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.retry} onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry posting">
              <Feather name="rotate-cw" size={14} color={COLORS.white} />
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Discard this story">
              <Feather name="x" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
        {isDone && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.view} onPress={onView} accessibilityRole="button" accessibilityLabel="View your story">
              <Text style={styles.viewText}>View</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {!isDone && (
        <View style={styles.track}>
          <Animated.View
            style={[
              styles.fill,
              isError && styles.fillError,
              { width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: SIZES.spacing_md,
    marginBottom: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e9edf1',
  },
  cardError: {
    borderColor: '#f5c2c0',
    backgroundColor: '#fffafa',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: SIZES.radius_sm,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  doneBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.success,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  headline: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  headlineError: {
    color: '#c62828',
  },
  sub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
  },
  retryText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  view: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#e6f4fb',
  },
  viewText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
  },
  track: {
    height: 4,
    marginTop: SIZES.spacing_md,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: COLORS.borderLight,
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  fillError: {
    backgroundColor: '#e57373',
  },
});
