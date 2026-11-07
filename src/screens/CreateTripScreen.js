import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { SignInPrompt, DateRangeSheet, DateRangeField } from '../components';
import useAuth from '../hooks/useAuth';
import { createTrip, AuthRequiredError } from '../services';

const MAX_TRAVELERS = 20;
/**
 * CreateTripScreen - first step of trip creation, seeded from a destination.
 *
 * Route params: { placeId, name, secondary, photoUrl, lat, lng }
 */
export default function CreateTripScreen({ navigation, route }) {
  const { placeId, name, secondary, photoUrl, lat, lng } = route.params || {};
  const { isAuthenticated, isAuthReady } = useAuth();

  const [tripName, setTripName] = useState(name ? `Trip to ${name}` : '');
  // ISO strings (UTC midnight) or null, chosen on the range calendar.
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const [travelers, setTravelers] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');

    if (!tripName.trim()) {
      setError('Give your trip a name.');
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
      // Pop this form off the Explore stack first, so the Home tab returns to
      // the screen the user started from (not back to this form), then open
      // the new trip in the My Trips tab. `initial: false` keeps the My Trips
      // list underneath, so back goes to the list. The tab navigator is
      // captured before goBack() because this screen unmounts afterwards.
      const tabNavigator = navigation.getParent();
      navigation.goBack();
      if (created?.id) {
        tabNavigator?.navigate('MyTrips', {
          screen: 'TripDetail',
          params: { tripId: created.id, tripName: created.name },
          initial: false,
        });
      } else {
        tabNavigator?.navigate('MyTrips');
      }
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
        onPress={() => navigation.goBack()}
        accessibilityLabel="Go back"
        activeOpacity={0.8}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
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
          subtitle="Sign in to create trips and keep your journeys organized."
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
            style={styles.input}
            value={tripName}
            onChangeText={setTripName}
            placeholder="e.g. Summer in Goa"
            placeholderTextColor={COLORS.textMuted}
            maxLength={100}
            returnKeyType="next"
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

          {/* Travelers */}
          <Text style={styles.fieldLabel}>Travelers</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepButton, travelers <= 1 && styles.stepButtonDisabled]}
              onPress={() => setTravelers((n) => Math.max(1, n - 1))}
              disabled={travelers <= 1}
              accessibilityLabel="Decrease travelers"
              activeOpacity={0.8}
            >
              <Ionicons name="remove" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{travelers}</Text>
            <TouchableOpacity
              style={[styles.stepButton, travelers >= MAX_TRAVELERS && styles.stepButtonDisabled]}
              onPress={() => setTravelers((n) => Math.min(MAX_TRAVELERS, n + 1))}
              disabled={travelers >= MAX_TRAVELERS}
              accessibilityLabel="Increase travelers"
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

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
  hint: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    marginTop: SIZES.spacing_sm,
  },

  // Travelers stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_lg,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  stepValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
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
