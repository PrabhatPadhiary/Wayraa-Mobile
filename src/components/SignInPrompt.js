import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/**
 * Full-screen "sign in to continue" gate shown on authenticated-only screens
 * (Favorites, My Trips) when the user is browsing as a guest.
 *
 * @param {string} icon - Ionicons name for the illustration
 * @param {string} title
 * @param {string} subtitle
 * @param {() => void} onSignIn - navigate to the Login screen
 */
export default function SignInPrompt({
  icon = 'lock-closed-outline',
  title = 'Sign in to continue',
  subtitle = 'Create an account or sign in to unlock this.',
  onSignIn,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={40} color={COLORS.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <TouchableOpacity style={styles.button} onPress={onSignIn} activeOpacity={0.9}>
        <Text style={styles.buttonText}>Sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZES.spacing_xl,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(232, 93, 4, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SIZES.spacing_lg,
  },
  title: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SIZES.spacing_sm,
    maxWidth: 280,
  },
  button: {
    marginTop: SIZES.spacing_xl,
    backgroundColor: COLORS.accent,
    paddingHorizontal: SIZES.spacing_xl * 1.5,
    paddingVertical: SIZES.spacing_md,
    borderRadius: SIZES.radius_full,
  },
  buttonText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
