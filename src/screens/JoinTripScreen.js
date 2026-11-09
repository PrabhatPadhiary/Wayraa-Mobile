import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { SignInPrompt } from '../components';
import { fallbackGradientFor } from '../components/PlaceTile';
import { ROLE_INFO } from '../components/TravellersSheet';
import { getInvitationPreview, joinTrip, parseInviteId, AuthRequiredError } from '../services';
import { normalizePhotoUrl } from '../utils/placePhotos';

/**
 * Join a trip from an invite.
 *
 * Opened two ways:
 *  - from an invite link that opens the app (wayraa://join/<id>), which passes
 *    `inviteId`; the preview loads straight away;
 *  - from My Trips → "Join a trip", where you paste the link someone sent you
 *    (https://wayraa.com/join/<id>) or just its id.
 *
 * Shows the trip and the role you'll get, then joins and opens the trip.
 */
export default function JoinTripScreen({ navigation, route }) {
  const initialId = parseInviteId(route?.params?.inviteId);
  const [input, setInput] = useState('');
  const [inviteId, setInviteId] = useState(initialId);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(!!initialId);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const [alreadyOnTrip, setAlreadyOnTrip] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  const loadPreview = useCallback(async (id) => {
    setLoading(true);
    setError('');
    setPreview(null);
    setAlreadyOnTrip(false);
    setPhotoFailed(false);
    try {
      setPreview(await getInvitationPreview(id));
    } catch (e) {
      if (e instanceof AuthRequiredError) setNeedsAuth(true);
      else setError(e?.message || 'This invite link isn\'t valid.');
    } finally {
      setLoading(false);
    }
  }, []);

  // A new link can arrive while this screen is open (tapping another invite).
  useEffect(() => {
    const id = parseInviteId(route?.params?.inviteId);
    if (id) setInviteId(id);
  }, [route?.params?.inviteId]);

  useEffect(() => {
    if (inviteId) loadPreview(inviteId);
  }, [inviteId, loadPreview]);

  const submitLink = () => {
    const id = parseInviteId(input);
    if (!id) {
      setError('That doesn\'t look like an invite link. Paste the whole link you were sent.');
      return;
    }
    if (id === inviteId) loadPreview(id);
    else setInviteId(id);
  };

  const openTrip = (tripId, tripName) => {
    navigation.replace('TripDetail', { tripId, tripName });
  };

  const handleJoin = async () => {
    if (!inviteId || joining) return;
    setJoining(true);
    setError('');
    try {
      const trip = await joinTrip(inviteId);
      openTrip(trip.id, trip.name);
    } catch (e) {
      if (e instanceof AuthRequiredError) setNeedsAuth(true);
      else if (e?.alreadyMember) setAlreadyOnTrip(true);
      else setError(e?.message || 'Could not join the trip. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  if (needsAuth) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
        <SignInPrompt
          icon="people-outline"
          title="Sign in to join the trip"
          subtitle="You've been invited to plan a trip together. Sign in or create an account to join."
          onSignIn={() => navigation.navigate('Welcome')}
        />
      </SafeAreaView>
    );
  }

  const trip = preview?.trip;
  const role = ROLE_INFO[(preview?.role || '').toLowerCase()] || ROLE_INFO.member;
  const cover = !photoFailed ? normalizePhotoUrl(trip?.coverPhotoUrl, 800) : null;
  const place = trip?.primaryDestination || trip?.name || '';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.title}>Join a trip</Text>
          <Text style={styles.subtitle}>
            {initialId ? 'You\'ve been invited to plan a trip together.' : 'Paste the invite link a friend sent you.'}
          </Text>

          {/* Paste box: only when the screen wasn't opened from a link. */}
          {!initialId && (
            <>
              <View style={styles.inputRow}>
                <Ionicons name="link-outline" size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="https://wayraa.com/join/…"
                  placeholderTextColor={COLORS.textMuted}
                  value={input}
                  onChangeText={(t) => { setInput(t); setError(''); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="go"
                  onSubmitEditing={submitLink}
                  accessibilityLabel="Invite link"
                />
              </View>
              <TouchableOpacity
                style={[styles.secondaryButton, !input.trim() && styles.disabled]}
                onPress={submitLink}
                disabled={!input.trim() || loading}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>Find trip</Text>
              </TouchableOpacity>
            </>
          )}

          {loading && <ActivityIndicator style={styles.loader} color={COLORS.accent} />}

          {!!error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color="#d32f2f" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {trip && !loading && (
            <View style={styles.tripCard}>
              <View style={styles.cover}>
                {cover ? (
                  <Image
                    source={{ uri: cover }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={200}
                    onError={() => setPhotoFailed(true)}
                  />
                ) : (
                  <LinearGradient
                    colors={fallbackGradientFor(place)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.coverText}>
                  <Text style={styles.tripName} numberOfLines={2}>{trip.name}</Text>
                  {!!trip.primaryDestination && (
                    <View style={styles.placeRow}>
                      <Ionicons name="location" size={13} color={COLORS.white} />
                      <Text style={styles.placeText} numberOfLines={1}>{trip.primaryDestination}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.cardBody}>
                {!!trip.description && <Text style={styles.description}>{trip.description}</Text>}
                <View style={[styles.roleBox, { backgroundColor: role.bg }]}>
                  <Ionicons name={role.icon} size={18} color={role.color} />
                  <View style={styles.flex}>
                    <Text style={[styles.roleTitle, { color: role.color }]}>You'll join as {role.label.toLowerCase()}</Text>
                    <Text style={styles.roleHint}>{role.hint}</Text>
                  </View>
                </View>

                {alreadyOnTrip ? (
                  <>
                    <Text style={styles.already}>You're already on this trip.</Text>
                    <TouchableOpacity
                      style={styles.primaryButton}
                      onPress={() => openTrip(trip.id, trip.name)}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                    >
                      <Text style={styles.primaryButtonText}>Open trip</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={[styles.primaryButton, joining && styles.disabled]}
                    onPress={handleJoin}
                    disabled={joining}
                    activeOpacity={0.9}
                    accessibilityRole="button"
                  >
                    {joining ? (
                      <ActivityIndicator color={COLORS.white} />
                    ) : (
                      <Text style={styles.primaryButtonText}>Join trip</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
    paddingBottom: 140,
  },
  backButton: {
    marginBottom: SIZES.spacing_xl,
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginBottom: SIZES.spacing_lg,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
    paddingHorizontal: SIZES.spacing_base,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
  },
  input: {
    flex: 1,
    paddingVertical: SIZES.spacing_base,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  secondaryButton: {
    marginTop: SIZES.spacing_md,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
  },
  secondaryButtonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  disabled: {
    opacity: 0.5,
  },
  loader: {
    marginTop: SIZES.spacing_xl,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_sm,
    marginTop: SIZES.spacing_lg,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
    backgroundColor: '#fdecea',
  },
  errorText: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: '#b71c1c',
  },
  tripCard: {
    marginTop: SIZES.spacing_lg,
    borderRadius: SIZES.radius_xl,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e9edf1',
  },
  cover: {
    height: 180,
    justifyContent: 'flex-end',
  },
  coverText: {
    padding: SIZES.spacing_base,
  },
  tripName: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.white,
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  placeText: {
    flexShrink: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.white,
  },
  cardBody: {
    padding: SIZES.spacing_base,
  },
  description: {
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginBottom: SIZES.spacing_md,
  },
  roleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_md,
  },
  roleTitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
  },
  roleHint: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  already: {
    marginTop: SIZES.spacing_md,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: SIZES.spacing_base,
    height: 50,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
  },
  primaryButtonText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
