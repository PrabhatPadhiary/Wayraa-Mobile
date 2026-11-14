import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { ScreenHeader, SignInPrompt } from '../components';
import useAuth from '../hooks/useAuth';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import {
  getMyProfile,
  signInMethods,
  sendPasswordReset,
  deleteMyAccount,
  logoutUser,
} from '../services';
import appConfig from '../../app.json';
import { showAlert } from '../components/AppDialog';
import { openPrivacyPolicy, openTerms } from '../utils/legal';
import { LoaderOverlay } from '../components/WayraaLoader';

/** One row in a settings-style group. */
function Row({ icon, label, value, onPress, danger, last }) {
  const content = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Feather name={icon} size={17} color={danger ? COLORS.error : COLORS.primary} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]} numberOfLines={1}>{label}</Text>
      {!!value && <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>}
      {onPress && !danger && <Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </TouchableOpacity>
  );
}

/**
 * SettingsScreen — the app's settings, apart from your profile (opened from
 * the menu icon on Home): account security (email, sign-in method, password),
 * privacy and safety (blocked people), about (privacy policy, terms,
 * version), log out and delete account.
 *
 * Your photo, name, stats and trips live on Profile.
 */
export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user: firebaseUser, isAuthenticated, isAuthReady } = useAuth();
  const keyboardHeight = useKeyboardHeight();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [profile, setProfile] = useState(null);

  const [loggingOut, setLoggingOut] = useState(false);
  // Delete account: typed confirmation sheet.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // The email shown under Account (from your profile, else the sign-in).
  useFocusEffect(useCallback(() => {
    if (!isAuthReady || !isAuthenticated) return;
    getMyProfile().then(setProfile).catch(() => {});
  }, [isAuthReady, isAuthenticated]));

  const email = profile?.email || firebaseUser?.email || '';
  const methods = signInMethods();

  const resetPassword = () => {
    showAlert(
      'Change password',
      `We'll email a link to ${email} to set a new password.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send link',
          onPress: async () => {
            try {
              const to = await sendPasswordReset();
              showAlert('Check your email', `A reset link is on its way to ${to}.`);
            } catch (e) {
              showAlert('Could not send the link', e?.message || 'Please try again later.');
            }
          },
        },
      ]
    );
  };

  const logOut = () => {
    showAlert('Log out?', 'You can sign back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logoutUser();
          resetToWelcome();
        },
      },
    ]);
  };

  const resetToWelcome = () => {
    let root = navigation;
    while (root.getParent && root.getParent()) root = root.getParent();
    root.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  const openDelete = () => {
    setDeleteText('');
    setDeleteError('');
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteText.trim().toUpperCase() !== 'DELETE' || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteMyAccount();
      setDeleteOpen(false);
      resetToWelcome();
      showAlert('Account deleted', 'Your account and data have been removed. Safe travels!');
    } catch (e) {
      setDeleteError(e?.message || 'Could not delete your account. Please try again.');
      setDeleting(false);
    }
  };

  const header = (
    <ScreenHeader
      title="Settings"
      subtitle="Account, privacy and the app"
      onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      left={(
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      )}
    />
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: headerHeight + SIZES.spacing_sm, paddingBottom: 140 }}
      >
        {isAuthenticated && (
          <>
            {/* Account: how you sign in. Your name and photo are on Profile. */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <View style={styles.group}>
                <Row icon="mail" label="Email" value={email} />
                <Row
                  icon="log-in"
                  label="Signed in with"
                  value={methods.google && methods.password ? 'Google & email' : methods.google ? 'Google' : 'Email'}
                  last={!methods.password}
                />
                {methods.password && (
                  <Row icon="lock" label="Change password" onPress={resetPassword} last />
                )}
              </View>
            </View>

            {/* Privacy and safety */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Privacy and safety</Text>
              <View style={styles.group}>
                <Row
                  icon="slash"
                  label="Blocked people"
                  onPress={() => navigation.navigate('BlockedPeople')}
                  last
                />
              </View>
            </View>
          </>
        )}

        {/* About: the legal pages (also linked on Welcome and Sign up). */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.group}>
            <Row icon="shield" label="Privacy policy" onPress={openPrivacyPolicy} />
            <Row icon="file-text" label="Terms of use" onPress={openTerms} />
            <Row icon="info" label="Version" value={appConfig?.expo?.version ? `v${appConfig.expo.version}` : '—'} last />
          </View>
        </View>

        {isAuthenticated ? (
          <View style={styles.section}>
            <View style={styles.group}>
              <Row icon="log-out" label="Log out" onPress={logOut} danger last />
            </View>
            <TouchableOpacity
              style={styles.deleteLink}
              onPress={openDelete}
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              hitSlop={8}
            >
              <Text style={styles.deleteLinkText}>Delete account</Text>
            </TouchableOpacity>
          </View>
        ) : isAuthReady && (
          <SignInPrompt
            icon="person-circle-outline"
            title="Not signed in"
            subtitle="Sign in to manage your account."
            onSignIn={() => navigation.navigate('Welcome')}
          />
        )}
        <Text style={styles.version}>Wayraa {appConfig?.expo?.version ? `v${appConfig.expo.version}` : ''}</Text>
      </ScrollView>

      {header}

      {/* Delete account: explains what happens, then needs "DELETE" typed. */}
      <Modal visible={deleteOpen} transparent animationType="slide" onRequestClose={() => !deleting && setDeleteOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !deleting && setDeleteOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { marginBottom: keyboardHeight, paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_lg }]}>
            <View style={styles.grabber} />
            <View style={styles.deleteIcon}>
              <Feather name="alert-triangle" size={22} color={COLORS.error} />
            </View>
            <Text style={styles.sheetTitle}>Delete your account?</Text>
            <Text style={styles.sheetHint}>This can't be undone. Here's what happens:</Text>
            {[
              'Your profile, sign-in, favourites and journals are deleted.',
              'Trips only you are on are deleted.',
              'Trips shared with friends stay with them; the longest-standing editor becomes the owner.',
              'Expenses you paid on shared trips stay, shown as "Former traveller".',
            ].map((line) => (
              <View key={line} style={styles.deletePoint}>
                <View style={styles.deleteBullet} />
                <Text style={styles.deletePointText}>{line}</Text>
              </View>
            ))}
            <Text style={styles.deleteType}>Type DELETE to confirm</Text>
            <TextInput
              style={styles.input}
              value={deleteText}
              onChangeText={(t) => { setDeleteText(t); setDeleteError(''); }}
              placeholder="DELETE"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              accessibilityLabel="Type DELETE to confirm"
            />
            {!!deleteError && <Text style={styles.nameError}>{deleteError}</Text>}
            <TouchableOpacity
              style={[styles.deleteButton, (deleting || deleteText.trim().toUpperCase() !== 'DELETE') && styles.saveButtonDisabled]}
              onPress={confirmDelete}
              disabled={deleting || deleteText.trim().toUpperCase() !== 'DELETE'}
              activeOpacity={0.9}
              accessibilityRole="button"
            >
              {deleting ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveText}>Delete my account</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setDeleteOpen(false)}
              disabled={deleting}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Keep my account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <LoaderOverlay visible={loggingOut} message="Logging out…" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm, // alpine frost (60%)
  },
  section: {
    marginTop: SIZES.spacing_lg,
    marginHorizontal: SIZES.spacing_base,
  },
  sectionTitle: {
    marginLeft: SIZES.spacing_xs,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  group: {
    borderRadius: SIZES.radius_lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#E9EDF1',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    minHeight: 54,
    paddingHorizontal: SIZES.spacing_base,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: SIZES.radius_sm,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECF1F5',
  },
  rowIconDanger: {
    backgroundColor: '#FBEEEC',
  },
  rowLabel: {
    flex: 1,
    fontSize: SIZES.md,
    fontFamily: 'Poppins_500Medium',
    color: COLORS.textPrimary,
  },
  rowLabelDanger: {
    color: COLORS.error,
    fontFamily: 'Poppins_600SemiBold',
  },
  rowValue: {
    maxWidth: '50%',
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  deleteLink: {
    alignSelf: 'center',
    marginTop: SIZES.spacing_lg,
  },
  deleteLinkText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.error,
  },
  deleteIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FBEEEC',
    marginBottom: SIZES.spacing_md,
  },
  deletePoint: {
    flexDirection: 'row',
    gap: SIZES.spacing_sm,
    marginBottom: 6,
  },
  deleteBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: COLORS.textSecondary,
  },
  deletePointText: {
    flex: 1,
    fontSize: SIZES.sm,
    lineHeight: 20,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  deleteType: {
    marginTop: SIZES.spacing_md,
    marginBottom: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  deleteButton: {
    marginTop: SIZES.spacing_base,
    height: 50,
    borderRadius: SIZES.radius_full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#C4392A',
  },
  cancelButton: {
    alignSelf: 'center',
    paddingVertical: SIZES.spacing_md,
    marginTop: SIZES.spacing_xs,
  },
  cancelText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textSecondary,
  },
  version: {
    marginTop: SIZES.spacing_md,
    textAlign: 'center',
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
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
  sheetTitle: {
    fontSize: SIZES.xl,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  sheetHint: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginBottom: SIZES.spacing_md,
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
  },
  nameError: {
    marginTop: SIZES.spacing_sm,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: '#D33F2F',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
