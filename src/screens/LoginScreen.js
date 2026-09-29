import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { signInWithEmail } from '../services';
import useGoogleAuth from '../hooks/useGoogleAuth';

/**
 * LoginScreen - Shown when a returning user needs to sign in.
 * Supports password login or Google login depending on the method.
 */
export default function LoginScreen({ navigation, route }) {
  const { email, method } = route.params;
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Google sign-in (expo-auth-session). onResult fires after the browser flow
  // completes and the Firebase + backend exchange finishes.
  const { promptAsync: promptGoogle, isProcessing: isGoogleProcessing } =
    useGoogleAuth((result) => {
      setIsLoading(false);
      if (result.success) {
        navigation.replace('Main', { user: result.user });
      } else {
        setError(result.error);
      }
    });

  const handleLogin = async () => {
    if (!password.trim()) {
      setError('Please enter your password.');
      return;
    }
    setIsLoading(true);
    setError(null);
    const result = await signInWithEmail(email, password);
    setIsLoading(false);
    if (result.success) {
      navigation.replace('Main', { user: result.user });
    } else {
      setError(result.error);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    // Opens the Google consent screen. useGoogleAuth's onResult handles the
    // outcome once the browser flow returns.
    const result = await promptGoogle();
    if (result?.type !== 'success') {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.title}>Welcome back!</Text>
        <Text style={styles.subtitle}>Sign in as</Text>
        <Text style={styles.emailText}>{email}</Text>

        {method === 'google' ? (
          <>
            <Text style={styles.methodHint}>You previously signed in with Google</Text>
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              activeOpacity={0.85}
              disabled={isLoading || isGoogleProcessing}
            >
              {isLoading || isGoogleProcessing ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color={COLORS.white} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Password Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={COLORS.textMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoFocus
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={COLORS.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.primaryButton, !password.trim() && styles.buttonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.85}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Forgot Password */}
            <TouchableOpacity style={styles.forgotButton}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </>
        )}
        {/* Error */}
        {error && <Text style={styles.errorText}>{error}</Text>}
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
  content: {
    flex: 1,
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_lg,
  },
  backButton: {
    marginBottom: SIZES.spacing_xl,
  },
  title: {
    fontSize: SIZES.xxl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_sm,
  },
  subtitle: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  emailText: {
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primary,
    marginBottom: SIZES.spacing_xl,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    marginBottom: SIZES.spacing_base,
  },
  input: {
    flex: 1,
    paddingVertical: SIZES.spacing_base,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  eyeButton: {
    padding: SIZES.spacing_xs,
  },
  errorText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: '#d32f2f',
    marginBottom: SIZES.spacing_base,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: SIZES.spacing_base,
    borderRadius: SIZES.radius_full,
    alignItems: 'center',
    marginBottom: SIZES.spacing_base,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
  },
  forgotButton: {
    alignItems: 'center',
  },
  forgotText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textMuted,
  },
  methodHint: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginBottom: SIZES.spacing_lg,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: SIZES.radius_full,
    paddingVertical: SIZES.spacing_base,
    gap: SIZES.spacing_sm,
  },
  googleButtonText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
