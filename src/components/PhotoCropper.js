import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import {
  GestureHandlerRootView,
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
} from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { avatarColorFor, initialsFor } from '../utils/avatars';
import { showAlert } from './AppDialog';

// What each kind crops to: shape, and the size of the saved image.
const KINDS = {
  avatar: { aspect: 1, round: true, outWidth: 600, title: 'Profile photo' },
  cover: { aspect: 3 / 2, round: false, outWidth: 1600, title: 'Cover photo' },
};
// Largest side kept while cropping (bounds memory, and fixes rotation).
const WORK_MAX = 2400;
const MAX_ZOOM = 4;
// Wide enough to dim the whole screen around the frame's hole.
const MASK = 2000;
// The profile banner's shape (scene units: 400 wide, 262 shown).
const BANNER_ASPECT = 400 / 262;

function clamp(v, min, max) {
  'worklet';
  return Math.min(Math.max(v, min), max);
}

/**
 * Full-screen cropper for the profile photo or the cover photo. Drag to
 * move and pinch to zoom inside the frame, tap Choose, check the preview
 * (how it looks on your profile), then Done hands back the cropped image.
 *
 * @param {object|null} asset   picked image ({ uri, width, height }), null = closed
 * @param {'avatar'|'cover'} kind
 * @param {string} name         your name (for the preview)
 * @param {string|null} photo   your current profile photo (cover preview)
 * @param {(image: {uri, width, height}) => void} onDone
 * @param {() => void} onCancel
 */
export default function PhotoCropper({ asset, kind = 'avatar', name, photo, onDone, onCancel }) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const cfg = KINDS[kind];

  const [source, setSource] = useState(null); // the working copy: { uri, width, height }
  const [step, setStep] = useState('crop'); // 'crop' | 'preview'
  const [result, setResult] = useState(null); // the cropped image
  const [busy, setBusy] = useState(false);

  // The frame, centred in the space between the top bar and the buttons.
  const areaH = H - insets.top - insets.bottom - 56 - 150;
  let frameW = cfg.round ? Math.min(W - 48, areaH - 48) : W;
  let frameH = frameW / cfg.aspect;
  if (frameH > areaH) { frameH = areaH; frameW = frameH * cfg.aspect; }

  // The image covers the frame at zoom 1.
  const base = source ? Math.max(frameW / source.width, frameH / source.height) : 1;
  const imgW = source ? source.width * base : frameW;
  const imgH = source ? source.height * base : frameH;

  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // A fresh working copy each time a photo is picked: rotated upright and
  // no larger than WORK_MAX, so the crop maths match what's saved.
  useEffect(() => {
    if (!asset) return undefined;
    let cancelled = false;
    setSource(null);
    setStep('crop');
    setResult(null);
    zoom.value = 1;
    tx.value = 0;
    ty.value = 0;
    (async () => {
      try {
        const ctx = ImageManipulator.manipulate(asset.uri);
        const big = Math.max(asset.width || 0, asset.height || 0);
        if (!big || big > WORK_MAX) {
          if ((asset.width || 0) >= (asset.height || 0)) ctx.resize({ width: WORK_MAX });
          else ctx.resize({ height: WORK_MAX });
        }
        const image = await ctx.renderAsync();
        const saved = await image.saveAsync({ compress: 1, format: SaveFormat.JPEG });
        if (!cancelled) setSource(saved);
      } catch (e) {
        if (!cancelled) {
          showAlert('Couldn\'t open that photo', e?.message || 'Please try another one.');
          onCancel?.();
        }
      }
    })();
    return () => { cancelled = true; };
  }, [asset]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = usePanGesture({
    onActivate: () => {
      'worklet';
      startX.value = tx.value;
      startY.value = ty.value;
    },
    onUpdate: (e) => {
      'worklet';
      const maxX = Math.max(0, (imgW * zoom.value - frameW) / 2);
      const maxY = Math.max(0, (imgH * zoom.value - frameH) / 2);
      tx.value = clamp(startX.value + e.translationX, -maxX, maxX);
      ty.value = clamp(startY.value + e.translationY, -maxY, maxY);
    },
  });
  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      startZoom.value = zoom.value;
    },
    onUpdate: (e) => {
      'worklet';
      zoom.value = clamp(startZoom.value * e.scale, 1, MAX_ZOOM);
      // Zooming out can leave a gap at an edge: pull the photo back in.
      const maxX = Math.max(0, (imgW * zoom.value - frameW) / 2);
      const maxY = Math.max(0, (imgH * zoom.value - frameH) / 2);
      tx.value = clamp(tx.value, -maxX, maxX);
      ty.value = clamp(ty.value, -maxY, maxY);
    },
  });
  const gesture = useSimultaneousGestures(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }],
  }));

  // Choose: cut out what's inside the frame, then show the preview.
  const choose = async () => {
    if (!source || busy) return;
    setBusy(true);
    try {
      const k = base * zoom.value;
      const width = Math.min(source.width, Math.round(frameW / k));
      const height = Math.min(source.height, Math.round(frameH / k));
      const originX = clamp(Math.round(((imgW * zoom.value - frameW) / 2 - tx.value) / k), 0, source.width - width);
      const originY = clamp(Math.round(((imgH * zoom.value - frameH) / 2 - ty.value) / k), 0, source.height - height);
      const ctx = ImageManipulator.manipulate(source.uri).crop({ originX, originY, width, height });
      if (width > cfg.outWidth) ctx.resize({ width: cfg.outWidth });
      const image = await ctx.renderAsync();
      const saved = await image.saveAsync({ compress: 1, format: SaveFormat.JPEG });
      setResult(saved);
      setStep('preview');
    } catch (e) {
      showAlert('Couldn\'t crop that photo', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const renderCrop = () => (
    <>
      <View style={styles.area}>
        {source ? (
          <GestureDetector gesture={gesture}>
            <View style={styles.touch}>
              <Animated.View style={[{ width: imgW, height: imgH }, imageStyle]}>
                <Image source={{ uri: source.uri }} style={styles.fill} contentFit="cover" />
              </Animated.View>
              {/* Dim everything outside the frame: a thick border around a
                  hole the frame's size (round for the profile photo). */}
              <View
                pointerEvents="none"
                style={[
                  styles.mask,
                  {
                    width: frameW + MASK * 2,
                    height: frameH + MASK * 2,
                    borderRadius: cfg.round ? frameW / 2 + MASK : 0,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[styles.frameLine, { width: frameW, height: frameH, borderRadius: cfg.round ? frameW / 2 : 0 }]}
              />
            </View>
          </GestureDetector>
        ) : (
          <ActivityIndicator color={COLORS.white} />
        )}
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + SIZES.spacing_lg }]}>
        <Text style={styles.hint}>Drag to move, pinch to zoom</Text>
        <TouchableOpacity
          style={[styles.primary, (!source || busy) && styles.disabled]}
          onPress={choose}
          disabled={!source || busy}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.primaryText}>Choose</Text>}
        </TouchableOpacity>
      </View>
    </>
  );

  const renderPreview = () => {
    const avatarSize = 88;
    const yourAvatar = (uri, size) => (uri ? (
      <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
    ) : (
      <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColorFor(name) }]}>
        <Text style={[styles.initialsText, { fontSize: size * 0.36 }]}>{initialsFor(name)}</Text>
      </View>
    ));
    return (
      <>
        <View style={styles.area}>
          {/* How it looks on your profile: banner, sheet, photo and name. */}
          <View style={styles.card}>
            {kind === 'cover' ? (
              <Image source={{ uri: result.uri }} style={{ width: '100%', aspectRatio: BANNER_ASPECT }} contentFit="cover" />
            ) : (
              <View style={[styles.cardBanner, { aspectRatio: BANNER_ASPECT * 1.6 }]} />
            )}
            <View style={styles.cardSheet}>
              <View style={[styles.cardAvatar, { marginTop: -(avatarSize / 2 + 4) }]}>
                {yourAvatar(kind === 'avatar' ? result.uri : photo, avatarSize)}
              </View>
              <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
              {kind === 'avatar' && (
                // And small, as it shows on your stories and comments.
                <View style={styles.cardRow}>
                  {yourAvatar(result.uri, 32)}
                  <Text style={styles.cardRowText} numberOfLines={1}>{name}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <View style={[styles.bottom, styles.bottomRow, { paddingBottom: insets.bottom + SIZES.spacing_lg }]}>
          <TouchableOpacity style={styles.secondary} onPress={() => setStep('crop')} accessibilityRole="button">
            <Text style={styles.secondaryText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primary, styles.flex]} onPress={() => onDone?.(result)} accessibilityRole="button">
            <Text style={styles.primaryText}>Done</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
    <Modal visible={!!asset} animationType="slide" onRequestClose={step === 'preview' ? () => setStep('crop') : onCancel}>
      {/* A Modal renders outside the app's GestureHandlerRootView, so it needs its own. */}
      <GestureHandlerRootView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.topBar, { marginTop: insets.top }]}>
          <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Cancel">
            <Feather name="x" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.title}>{step === 'crop' ? cfg.title : 'Preview'}</Text>
          <View style={styles.topSpacer} />
        </View>
        {step === 'preview' && result ? renderPreview() : renderCrop()}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  flex: {
    flex: 1,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZES.spacing_base,
  },
  topSpacer: {
    width: 24,
  },
  title: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: SIZES.lg,
    color: COLORS.white,
  },
  area: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  touch: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // RN 0.88: spreading absoluteFillObject does nothing, so spelled out.
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mask: {
    position: 'absolute',
    borderWidth: MASK,
    borderColor: 'rgba(0,0,0,0.6)',
  },
  frameLine: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  bottom: {
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_base,
    gap: SIZES.spacing_base,
  },
  bottomRow: {
    flexDirection: 'row',
  },
  hint: {
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
    fontSize: SIZES.sm,
    color: 'rgba(255,255,255,0.7)',
  },
  primary: {
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  primaryText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: SIZES.md,
    color: COLORS.white,
  },
  disabled: {
    opacity: 0.5,
  },
  secondary: {
    height: 50,
    paddingHorizontal: SIZES.spacing_xl,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  secondaryText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: SIZES.md,
    color: COLORS.white,
  },
  card: {
    width: '88%',
    borderRadius: SIZES.radius_xl,
    overflow: 'hidden',
    backgroundColor: COLORS.backgroundWarm,
  },
  cardBanner: {
    width: '100%',
    backgroundColor: '#D9F0FA',
  },
  cardSheet: {
    alignItems: 'center',
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_lg,
  },
  cardAvatar: {
    padding: 4,
    borderRadius: 100,
    backgroundColor: COLORS.white,
  },
  cardName: {
    marginTop: SIZES.spacing_sm,
    fontFamily: 'Poppins_700Bold',
    fontSize: SIZES.lg,
    color: COLORS.textPrimary,
  },
  cardRow: {
    marginTop: SIZES.spacing_base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    alignSelf: 'stretch',
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.white,
  },
  cardRowText: {
    flex: 1,
    fontFamily: 'Poppins_600SemiBold',
    fontSize: SIZES.md,
    color: COLORS.textPrimary,
  },
  initials: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
});
