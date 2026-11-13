import React, { useState, useEffect, useRef } from 'react';
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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { createAccountWithEmail } from '../services';
import { openPrivacyPolicy, openTerms } from '../utils/legal';
import { checkPassword, initialPasswordRules } from '../utils/passwordPolicy';
import { LoaderOverlay } from '../components/WayraaLoader';

/**
 * SignUpScreen - Shown when a new user needs to create an account.
 */
export default function SignUpScreen({ navigation, route }) {
  const { email } = route.params;
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  // Password rules from the Firebase password policy, re-checked as you type.
  const [passwordCheck, setPasswordCheck] = useState({
    isValid: false,
    rules: initialPasswordRules(),
  });
  const latestPassword = useRef(password);

  useEffect(() => {
    latestPassword.current = password;
    checkPassword(password).then((result) => {
      // Ignore results for a password that has since changed.
      if (latestPassword.current === password) setPasswordCheck(result);
    });
  }, [password]);

  const isFormValid = !!name.trim() && passwordCheck.isValid;

  const handleSignUp = async () => {
    if (!name.trim()) {
      setError('Please enter your name.');
      return;
    }
    if (!passwordCheck.isValid) {
      setError('Please choose a password that meets all the requirements below.');
      return;
    }

    setIsLoading(true);
    setError(null);
    const result = await createAccountWithEmail(email, password, name.trim());
    setIsLoading(false);
    if (result.success) {
      navigation.replace('Main', { user: result.user });
    } else {
      setError(result.error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>

          {/* Header */}
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Set up your profile for</Text>
          <Text style={styles.emailText}>{email}</Text>

          {/* Name Input */}
          <Text style={styles.label}>Full name</Text>
          <View style={[
            styles.inputContainer,
            focusedField === 'name' && styles.inputFocused,
          ]}>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocusedField('name')}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Password Input */}
          <Text style={styles.label}>Password</Text>
          <View style={[
            styles.inputContainer,
            styles.passwordContainer,
            focusedField === 'password' && styles.inputFocused,
          ]}>
            <TextInput
              style={styles.input}
              placeholder="Create a password"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
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

          {/* Password requirements: each turns green once met. */}
          <View style={styles.rules} accessibilityLabel="Password requirements">
            {passwordCheck.rules.map((rule) => (
              <View
                key={rule.key}
                style={styles.ruleRow}
                accessible
                accessibilityLabel={`${rule.label}, ${rule.met ? 'met' : 'not met'}`}
              >
                <Ionicons
                  name={rule.met ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={rule.met ? COLORS.success : COLORS.textMuted}
                />
                <Text style={[styles.ruleText, rule.met && styles.ruleTextMet]}>
                  {rule.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Error */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Create Account Button */}
          <TouchableOpacity
            style={[styles.primaryButton, !isFormValid && styles.buttonDisabled]}
            onPress={handleSignUp}
            activeOpacity={0.85}
            disabled={isLoading || !isFormValid}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Create account</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.legalText}>
            By creating an account, you agree to Wayraa's{' '}
            <Text style={styles.legalLink} onPress={openTerms} accessibilityRole="link">Terms</Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={openPrivacyPolicy} accessibilityRole="link">Privacy Policy</Text>.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* Waiting: the animated logo over the page (which can't be touched meanwhile). */}
      <LoaderOverlay visible={isLoading} message="Creating your account…" />
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
  label: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
    marginBottom: SIZES.spacing_sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    marginBottom: SIZES.spacing_lg,
  },
  // Password field sits closer to its requirements list.
  passwordContainer: {
    marginBottom: SIZES.spacing_md,
  },
  rules: {
    gap: 6,
    marginBottom: SIZES.spacing_lg,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  ruleText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  ruleTextMet: {
    color: COLORS.textPrimary,
  },
  inputFocused: {
    borderColor: COLORS.accent,
  },
  input: {
    flex: 1,
    paddingVertical: SIZES.spacing_base,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
    outlineStyle: 'none',
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
    marginTop: SIZES.spacing_sm,
    marginBottom: SIZES.spacing_xl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
  },
  legalText: {
    marginTop: SIZES.spacing_base,
    fontSize: SIZES.sm,
    lineHeight: 18,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  legalLink: {
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primaryLight,
    textDecorationLine: 'underline',
  },
});
