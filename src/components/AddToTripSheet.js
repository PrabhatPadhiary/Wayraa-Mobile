import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import {
  getMyTrips,
  getTripById,
  addPlaceToTrip,
  AuthRequiredError,
} from '../services';
import { TRIP_CATEGORIES, toTripCategory, buildTripPlaceDto } from '../utils/tripPlaces';
import { formatDateRange } from '../utils/tripDates';

const MAX_SHEET_HEIGHT = Dimensions.get('window').height * 0.86;

/**
 * Bottom sheet for saving a place to one of the user's trips.
 *
 * Flow: choose a trip (completed trips are hidden, trips that already have the
 * place show "Added", view-only trips are disabled) -> choose a destination if
 * the trip has several -> choose a category -> confirm.
 *
 * With `preselect` the trip (and optionally destination) is fixed, so the
 * "choose trip" step is skipped.
 *
 * @param {boolean} visible
 * @param {object} place  { placeId, name, vicinity, rating, userRatingsTotal,
 *   category, photos[], geometry, previewUrl } as returned by the places API
 * @param {{ tripId: string, destinationId?: string, tripName?: string }} [preselect]
 * @param {() => void} onClose
 * @param {() => void} [onSignIn]
 * @param {() => void} [onCreateTrip]
 * @param {(tripId: string, tripName: string) => void} [onViewTrip]
 * @param {(result: object) => void} [onAdded]
 */
export default function AddToTripSheet({
  visible,
  place,
  preselect,
  onClose,
  onSignIn,
  onCreateTrip,
  onViewTrip,
  onAdded,
}) {
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState('loading'); // loading | ready | signin | error | done
  const [trips, setTrips] = useState([]);
  const [tripId, setTripId] = useState('');
  const [destinations, setDestinations] = useState([]); // { id, name, hasPlace }
  const [destId, setDestId] = useState('');
  const [destsLoading, setDestsLoading] = useState(false);
  const [category, setCategory] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(null);
  // Latest trip the user tapped, to ignore slow responses for an older tap.
  const latestTripRef = useRef('');

  const placeId = place?.placeId;
  const preTripId = preselect?.tripId;
  const preDestId = preselect?.destinationId;

  const applyTrip = (full, wantedDestId) => {
    const sorted = [...(full?.destinations || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const mapped = sorted.map((d) => ({
      id: d.id,
      name: d.name,
      hasPlace: (d.places || []).some((p) => p.placeId === placeId),
    }));
    setDestinations(mapped);
    const wanted = mapped.find((d) => d.id === wantedDestId);
    setDestId((wanted || mapped[0])?.id || '');
  };

  // (Re)load whenever the sheet opens.
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;

    setStatus('loading');
    setMessage('');
    setDone(null);
    setSubmitting(false);
    setCategory(toTripCategory(place?.category));
    setTripId(preTripId || '');
    latestTripRef.current = preTripId || '';
    setDestinations([]);
    setDestId('');

    (async () => {
      try {
        if (preTripId) {
          const full = await getTripById(preTripId);
          if (cancelled) return;
          setTrips([{ id: full.id, name: full.name }]);
          applyTrip(full, preDestId);
        } else {
          const all = await getMyTrips();
          if (cancelled) return;
          setTrips(all.filter((t) => (t.status || '').toLowerCase() !== 'completed'));
        }
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        if (e instanceof AuthRequiredError) {
          setStatus('signin');
        } else {
          setMessage(e?.message || 'Could not load your trips.');
          setStatus('error');
        }
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, placeId, preTripId, preDestId]);

  const tripDisabledReason = (trip) => {
    if (Array.isArray(trip.placeIds) && trip.placeIds.includes(placeId)) return 'Added';
    if ((trip.myRole || '').toLowerCase() === 'viewer') return 'View only';
    return null;
  };

  const selectTrip = async (trip) => {
    if (tripDisabledReason(trip)) return;
    setTripId(trip.id);
    latestTripRef.current = trip.id;
    setDestinations([]);
    setDestId('');
    setMessage('');
    setDestsLoading(true);
    try {
      const full = await getTripById(trip.id);
      if (latestTripRef.current !== trip.id) return;
      applyTrip(full);
    } catch (e) {
      if (latestTripRef.current === trip.id) setMessage('Could not load this trip. Try again.');
    } finally {
      if (latestTripRef.current === trip.id) setDestsLoading(false);
    }
  };

  const selectedDest = destinations.find((d) => d.id === destId);
  const alreadyThere = !!selectedDest?.hasPlace;
  const canConfirm = !!tripId && !!destId && !!category && !alreadyThere && !submitting && !destsLoading;

  const confirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setMessage('');
    try {
      const res = await addPlaceToTrip(tripId, destId, buildTripPlaceDto(place, category));
      const trip = trips.find((t) => t.id === tripId);
      setDone({
        tripId,
        tripName: trip?.name || preselect?.tripName || 'your trip',
        destName: selectedDest?.name || '',
        already: res.alreadyAdded,
      });
      setStatus('done');
      if (onAdded) onAdded({ tripId, destinationId: destId, tripPlaceId: res.id, alreadyAdded: res.alreadyAdded });
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        setStatus('signin');
      } else {
        setMessage(e?.message || 'That place could not be added.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderTripRow = (trip) => {
    const reason = tripDisabledReason(trip);
    const selected = tripId === trip.id;
    const dates = formatDateRange(trip.startDate, trip.endDate);
    return (
      <TouchableOpacity
        key={trip.id}
        style={[styles.tripRow, selected && styles.tripRowSelected, !!reason && styles.tripRowDisabled]}
        onPress={() => selectTrip(trip)}
        disabled={!!reason}
        activeOpacity={0.85}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: !!reason }}
        accessibilityLabel={`${trip.name}${reason ? `, ${reason}` : ''}`}
      >
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
        <View style={styles.tripRowText}>
          <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
          {!!dates && <Text style={styles.tripDates} numberOfLines={1}>{dates}</Text>}
        </View>
        {!!reason && <Text style={styles.reason}>{reason}</Text>}
      </TouchableOpacity>
    );
  };

  const renderBody = () => {
    if (status === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      );
    }

    if (status === 'signin') {
      return (
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={36} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Sign in to plan trips</Text>
          <Text style={styles.stateText}>Your trips are saved to your account.</Text>
          {!!onSignIn && (
            <TouchableOpacity style={styles.primaryButton} onPress={onSignIn} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>Sign in</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (status === 'error') {
      return (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={36} color={COLORS.textMuted} />
          <Text style={styles.stateTitle}>Couldn't load your trips</Text>
          <Text style={styles.stateText}>{message || 'Check your connection and try again.'}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onClose} activeOpacity={0.9}>
            <Text style={styles.primaryButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (status === 'done' && done) {
      return (
        <View style={styles.center}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={30} color={COLORS.white} />
          </View>
          <Text style={styles.stateTitle}>
            {done.already ? 'Already in your trip' : `Added to ${done.tripName}`}
          </Text>
          <Text style={styles.stateText}>
            {place?.name}{done.destName ? ` · ${done.destName}` : ''}
          </Text>
          <View style={styles.doneActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Done</Text>
            </TouchableOpacity>
            {!!onViewTrip && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => { onViewTrip(done.tripId, done.tripName); onClose(); }}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryButtonText}>View trip</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    // status === 'ready'
    return (
      <>
        {!preTripId && (
          <>
            <Text style={styles.sectionLabel}>Choose trip</Text>
            {trips.length === 0 ? (
              <View style={styles.emptyTrips}>
                <Text style={styles.stateText}>You don't have an active trip yet.</Text>
                {!!onCreateTrip && (
                  <TouchableOpacity style={styles.secondaryButton} onPress={onCreateTrip} activeOpacity={0.85}>
                    <Text style={styles.secondaryButtonText}>Create a trip</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ScrollView
                style={styles.tripList}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {trips.map(renderTripRow)}
              </ScrollView>
            )}
          </>
        )}

        {destsLoading && <ActivityIndicator style={styles.destLoading} color={COLORS.accent} />}

        {destinations.length > 1 && (
          <>
            <Text style={styles.sectionLabel}>Choose destination</Text>
            <View style={styles.pillRow}>
              {destinations.map((d) => {
                const active = d.id === destId;
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setDestId(d.id)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
                      {d.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {!!tripId && !destsLoading && (
          <>
            <Text style={styles.sectionLabel}>Category</Text>
            <View style={styles.pillRow}>
              {TRIP_CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => setCategory(c.key)}
                    activeOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={c.icon} size={15} color={active ? COLORS.white : COLORS.textSecondary} />
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {alreadyThere && (
          <Text style={styles.note}>This place is already saved in {selectedDest?.name}.</Text>
        )}
        {!!message && <Text style={styles.error}>{message}</Text>}

        <View style={styles.footer}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, !canConfirm && styles.buttonDisabled]}
            onPress={confirm}
            disabled={!canConfirm}
            activeOpacity={0.9}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.primaryButtonText} numberOfLines={1}>
                {selectedDest ? `Add to ${selectedDest.name}` : 'Add to trip'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SIZES.spacing_base }]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.title}>Add to a trip</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {!!place && (
            <View style={styles.preview}>
              {place.previewUrl ? (
                <Image source={{ uri: place.previewUrl }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Ionicons name="image-outline" size={20} color={COLORS.textMuted} />
                </View>
              )}
              <View style={styles.previewText}>
                <Text style={styles.previewName} numberOfLines={1}>{place.name}</Text>
                {!!place.vicinity && (
                  <Text style={styles.previewSub} numberOfLines={1}>{place.vicinity}</Text>
                )}
              </View>
            </View>
          )}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderBody()}
          </ScrollView>
        </View>
      </View>
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
    maxHeight: MAX_SHEET_HEIGHT,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SIZES.radius_xl,
    borderTopRightRadius: SIZES.radius_xl,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SIZES.spacing_md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.spacing_md,
  },
  title: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },

  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_sm,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.cardBackground,
    marginBottom: SIZES.spacing_sm,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: SIZES.radius_sm,
  },
  thumbPlaceholder: {
    backgroundColor: COLORS.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewText: {
    flex: 1,
  },
  previewName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  previewSub: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },

  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingBottom: SIZES.spacing_sm,
  },
  center: {
    alignItems: 'center',
    paddingVertical: SIZES.spacing_xl,
    gap: SIZES.spacing_sm,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stateText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  successCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneActions: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_md,
  },

  sectionLabel: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
  },
  tripList: {
    maxHeight: 220,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
    borderRadius: SIZES.radius_md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  tripRowSelected: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(232, 93, 4, 0.06)',
  },
  tripRowDisabled: {
    opacity: 0.55,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.textMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: COLORS.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accent,
  },
  tripRowText: {
    flex: 1,
  },
  tripName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  tripDates: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  reason: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  emptyTrips: {
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_base,
  },
  destLoading: {
    marginTop: SIZES.spacing_md,
  },

  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.spacing_sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: 9,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: '100%',
  },
  pillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pillText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  pillTextActive: {
    color: COLORS.white,
    fontFamily: 'Poppins_600SemiBold',
  },

  note: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
  },
  error: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
  },

  footer: {
    flexDirection: 'row',
    gap: SIZES.spacing_md,
    marginTop: SIZES.spacing_lg,
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accentDeep,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  secondaryButton: {
    minHeight: 50,
    paddingHorizontal: SIZES.spacing_lg,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
