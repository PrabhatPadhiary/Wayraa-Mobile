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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { SignInPrompt, DateRangeSheet, DateRangeField } from '../components';
import TravellerStepper from '../components/TravellerStepper';
import useAuth from '../hooks/useAuth';
import { createTrip, AuthRequiredError } from '../services';
import { showAlert } from '../components/AppDialog';
import { formatDateRange } from '../utils/tripDates';
import { LoaderOverlay } from '../components/WayraaLoader';
import { getTripDraft, findTripDraftFor, saveTripDraft, clearTripDraft, newDraftId } from '../services/tripDraft';

/**
 * CreateTripScreen - first step of trip creation, seeded from a destination.
 * Opens over the tabs (slides up), so a tab button can't drop it half done.
 *
 *  - Leaving with changes (✕, back, swipe down) asks "Discard this trip?".
 *  - What's filled in is saved on the phone as you go; next time, an
 *    unfinished trip is offered back ("Continue your trip to Dubai?").
 *
 * Route params: { placeId, name, secondary, photoUrl, lat, lng }, or
 * { resumeDraftId } from an unfinished-trip row on Home / My Trips (fills
 * that one straight in).
 */
export default function CreateTripScreen({ navigation, route }) {
  // The destination: from the route, or from an unfinished trip you continue.
  const [dest, setDest] = useState(() => {
    const p = route.params || {};
    return { placeId: p.placeId, name: p.name, secondary: p.secondary, photoUrl: p.photoUrl, lat: p.lat, lng: p.lng };
  });
  const { placeId, name, secondary, photoUrl, lat, lng } = dest;
  const { isAuthenticated, isAuthReady } = useAuth();

  const [tripName, setTripName] = useState(name ? `Trip to ${name}` : '');
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
  const dirty = tripName.trim() !== (name ? `Trip to ${name}` : '')
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
      if (draft.dest?.name) setDest(draft.dest);
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
      saveTripDraft({ id: draftId.current, dest, tripName, startDate, endDate, travelers, description });
    }, 400);
    return () => clearTimeout(t);
  }, [draftChecked, dest, tripName, startDate, endDate, travelers, description]);

  // ── Leaving with changes: ask first ──
  const allowLeave = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;
  // The form as it is now, for "Save for later" (the listener is set up once).
  const latest = useRef(null);
  latest.current = { dest, tripName, startDate, endDate, travelers, description };
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
            endDate: f.endDate, travelers: f.travelers, description: f.description,
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

  const handleSubmit = async () => {
    setError('');
    Keyboard.dismiss();

    if (!tripName.trim()) {
      setNameMissing(true);
      nameRef.current?.focus();
      return;
    }

    const startIso = startDate || null;
    const endIso = endDate || null;

    setSubmitting(true);
    try {
      const created = await createTrip({
        name: tripName.trim(),
        startDate: startIso,
        endDate: endIso,
        travelersCount: travelers,
        description: description.trim() || null,
        primaryDestination: name,
        coverPhotoUrl: photoUrl,
        destination: {
          googlePlaceId: placeId,
          name,
          latitude: lat,
          longitude: lng,
          photoUrl,
        },
      });
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      {renderHeader()}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Destination summary */}
          <View style={styles.destinationCard}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.destinationImage} />
            ) : (
              <View style={[styles.destinationImage, styles.destinationPlaceholder]}>
                <Ionicons name="image-outline" size={24} color={COLORS.textMuted} />
              </View>
            )}
            <View style={styles.destinationText}>
              <Text style={styles.destinationLabel}>Destination</Text>
              <Text style={styles.destinationName} numberOfLines={1}>{name || 'Destination'}</Text>
              {!!secondary && (
                <Text style={styles.destinationSecondary} numberOfLines={1}>{secondary}</Text>
              )}
            </View>
          </View>

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
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.submitText}>Create trip</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

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
    </SafeAreaView>
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

  // Destination summary card
  destinationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: SIZES.radius_lg,
    padding: SIZES.spacing_md,
    marginBottom: SIZES.spacing_lg,
    gap: SIZES.spacing_md,
  },
  destinationImage: {
    width: 64,
    height: 64,
    borderRadius: SIZES.radius_md,
  },
  destinationPlaceholder: {
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationText: {
    flex: 1,
  },
  destinationLabel: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  destinationName: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  destinationSecondary: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },

  // Form
  fieldLabel: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_sm,
    marginTop: SIZES.spacing_base,
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
    minHeight: 84,
    textAlignVertical: 'top',
  },
  optional: {
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  inputError: {
    borderColor: COLORS.error,
    borderWidth: 1.5,
    backgroundColor: '#fff6f6',
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
    marginTop: SIZES.spacing_xl,
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
