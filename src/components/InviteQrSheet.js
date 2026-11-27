import React, { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { COLORS, SIZES } from '../constants';

/**
 * The trip's invite QR, big enough to scan from across a table. A friend
 * points their phone camera at it and lands on the trip's join page (the
 * app on Android, the website on iPhone). "Share link" sends the same link
 * another way.
 *
 * @param {boolean} visible
 * @param {string} tripName
 * @param {string|null} link     the trip's invite link (editor role)
 * @param {() => void} onShare
 * @param {() => void} onClose
 * @param {string[]} [joined]   people who joined while it's open (live), newest last
 */
export default function InviteQrSheet({ visible, tripName, link, onShare, onClose, joined = [] }) {
  const insets = useSafeAreaInsets();
  // Someone just joined: a success buzz (the banner says who).
  const seen = useRef(joined.length);
  useEffect(() => {
    if (visible && joined.length > seen.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    seen.current = joined.length;
  }, [joined.length, visible]);
  const joinedText = joined.length === 1 ? `${joined[0]} joined the trip`
    : joined.length === 2 ? `${joined[0]} and ${joined[1]} joined`
      : `${joined[joined.length - 1]} and ${joined.length - 1} others joined`;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.card, { marginBottom: insets.bottom + SIZES.spacing_lg }]}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
            <Feather name="x" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
          {joined.length > 0 && (
            <View style={styles.joined} accessibilityLiveRegion="polite" accessible accessibilityLabel={joinedText}>
              <Ionicons name="checkmark-circle" size={18} color="#2F7A52" />
              <Text style={styles.joinedText} numberOfLines={1}>{joinedText}</Text>
            </View>
          )}
          <Text style={styles.eyebrow}>SCAN TO JOIN</Text>
          <Text style={styles.title} numberOfLines={2}>{tripName}</Text>
          <View style={styles.qr} accessible accessibilityLabel={`QR code to join ${tripName}`}>
            {link
              ? <QRCode value={link} size={220} color={COLORS.textPrimary} backgroundColor={COLORS.white} ecl="M" />
              : <Text style={styles.noLink}>Invite link not available. Check your connection.</Text>}
          </View>
          <Text style={styles.hint}>Point a phone camera at the code. They'll join as an editor.</Text>
          <TouchableOpacity style={styles.share} onPress={onShare} disabled={!link} activeOpacity={0.88} accessibilityRole="button">
            <Ionicons name="share-outline" size={18} color={COLORS.white} />
            <Text style={styles.shareText}>Share link instead</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.spacing_lg,
    backgroundColor: 'rgba(16, 24, 32, 0.6)',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    padding: SIZES.spacing_lg,
  },
  close: {
    position: 'absolute',
    top: SIZES.spacing_md,
    right: SIZES.spacing_md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.backgroundWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "Satish joined the trip": live, while the code is up.
  joined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '82%',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E7F4EC',
    marginBottom: SIZES.spacing_sm,
  },
  joinedText: {
    flexShrink: 1,
    fontSize: SIZES.sm + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: '#2F7A52',
  },
  eyebrow: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_700Bold',
    letterSpacing: 1.4,
    color: COLORS.accentDeep,
    marginTop: SIZES.spacing_xs,
  },
  title: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: 2,
    paddingHorizontal: SIZES.spacing_xl,
  },
  qr: {
    marginTop: SIZES.spacing_lg,
    padding: SIZES.spacing_md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    minHeight: 244,
    minWidth: 244,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noLink: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    textAlign: 'center',
    maxWidth: 200,
  },
  hint: {
    fontSize: SIZES.sm + 1,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.spacing_md,
  },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.spacing_sm,
    alignSelf: 'stretch',
    minHeight: 50,
    marginTop: SIZES.spacing_lg,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
  },
  shareText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
