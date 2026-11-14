import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { COLORS, SIZES } from '../constants';
import { showAlert } from './AppDialog';

/**
 * "Satish added Burj Khalifa": a short note at the top of the trip screen when
 * someone else changes the trip. Fades in, stays a few seconds, fades out.
 * Announced to screen readers. Pass `toast` = { key, text, initials } or null.
 */
export default function LiveToast({ toast, top = 0 }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: toast ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [toast, opacity]);

  if (!toast) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { top, opacity }]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{toast.initials || '•'}</Text>
      </View>
      <Text style={styles.text} numberOfLines={2}>{toast.text}</Text>
    </Animated.View>
  );
}

/** The toast line for a change from useTripLive, e.g. "Satish added Burj Khalifa". */
export function describeTripChange(change) {
  const who = (change.actorName || 'Someone').trim().split(/\s+/)[0];
  const item = change.itemName;
  const a = change.action;
  switch (change.section) {
    case 'spots':
      return a === 'added' ? `${who} saved ${item || 'a spot'}` : `${who} removed a saved spot`;
    case 'itinerary':
      if (a === 'added') return `${who} added ${item || 'a stop'} to the itinerary`;
      if (a === 'removed') return `${who} removed something from the itinerary`;
      return `${who} updated the itinerary`;
    case 'budget':
      if (a === 'added') return `${who} added an expense${item ? `: ${item}` : ''}`;
      if (a === 'removed') return `${who} removed an expense`;
      return `${who} updated the budget`;
    case 'checklist':
      if (a === 'added') return `${who} added ${item ? `"${item}"` : 'an item'} to the checklist`;
      if (a === 'removed') return `${who} removed a checklist item`;
      return `${who} updated the checklist`;
    case 'stops':
      if (a === 'added') return `${who} added ${item || 'a stop'} to the trip`;
      if (a === 'removed') return `${who} removed a stop`;
      return `${who} changed the stops`;
    case 'travellers': {
      if (a === 'joined') return `${who} joined the trip`;
      const whom = change.targetIsMe
        ? 'you'
        : (change.targetName || '').trim().split(/\s+/)[0] || 'a traveller';
      if (a === 'removed') return `${who} removed ${whom} from the trip`;
      if (change.role === 'viewer') return `${who} made ${whom} a viewer`;
      if (change.role === 'member') return `${who} made ${whom} an editor`;
      return `${who} changed ${whom === 'you' ? 'your' : `${whom}'s`} role`;
    }
    case 'trip':
      return `${who} deleted this trip`;
    default:
      return `${who} updated the trip`;
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_sm,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.primary,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  text: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },
});

/**
 * Who else has this trip open, for the trip screen's header: up to three small
 * faces with a green "here now" dot, beside the ⋯ button. Tap for their names.
 * Renders nothing when nobody else is here. `viewers` = [{ userId, name, photoUrl }].
 */
export function ViewerFaces({ viewers, style }) {
  if (!viewers?.length) return null;
  const names = viewers.map((v) => (v.name || 'Someone').trim().split(/\s+/)[0]);
  const sentence = names.length === 1
    ? `${names[0]} is viewing this trip now.`
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are viewing this trip now.`;
  const shown = viewers.slice(0, 3);
  const extra = viewers.length - shown.length;
  return (
    <TouchableOpacity
      style={[viewerStyles.faces, style]}
      onPress={() => showAlert('Here now', sentence)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={sentence}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      {shown.map((v, i) => (
        <View key={v.userId} style={[viewerStyles.face, i > 0 && viewerStyles.faceOverlap, { zIndex: 10 - i }]}>
          <View style={viewerStyles.faceInner}>
            {v.photoUrl
              ? <Image source={{ uri: v.photoUrl }} style={viewerStyles.photo} contentFit="cover" />
              : <Text style={viewerStyles.initials}>{initialsOf(v.name)}</Text>}
          </View>
          <View style={viewerStyles.dot} />
        </View>
      ))}
      {extra > 0 && (
        <View style={[viewerStyles.face, viewerStyles.faceOverlap]}>
          <View style={[viewerStyles.faceInner, viewerStyles.more]}>
            <Text style={viewerStyles.moreText}>+{extra}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '•';
}

const FACE = 30;
const viewerStyles = StyleSheet.create({
  faces: { flexDirection: 'row', alignItems: 'center' },
  face: { width: FACE, height: FACE },
  faceOverlap: { marginLeft: -9 },
  faceInner: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    borderWidth: 2,
    borderColor: COLORS.white,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: { width: '100%', height: '100%' },
  initials: { fontSize: 11, fontFamily: 'Poppins_700Bold', color: COLORS.white },
  more: { backgroundColor: COLORS.primary },
  moreText: { fontSize: 10, fontFamily: 'Poppins_700Bold', color: COLORS.white },
  // "Here now": bottom-right of each face.
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.white,
    backgroundColor: '#43A474',
  },
});
