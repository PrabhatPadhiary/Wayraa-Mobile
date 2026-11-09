import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/**
 * Full-screen photo viewer: black background, swipe left/right through the
 * photos, "3 / 12" counter and a close button. Photos are shown whole
 * (contain), and on iOS each can be pinch-zoomed.
 *
 * @param {boolean} visible
 * @param {string[]} photos       image URLs
 * @param {number} [initialIndex] photo to open on
 * @param {() => void} onClose
 */
export default function PhotoViewer({ visible, photos = [], initialIndex = 0, onClose }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  const renderPhoto = ({ item }) => (
    // iOS ScrollView zooms natively; on Android it's a plain container.
    <ScrollView
      style={{ width, height }}
      contentContainerStyle={styles.center}
      maximumZoomScale={3}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      centerContent
      bouncesZoom
    >
      <Image source={{ uri: item }} style={{ width, height }} contentFit="contain" transition={150} />
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      supportedOrientations={['portrait']}
    >
      <View style={styles.backdrop}>
        <StatusBar barStyle="light-content" />
        <FlatList
          data={photos}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          renderItem={renderPhoto}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(initialIndex, Math.max(0, photos.length - 1))}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        />

        <View style={[styles.topBar, { top: insets.top + (Platform.OS === 'android' ? SIZES.spacing_md : SIZES.spacing_sm) }]}>
          {photos.length > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>{index + 1} / {photos.length}</Text>
            </View>
          ) : <View />}
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            hitSlop={10}
          >
            <Feather name="x" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    position: 'absolute',
    left: SIZES.spacing_base,
    right: SIZES.spacing_base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    paddingHorizontal: SIZES.spacing_md,
    paddingVertical: 4,
    borderRadius: SIZES.radius_full,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  counterText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
});
