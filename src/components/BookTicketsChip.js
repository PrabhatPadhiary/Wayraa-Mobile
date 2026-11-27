import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES } from '../constants';
import ActivityOfferCard, { formatOfferPrice } from './ActivityOfferCard';
import { useActivityOffers, OffersDisclosure } from './BookableActivities';
import { openOffer } from '../services/offersService';

/**
 * "Book tickets · from ₹2,000" under an activity on the plan. Only shows when
 * Viator has tours for that exact place; tapping opens a sheet with them.
 *
 * @param {string} name   the stop's name
 * @param {number} lat
 * @param {number} lng
 * @param {object} [style]
 */
export default function BookTicketsChip({ name, lat, lng, style }) {
  const { result } = useActivityOffers({ kind: 'place', name, lat, lng, exact: true });
  const [open, setOpen] = useState(false);
  const items = result?.items || [];
  if (items.length === 0) return null;

  const prices = items.map((i) => Number(i.fromPrice)).filter((n) => n > 0);
  const cheapest = prices.length ? formatOfferPrice(Math.min(...prices), items[0].currency) : null;

  return (
    <>
      <TouchableOpacity
        style={[styles.chip, style]}
        onPress={() => { Haptics.selectionAsync().catch(() => {}); setOpen(true); }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Book tickets for ${name}${cheapest ? `, from ${cheapest}` : ''}`}
        hitSlop={6}
      >
        <Ionicons name="ticket-outline" size={13} color={COLORS.accentDeep} />
        <Text style={styles.chipText} numberOfLines={1}>
          Book tickets{cheapest ? <Text style={styles.chipPrice}>{`  ·  from ${cheapest}`}</Text> : null}
        </Text>
      </TouchableOpacity>
      <ActivityOffersSheet visible={open} onClose={() => setOpen(false)} title={name} result={result} />
    </>
  );
}

/** A sheet listing tours and tickets for one place. */
export function ActivityOffersSheet({ visible, onClose, title, result }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = width - SIZES.spacing_lg * 2;
  const items = result?.items || [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>Tours & tickets</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{title}</Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
              <Feather name="x" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {items.map((offer) => (
              <ActivityOfferCard
                key={offer.id}
                offer={offer}
                width={cardWidth}
                onPress={() => {
                  // Close the sheet, then show the tour's page.
                  onClose();
                  navigation.navigate('ActivityDetail', { offer, areaName: result?.areaName });
                }}
                onBook={() => { Haptics.selectionAsync().catch(() => {}); openOffer(offer.bookingUrl); }}
              />
            ))}
            {!!result?.seeAllUrl && (
              <TouchableOpacity style={styles.seeAll} onPress={() => openOffer(result.seeAllUrl)} activeOpacity={0.85} accessibilityRole="link">
                <Text style={styles.seeAllText}>See all tours in {result.areaName || 'this area'} on Viator</Text>
                <Feather name="arrow-up-right" size={15} color={COLORS.accentDeep} />
              </TouchableOpacity>
            )}
            <OffersDisclosure style={styles.disclosure} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: SIZES.spacing_sm + 2,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  chipText: {
    flexShrink: 1,
    fontSize: SIZES.xs + 1,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  chipPrice: {
    fontFamily: 'Poppins_500Medium',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    maxHeight: '85%',
    paddingTop: SIZES.spacing_lg,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: COLORS.backgroundWarm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginBottom: SIZES.spacing_base,
    paddingHorizontal: SIZES.spacing_lg,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  list: {
    paddingHorizontal: SIZES.spacing_lg,
    gap: SIZES.spacing_md,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SIZES.spacing_md,
  },
  seeAllText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  disclosure: {
    textAlign: 'center',
    marginTop: 0,
  },
});
