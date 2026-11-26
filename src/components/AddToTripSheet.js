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
  addTripDestination,
  getPlaceDetails,
  findCityOf,
  AuthRequiredError,
  peekMyTrips,
} from '../services';
import { TRIP_CATEGORIES, toTripCategory, buildTripPlaceDto } from '../utils/tripPlaces';
import { formatDateRange } from '../utils/tripDates';
import { FAR_FROM_TRIP_KM, placePoint, nearestStop, formatFarKm } from '../utils/tripDistance';
import { RowListSkeleton } from './skeletons';
import { useRetryHint } from '../hooks/useNetwork';

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
 * Far from the trip: when the place is more than FAR_FROM_TRIP_KM from every
 * stop (a Dubai place on a Bengaluru trip), the sheet asks what to do: add
 * the place's city as a new stop (the default), start a new trip, or add it
 * to the trip anyway. Trips with a stop near the place are listed first.
 *
 * @param {boolean} visible
 * @param {object} place  { placeId, name, vicinity, rating, userRatingsTotal,
 *   category, photos[], geometry, previewUrl } as returned by the places API
 * @param {{ tripId: string, destinationId?: string, tripName?: string }} [preselect]
 * @param {() => void} onClose
 * @param {() => void} [onSignIn]
 * @param {(category: string|null) => void} [onCreateTrip]  start a new trip
 *   with this place (shown with or without existing trips)
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
  const retryHint = useRetryHint();
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
  // The place is far from every stop on the chosen trip:
  // { km, nearName, city } where city is undefined while it's looked up,
  // null when it couldn't be found, else a search result { placeId, name }.
  const [far, setFar] = useState(null);
  const [farChoice, setFarChoice] = useState(null); // 'stop' | 'new' | 'anyway'
  // Latest trip the user tapped, to ignore slow responses for an older tap.
  const latestTripRef = useRef('');
  // A stop made by "Add <city> as a new stop", reused if saving the place fails and you retry.
  const createdStopRef = useRef(null);

  const placeId = place?.placeId;
  const preTripId = preselect?.tripId;
  const preDestId = preselect?.destinationId;

  const point = placePoint(place);

  const applyTrip = (full, wantedDestId) => {
    const sorted = [...(full?.destinations || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const mapped = sorted.map((d) => ({
      id: d.id,
      name: d.name,
      googlePlaceId: d.googlePlaceId,
      order: d.order ?? 0,
      latitude: d.latitude,
      longitude: d.longitude,
      hasPlace: (d.places || []).some((p) => p.placeId === placeId),
    }));
    setDestinations(mapped);
    const wanted = mapped.find((d) => d.id === wantedDestId);
    const nearest = nearestStop(mapped, point);
    // Default to the stop nearest the place (else the first).
    setDestId((wanted || nearest?.stop || mapped[0])?.id || '');

    setFar(null);
    setFarChoice(null);
    // Adding to a stop you're browsing places for: that's where it goes.
    if (wantedDestId || !nearest || nearest.km <= FAR_FROM_TRIP_KM) return;

    const tripIdNow = full.id;
    setFar({ km: nearest.km, nearName: nearest.stop.name, city: undefined });
    findCityOf({ name: place?.name, vicinity: place?.vicinity || '', lat: point.latitude, lng: point.longitude })
      .catch(() => null)
      .then((city) => {
        if (latestTripRef.current !== tripIdNow) return;
        // The city is already a stop (one without coordinates): just use it.
        const existing = city && mapped.find((d) => d.googlePlaceId === city.placeId);
        if (existing) {
          setFar(null);
          setDestId(existing.id);
          return;
        }
        setFar((f) => (f ? { ...f, city: city || null } : f));
        if (city) setFarChoice((c) => c || 'stop');
      });
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
    setFar(null);
    setFarChoice(null);
    createdStopRef.current = null;

    (async () => {
      try {
        if (preTripId) {
          const full = await getTripById(preTripId);
          if (cancelled) return;
          setTrips([{ id: full.id, name: full.name }]);
          applyTrip(full, preDestId);
        } else {
          const pick = (all) => sortNearbyFirst(all.filter((t) => (t.status || '').toLowerCase() !== 'completed'));
          // Your trips as last loaded, at once; the fresh list replaces them.
          const cached = peekMyTrips();
          if (cached) {
            setTrips(pick(cached));
            setStatus('ready');
          }
          const all = await getMyTrips();
          if (cancelled) return;
          setTrips(pick(all));
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

  // Trips with a stop near the place first (the list sends each trip's stop
  // coordinates); the rest keep their order.
  const isNearby = (trip) => {
    const n = nearestStop(trip.stops, point);
    return !!n && n.km <= FAR_FROM_TRIP_KM;
  };
  const sortNearbyFirst = (list) => {
    if (!point) return list;
    const near = list.filter(isNearby);
    return near.length ? [...near, ...list.filter((t) => !isNearby(t))] : list;
  };

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
    setFar(null);
    setFarChoice(null);
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
  const farCity = far?.city || null;
  const farReady = !far
    || (farChoice === 'anyway')
    || (farChoice === 'new' && !!onCreateTrip)
    || (farChoice === 'stop' && !!farCity);
  const canConfirm = !!tripId && !!destId && !!category && farReady
    && (farChoice === 'new' || farChoice === 'stop' || !alreadyThere)
    && !submitting && !destsLoading;

  // The place's city as a new stop at the end of the trip (coordinates and a
  // photo from its details, as when adding a stop on the trip page).
  const addCityStop = async () => {
    const made = createdStopRef.current;
    if (made && made.tripId === tripId && made.cityId === farCity.placeId) return made.stop;
    const details = await getPlaceDetails(farCity.placeId).catch(() => null);
    const geo = details?.geometry;
    const nextOrder = destinations.reduce((max, d) => Math.max(max, d.order ?? 0), -1) + 1;
    const created = await addTripDestination(tripId, {
      googlePlaceId: farCity.placeId,
      name: farCity.name || details?.name,
      latitude: geo?.latitude ?? geo?.location?.lat ?? null,
      longitude: geo?.longitude ?? geo?.location?.lng ?? null,
      photoUrl: details?.photoUrl || null,
      order: nextOrder,
    });
    const stop = { id: created.id, name: created.name || farCity.name };
    createdStopRef.current = { tripId, cityId: farCity.placeId, stop };
    return stop;
  };

  const confirm = async () => {
    if (!canConfirm) return;
    if (far && farChoice === 'new') {
      onCreateTrip(category);
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const target = far && farChoice === 'stop'
        ? await addCityStop()
        : { id: destId, name: selectedDest?.name || '' };
      const res = await addPlaceToTrip(tripId, target.id, buildTripPlaceDto(place, category));
      const trip = trips.find((t) => t.id === tripId);
      setDone({
        tripId,
        tripName: trip?.name || preselect?.tripName || 'your trip',
        destName: target.name,
        already: res.alreadyAdded,
      });
      setStatus('done');
      if (onAdded) onAdded({ tripId, destinationId: target.id, tripPlaceId: res.id, alreadyAdded: res.alreadyAdded });
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
    const nearby = !reason && isNearby(trip);
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
          {(!!dates || nearby) && (
            <Text style={styles.tripDates} numberOfLines={1}>
              {[dates, nearby && 'Near this place'].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
        {!!reason && <Text style={styles.reason}>{reason}</Text>}
      </TouchableOpacity>
    );
  };

  const confirmLabel = () => {
    if (far && farChoice === 'stop' && farCity) return `Add ${farCity.name} as a stop`;
    if (far && farChoice === 'new') return 'Start a new trip';
    return selectedDest ? `Add to ${selectedDest.name}` : 'Add to trip';
  };

  const renderFarOption = (key, label, sub) => {
    const selected = farChoice === key;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.tripRow, selected && styles.tripRowSelected]}
        onPress={() => setFarChoice(key)}
        activeOpacity={0.85}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
        <View style={styles.tripRowText}>
          <Text style={styles.tripName} numberOfLines={1}>{label}</Text>
          {!!sub && <Text style={styles.tripDates} numberOfLines={2}>{sub}</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  // The place is far from every stop: ask where it belongs.
  const renderFarPrompt = () => {
    const where = far.city === undefined ? null : farCity?.name;
    const tripName = trips.find((t) => t.id === tripId)?.name || preselect?.tripName || 'this trip';
    const anywayName = destinations.length > 1 ? tripName : (selectedDest?.name || tripName);
    return (
      <View style={styles.farBox}>
        <View style={styles.farHead}>
          <Ionicons name="airplane-outline" size={18} color={COLORS.accentDeep} />
          <Text style={styles.farText}>
            {place?.name || 'This place'}{where ? ` is in ${where},` : ' is'} about {formatFarKm(far.km)} from {far.nearName}.
          </Text>
        </View>
        {far.city === undefined ? (
          <ActivityIndicator style={styles.destLoading} color={COLORS.accent} />
        ) : (
          <>
            {!!farCity && renderFarOption('stop', `Add ${farCity.name} as a new stop`, `Saves it under ${farCity.name} on ${tripName}`)}
            {!!onCreateTrip && renderFarOption('new', `Start a new trip${farCity ? ` to ${farCity.name}` : ''}`, null)}
            {renderFarOption('anyway', `Add to ${anywayName} anyway`, null)}
          </>
        )}
      </View>
    );
  };

  const renderBody = () => {
    if (status === 'loading') {
      return (
        <RowListSkeleton count={3} thumb={48} label="Loading your trips" />
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
          <Text style={styles.stateText}>{message || retryHint}</Text>
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
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionLabel, styles.sectionLabelInRow]}>Choose trip</Text>
              {/* With trips to choose from: a new one, right by the list. */}
              {!!onCreateTrip && trips.length > 0 && (
                <TouchableOpacity
                  style={styles.newTripPill}
                  onPress={() => onCreateTrip(category)}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Create a new trip with this place"
                >
                  <Ionicons name="add" size={16} color={COLORS.accentDeep} />
                  <Text style={styles.newTripText}>New trip</Text>
                </TouchableOpacity>
              )}
            </View>
            {trips.length === 0 ? (
              <View style={styles.emptyTrips}>
                <Text style={styles.stateText}>You don't have an active trip yet.</Text>
                {!!onCreateTrip && (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => onCreateTrip(category)} activeOpacity={0.85}>
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

        {!!far && !destsLoading && renderFarPrompt()}

        {destinations.length > 1 && (!far || farChoice === 'anyway') && (
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

        {alreadyThere && (!far || farChoice === 'anyway') && (
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
                {confirmLabel()}
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
    backgroundColor: 'rgba(217, 72, 28, 0.06)',
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
  },
  sectionLabelInRow: {
    marginTop: 0,
    marginBottom: 0,
  },
  newTripPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingLeft: 8,
    paddingRight: 12,
    paddingVertical: 5,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  newTripText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
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

  farBox: {
    marginTop: SIZES.spacing_md,
    padding: SIZES.spacing_md,
    paddingBottom: SIZES.spacing_xs,
    borderRadius: SIZES.radius_md,
    backgroundColor: '#FDF3EE',
  },
  farHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_md,
  },
  farText: {
    flex: 1,
    fontSize: SIZES.md,
    lineHeight: 20,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
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
