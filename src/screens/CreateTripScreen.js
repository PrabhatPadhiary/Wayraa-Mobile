import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ScrollView,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SIZES } from '../constants';
import { SignInPrompt, DateRangeSheet, DateRangeField } from '../components';
import TravellerStepper from '../components/TravellerStepper';
import PlaceSearchField from '../components/PlaceSearchField';
import TravelScene from '../components/TravelScene';
import useAuth from '../hooks/useAuth';
import { createTrip, addPlaceToTrip, getPlaceDetails, placeCoords, findCityOf, AuthRequiredError } from '../services';
import { showAlert } from '../components/AppDialog';
import { formatDateRange } from '../utils/tripDates';
import { LoaderOverlay } from '../components/WayraaLoader';
import { getTripDraft, findTripDraftFor, saveTripDraft, clearTripDraft, newDraftId } from '../services/tripDraft';

// The destination photo's share of the screen height (status bar included),
// close to the trip page (46%) and place page (50%).
const HERO_SHARE = 0.42;
// How far the form's white sheet overlaps the photo.
const SHEET_OVERLAP = 24;

/**
 * CreateTripScreen - first step of trip creation, seeded from a destination.
 * Opens over the tabs (slides up), so a tab button can't drop it half done.
 *
 *  - Leaving with changes (✕, back, swipe down) asks "Discard this trip?".
 *  - What's filled in is saved on the phone as you go; next time, an
 *    unfinished trip is offered back ("Continue your trip to Dubai?").
 *
 * Route params: { placeId, name, secondary, photoUrl, lat, lng } (the
 * destination, filled in; you can change it on the form), optionally
 * `addPlace` (a trip-place DTO, from "Create a new trip" in Add to trip: that
 * place is saved to the new trip once it's created) with `cityOf` (that place,
 * whose city becomes the destination: looked up, or left empty), or { resumeDraftId } from
 * an unfinished-trip row on Home / My Trips (fills that one straight in).
 */
const defaultTripName = (destName) => (destName ? `Trip to ${destName}` : '');

export default function CreateTripScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  // Scrolled past the photo: dark status bar on a white strip.
  const [pastHero, setPastHero] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const bottomPad = insets.bottom + SIZES.spacing_lg;
  const heroHeight = Math.round(windowHeight * HERO_SHARE);
  // The destination: from the route, or from an unfinished trip you continue.
  const [dest, setDest] = useState(() => {
    const p = route.params || {};
    return { placeId: p.placeId, name: p.name, secondary: p.secondary, photoUrl: p.photoUrl, lat: p.lat, lng: p.lng };
  });
  const { placeId, name, secondary, photoUrl, lat, lng } = dest;
  const { isAuthenticated, isAuthReady } = useAuth();
  // What the form opened with, to tell whether anything has changed.
  const initialPlaceId = useRef(dest.placeId);
  // A place to save to the new trip (from Add to trip on a place page).
  const [addPlace, setAddPlace] = useState(route.params?.addPlace || null);
  // Choosing another destination: the search field is open.
  const [changingDest, setChangingDest] = useState(!dest.placeId);
  const latestPlaceId = useRef(dest.placeId);
  latestPlaceId.current = dest.placeId;
  // Looking up the city of the place you came from (cityOf).
  const [findingCity, setFindingCity] = useState(!!route.params?.cityOf && !route.params?.resumeDraftId);
  const [destMissing, setDestMissing] = useState(false);
  // The picked destination's details (photo, coordinates) while they load.
  const destDetails = useRef(null);

  const [tripName, setTripName] = useState(defaultTripName(name));
  // ISO strings (UTC midnight) or null, chosen on the range calendar.
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const [travelers, setTravelers] = useState(1);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Missing name: shown under the name field (red border), which gets focus.
  const [nameMissing, setNameMissing] = useState(false);
  const nameRef = useRef(null);

  // Anything changed from a fresh form? (Only then is there something to save or lose.)
  const dirty = dest.placeId !== initialPlaceId.current
    || tripName.trim() !== defaultTripName(name)
    || !!startDate || !!endDate || travelers !== 1 || !!description.trim();

  // ── Unfinished trip from before ──
  // This form's draft id: an existing unfinished trip's, or a new one. Other
  // destinations' unfinished trips are left alone.
  const draftId = useRef(route.params?.resumeDraftId || newDraftId());
  const clearDraft = () => clearTripDraft(draftId.current);
  const [draftChecked, setDraftChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const restore = (draft) => {
      if (draft.dest?.name) {
        setDest(draft.dest);
        initialPlaceId.current = draft.dest.placeId;
        setChangingDest(false);
      }
      if (draft.addPlace) setAddPlace(draft.addPlace);
      setTripName(draft.tripName || '');
      setStartDate(draft.startDate || null);
      setEndDate(draft.endDate || null);
      setTravelers(draft.travelers || 1);
      setDescription(draft.description || '');
    };
    (async () => {
      try {
        // From an unfinished-trip row: you've already chosen to continue.
        if (route.params?.resumeDraftId) {
          const draft = await getTripDraft(route.params.resumeDraftId);
          if (cancelled) return;
          if (draft) {
            restore(draft);
          } else {
            // Gone meanwhile (expired or discarded).
            allowLeave.current = true;
            navigation.goBack();
            showAlert('That trip is gone', 'Pick a destination to start a new trip.');
          }
          return;
        }
        // Started from a destination you already have an unfinished trip for.
        const draft = await findTripDraftFor(route.params?.placeId);
        if (cancelled || !draft) return;
        showAlert(
          `Continue your trip to ${draft.dest?.name || 'here'}?`,
          `You started "${draft.tripName || 'a trip'}" earlier and didn't finish it.`,
          [
            { text: 'Start fresh', style: 'cancel', onPress: () => clearTripDraft(draft.id) },
            {
              text: 'Continue',
              onPress: () => {
                draftId.current = draft.id;
                restore(draft);
              },
            },
          ],
          { cancelable: false },
        );
      } catch {
        // No draft to offer.
      } finally {
        if (!cancelled) setDraftChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Save as you go, from the moment the form opens (after the check above,
  // so an old draft isn't overwritten before you've chosen). Even an
  // untouched form is kept, in case the app is closed with it open; closing
  // it yourself without changes forgets it (below).
  useEffect(() => {
    if (!draftChecked) return undefined;
    if (!dest?.name) return undefined; // nothing to plan around yet
    const t = setTimeout(() => {
      saveTripDraft({ id: draftId.current, dest, tripName, startDate, endDate, travelers, description, addPlace });
    }, 400);
    return () => clearTimeout(t);
  }, [draftChecked, dest, tripName, startDate, endDate, travelers, description, addPlace]);

  // ── Leaving with changes: ask first ──
  const allowLeave = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;
  // The form as it is now, for "Save for later" (the listener is set up once).
  const latest = useRef(null);
  latest.current = { dest, tripName, startDate, endDate, travelers, description, addPlace };
  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (allowLeave.current) return;
    // Mid-creation (e.g. Android back): stay until it's done.
    if (submittingRef.current) {
      e.preventDefault();
      return;
    }
    if (!dirtyRef.current) {
      // Closed on purpose without filling anything in: nothing to keep.
      clearDraft();
      return;
    }
    e.preventDefault();
    const leave = () => {
      allowLeave.current = true;
      navigation.dispatch(e.data.action);
    };
    const f = latest.current;
    const summary = [f.tripName.trim() || 'Your trip', formatDateRange(f.startDate, f.endDate)].filter(Boolean).join(' · ');
    showAlert('Leave this trip?', summary, [
      {
        text: 'Save for later',
        icon: 'bookmark-outline',
        // Kept on the phone; Home and My Trips show it under "Unfinished".
        onPress: async () => {
          await saveTripDraft({
            id: draftId.current, dest: f.dest, tripName: f.tripName, startDate: f.startDate,
            endDate: f.endDate, travelers: f.travelers, description: f.description, addPlace: f.addPlace,
          });
          leave();
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        icon: 'trash-outline',
        onPress: () => {
          clearDraft();
          leave();
        },
      },
      { text: 'Keep editing', style: 'cancel' },
    ]);
  }), [navigation]);

  const close = useCallback(() => navigation.goBack(), [navigation]);

  // A new destination from the search: shown straight away, with its photo
  // and coordinates filled in when the details arrive. A trip name you
  // haven't changed follows it ("Trip to Goa" -> "Trip to Jaipur").
  const chooseDestination = (result) => {
    const next = { placeId: result.placeId, name: result.name, secondary: result.secondary };
    setTripName((t) => (t.trim() === defaultTripName(name) || !t.trim() ? defaultTripName(result.name) : t));
    if (nameMissing) setNameMissing(false);
    setDest(next);
    setChangingDest(false);
    setDestMissing(false);
    const loading = getPlaceDetails(result.placeId).then((details) => {
      const c = placeCoords(details);
      const filled = { ...next, photoUrl: details?.photoUrl || undefined, lat: c?.lat, lng: c?.lng };
      // Only if it's still the one chosen.
      setDest((d) => (d.placeId === next.placeId ? filled : d));
      return filled;
    }).catch(() => next);
    destDetails.current = { placeId: next.placeId, loading };
  };

  // From a place (Bangalore Palace): the trip is to its city (Bengaluru).
  // Not found: the field stays empty for you to fill in.
  useEffect(() => {
    if (!findingCity) return undefined;
    let cancelled = false;
    findCityOf(route.params.cityOf)
      .then((city) => {
        if (cancelled || !city) return;
        // Only if you haven't picked one meanwhile.
        if (latestPlaceId.current) return;
        initialPlaceId.current = city.placeId; // filled in for you, not a change
        chooseDestination(city);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFindingCity(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    setError('');
    Keyboard.dismiss();

    if (!placeId) {
      if (findingCity) return; // a moment more
      setDestMissing(true);
      setChangingDest(true);
      return;
    }
    if (!tripName.trim()) {
      setNameMissing(true);
      nameRef.current?.focus();
      return;
    }

    const startIso = startDate || null;
    const endIso = endDate || null;

    setSubmitting(true);
    try {
      // A just-picked destination: wait for its photo and coordinates.
      let target = dest;
      if (destDetails.current?.placeId === placeId) target = await destDetails.current.loading;
      const created = await createTrip({
        name: tripName.trim(),
        startDate: startIso,
        endDate: endIso,
        travelersCount: travelers,
        description: description.trim() || null,
        primaryDestination: target.name,
        coverPhotoUrl: target.photoUrl,
        destination: {
          googlePlaceId: target.placeId,
          name: target.name,
          latitude: target.lat,
          longitude: target.lng,
          photoUrl: target.photoUrl,
        },
      });
      // Came from "Add to trip" on a place: save that place to the new trip.
      // The trip exists either way, so a failure here only gets a note.
      if (addPlace && created?.id && created?.destination?.id) {
        try {
          await addPlaceToTrip(created.id, created.destination.id, addPlace);
        } catch {
          showAlert('Trip created', `We couldn't add ${addPlace.placeName || 'the place'} to it. Add it again from its page.`);
        }
      }
      // Created: nothing left to save or ask about. Going to Main closes this
      // form (it sits on top) and opens the new trip in My Trips;
      // `initial: false` keeps the My Trips list underneath, so back goes to
      // the list. The Home tab stays on the page you started from.
      allowLeave.current = true;
      clearDraft();
      navigation.navigate('Main', created?.id
        ? {
          screen: 'MyTrips',
          params: { screen: 'TripDetail', params: { tripId: created.id, tripName: created.name }, initial: false },
        }
        : { screen: 'MyTrips' });
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        setError('Your session expired. Please sign in again.');
      } else {
        setError(e?.message || 'Could not create the trip. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={close}
        accessibilityLabel="Close"
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={22} color={COLORS.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Create a trip</Text>
    </View>
  );

  if (isAuthReady && !isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        {renderHeader()}
        <SignInPrompt
          icon="map-outline"
          title="Plan your next adventure"
          subtitle="Sign in to create trips and keep your journeys organised."
          onSignIn={() => navigation.navigate('Welcome')}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        // Dark over the drawn scene's light sky (and once scrolled past the top).
        barStyle={pastHero || !photoUrl ? 'dark-content' : 'light-content'}
        translucent
        backgroundColor="transparent"
        animated
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomPad }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const past = e.nativeEvent.contentOffset.y > heroHeight - insets.top - 40;
            if (past !== pastHero) setPastHero(past);
          }}
        >
          {/* Where you're going: the place's photo, edge to edge, under the status bar. */}
          <View
            style={[styles.destinationCard, { height: heroHeight, paddingTop: insets.top + 64 }]}
            accessible
            accessibilityLabel={`Destination: ${[name, secondary].filter(Boolean).join(', ') || 'not set'}`}
          >
            {photoUrl ? (
              <>
                <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
                  locations={[0, 0.35, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </>
            ) : (
              // No destination (or no photo) yet: a drawn travel scene, with a
              // soft fade at the bottom for the white text.
              <>
                <TravelScene style={StyleSheet.absoluteFill} />
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
                  locations={[0, 0.55, 1]}
                  style={StyleSheet.absoluteFill}
                />
              </>
            )}
            <View style={styles.destinationText}>
              <Text style={styles.destinationKicker}>{name ? 'Plan a trip to' : 'Plan a trip'}</Text>
              <Text style={styles.destinationName} numberOfLines={1}>{name || 'Where to?'}</Text>
              {!!secondary && (
                <View style={styles.destinationPlaceRow}>
                  <Ionicons name="location" size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.destinationSecondary} numberOfLines={1}>{secondary}</Text>
                </View>
              )}
            </View>
          </View>

          {/* The form, on a white sheet that overlaps the photo. */}
          <View style={styles.formSheet}>

          {/* Destination: filled in from where you came from, changeable. */}
          <Text style={styles.fieldLabel}>Destination</Text>
          {findingCity && !placeId ? (
            <View style={styles.destRow} accessibilityLiveRegion="polite">
              <View style={styles.destIcon}>
                <ActivityIndicator size="small" color={COLORS.accentDeep} />
              </View>
              <Text style={[styles.destSecondary, styles.destText]}>Finding the city…</Text>
            </View>
          ) : changingDest ? (
            <>
              <PlaceSearchField
                onSelect={chooseDestination}
                placeholder="Where to? e.g. Goa, Kyoto, Iceland"
                icon="map-pin"
                regionsOnly
                autoFocus={!!placeId || destMissing}
              />
              {destMissing ? (
                <View style={styles.fieldError} accessibilityLiveRegion="polite">
                  <Ionicons name="alert-circle" size={15} color={COLORS.error} />
                  <Text style={styles.fieldErrorText}>Choose where you're going</Text>
                </View>
              ) : !!placeId && (
                <TouchableOpacity onPress={() => setChangingDest(false)} style={styles.keepDest} accessibilityRole="button">
                  <Text style={styles.keepDestText}>Keep {name}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <TouchableOpacity
              style={styles.destRow}
              onPress={() => setChangingDest(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Destination: ${name}. Change`}
            >
              <View style={styles.destIcon}>
                <Ionicons name="location" size={17} color={COLORS.accentDeep} />
              </View>
              <View style={styles.destText}>
                <Text style={styles.destName} numberOfLines={1}>{name}</Text>
                {!!secondary && <Text style={styles.destSecondary} numberOfLines={1}>{secondary}</Text>}
              </View>
              <Text style={styles.changeText}>Change</Text>
            </TouchableOpacity>
          )}
          {!!addPlace && (
            <View style={styles.addPlaceNote}>
              <Ionicons name="bookmark" size={13} color={COLORS.textSecondary} />
              <Text style={styles.addPlaceText} numberOfLines={2}>
                {addPlace.placeName || 'This place'} will be saved to this trip
              </Text>
              <TouchableOpacity
                onPress={() => setAddPlace(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Don't save ${addPlace.placeName || 'this place'} to the trip`}
              >
                <Ionicons name="close" size={15} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Trip name */}
          <Text style={styles.fieldLabel}>Trip name</Text>
          <TextInput
            ref={nameRef}
            style={[styles.input, nameMissing && styles.inputError]}
            value={tripName}
            onChangeText={(t) => {
              setTripName(t);
              if (nameMissing && t.trim()) setNameMissing(false);
            }}
            accessibilityLabel="Trip name"
            accessibilityHint={nameMissing ? 'Required. Give your trip a name.' : undefined}
            placeholder="e.g. Summer in Goa"
            placeholderTextColor={COLORS.textMuted}
            maxLength={100}
            returnKeyType="next"
          />
          {nameMissing && (
            <View style={styles.fieldError} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={15} color={COLORS.error} />
              <Text style={styles.fieldErrorText}>Give your trip a name</Text>
            </View>
          )}

          {/* Description (optional) */}
          <Text style={styles.fieldLabel}>
            Description <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's the plan? e.g. Beaches, seafood and a day trip to the islands"
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={500}
            accessibilityLabel="Description, optional"
          />

          {/* Dates */}
          <Text style={styles.fieldLabel}>Dates</Text>
          <DateRangeField
            startDate={startDate}
            endDate={endDate}
            startLabel="Start"
            endLabel="End"
            onPress={() => setDatesOpen(true)}
          />
          <Text style={styles.hint}>Dates are optional. A trip without dates is saved as a draft.</Text>

          {/* Travellers */}
          <Text style={styles.fieldLabel}>Travellers</Text>
          <TravellerStepper value={travelers} onChange={setTravelers} />

          {!!error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.submitText}>Create trip</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Once the photo has scrolled away, a white strip keeps the status bar readable. */}
      {pastHero && <View style={[styles.statusBackdrop, { height: insets.top }]} />}

      {/* Close: a round button on the photo, like the trip and place pages. */}
      <TouchableOpacity
        style={[styles.heroClose, { top: insets.top + SIZES.spacing_sm }]}
        onPress={close}
        accessibilityLabel="Close"
        accessibilityRole="button"
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={22} color={COLORS.white} />
      </TouchableOpacity>

      {/* While creating: the form stays in view, dimmed and locked. */}
      <LoaderOverlay visible={submitting} message="Creating your trip…" />

      <DateRangeSheet
        visible={datesOpen}
        title="Trip dates"
        startDate={startDate}
        endDate={endDate}
        onClose={() => setDatesOpen(false)}
        onApply={(range) => {
          setStartDate(range.startDate);
          setEndDate(range.endDate);
          setDatesOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: SIZES.spacing_lg,
  },
  backButton: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 2,
  },
  headerTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },

  content: {
    padding: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_xxl,
  },

  // Destination photo, edge to edge at the top
  destinationCard: {
    justifyContent: 'flex-end',
    paddingHorizontal: SIZES.spacing_lg,
    paddingBottom: SIZES.spacing_xl + 24, // clears the sheet's rounded overlap
    backgroundColor: COLORS.primary,
    overflow: 'hidden',
  },
  destinationText: {},
  destinationKicker: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.85)',
  },
  destinationName: {
    fontSize: 34,
    lineHeight: 42,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  destinationPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  destinationSecondary: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: 'rgba(255,255,255,0.9)',
  },
  // White sheet holding the form, overlapping the photo's bottom edge
  formSheet: {
    marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: COLORS.white,
    padding: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_sm,
  },
  heroClose: {
    position: 'absolute',
    left: SIZES.spacing_lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(43, 63, 81, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  statusBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
  },

  // Form
  fieldLabel: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: SIZES.spacing_md,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingVertical: SIZES.spacing_md,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
    backgroundColor: COLORS.white,
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  optional: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  inputError: {
    borderColor: COLORS.error,
    borderWidth: 1.5,
    backgroundColor: '#FDF8F8',
  },
  fieldError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  fieldErrorText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    paddingVertical: 10,
    paddingHorizontal: SIZES.spacing_md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    backgroundColor: COLORS.white,
  },
  destIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FDEFEA',
  },
  destText: {
    flex: 1,
    minWidth: 0,
  },
  destName: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  destSecondary: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  changeText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  keepDest: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 2,
  },
  keepDestText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accentDeep,
  },
  addPlaceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SIZES.spacing_sm,
  },
  addPlaceText: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  hint: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    marginTop: SIZES.spacing_sm,
  },


  error: {
    marginTop: SIZES.spacing_lg,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.error,
  },

  submitButton: {
    marginTop: SIZES.spacing_lg,
    backgroundColor: COLORS.accent,
    paddingVertical: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
