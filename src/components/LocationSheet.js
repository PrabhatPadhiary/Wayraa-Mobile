import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import PlaceSearchField from './PlaceSearchField';
import { getPlaceDetails, placeCoords } from '../services';
import { getRecentCities } from '../services/exploreCity';

/**
 * "Your location" sheet (from the top of Home): use where you are, or explore
 * another city, so Home's Near you and the categories' "near you" show places
 * around it.
 *
 *  - Use my current location: back to (or turn on) your real location.
 *  - Search a city: any city or region.
 *  - Recent: cities picked before, one tap.
 *
 * @param {boolean} visible
 * @param {string|null} currentLabel   where you are now ("Bengaluru"), if known
 * @param {object|null} exploring      the city being explored, if any
 * @param {() => void} onUseCurrent
 * @param {(city: { placeId, name, secondary, lat, lng }) => void} onPickCity
 * @param {() => void} onClose
 */
export default function LocationSheet({ visible, currentLabel, exploring, onUseCurrent, onPickCity, onClose }) {
  const insets = useSafeAreaInsets();
  const [recent, setRecent] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setResolving(false);
    getRecentCities().then(setRecent);
  }, [visible]);

  // A search result has no coordinates yet: look them up first.
  const pickResult = async (result) => {
    setError('');
    setResolving(true);
    const details = await getPlaceDetails(result.placeId);
    const c = placeCoords(details);
    setResolving(false);
    if (!c) {
      setError(`Couldn't find ${result.name} on the map. Try another city.`);
      return;
    }
    onPickCity({ placeId: result.placeId, name: result.name, secondary: result.secondary || '', lat: c.lat, lng: c.lng });
  };

  const usingCurrent = !exploring;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Your location</Text>
              <Text style={styles.subtitle}>Places near you are shown around here</Text>
            </View>
            <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close" hitSlop={8}>
              <Feather name="x" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Where you are */}
            <TouchableOpacity
              style={[styles.row, usingCurrent && styles.rowOn]}
              onPress={onUseCurrent}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: usingCurrent }}
            >
              <View style={[styles.icon, styles.iconCurrent]}>
                <Ionicons name="navigate" size={17} color={COLORS.white} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Use my current location</Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {currentLabel ? `${currentLabel} · right now` : 'Turn on location to find places near you'}
                </Text>
              </View>
              {usingCurrent && <Ionicons name="checkmark-circle" size={20} color={COLORS.primaryLight} />}
            </TouchableOpacity>

            {/* Another city */}
            <Text style={styles.label}>Explore another city</Text>
            <PlaceSearchField
              onSelect={pickResult}
              placeholder="Search a city, e.g. Goa, Jaipur, Dubai"
              icon="search"
              regionsOnly
            />
            {resolving && (
              <View style={styles.resolving}>
                <ActivityIndicator size="small" color={COLORS.primaryLight} />
                <Text style={styles.rowSub}>Finding it on the map…</Text>
              </View>
            )}
            {!!error && <Text style={styles.error}>{error}</Text>}

            {/* Picked before */}
            {recent.length > 0 && (
              <>
                <Text style={styles.label}>Recent</Text>
                {recent.map((c) => {
                  const on = exploring?.placeId === c.placeId;
                  return (
                    <TouchableOpacity
                      key={c.placeId}
                      style={[styles.row, on && styles.rowOn]}
                      onPress={() => onPickCity(c)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                    >
                      <View style={styles.icon}>
                        <Ionicons name="time-outline" size={17} color={COLORS.primaryLight} />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{c.name}</Text>
                        {!!c.secondary && <Text style={styles.rowSub} numberOfLines={1}>{c.secondary}</Text>}
                      </View>
                      {on && <Ionicons name="checkmark-circle" size={20} color={COLORS.primaryLight} />}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    maxHeight: '85%',
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    marginBottom: SIZES.spacing_base,
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
    backgroundColor: COLORS.cardBackground,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rowOn: {
    borderColor: COLORS.primaryLight,
    backgroundColor: COLORS.cardBackground,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundWarm,
  },
  iconCurrent: {
    backgroundColor: COLORS.primaryLight,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  rowSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  label: {
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  resolving: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_sm,
  },
  error: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
  },
});
