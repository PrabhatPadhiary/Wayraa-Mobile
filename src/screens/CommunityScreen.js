import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';

/**
 * CommunityScreen - placeholder for the journals / community feed.
 */
export default function CommunityScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />
      <View style={styles.header}>
        <Text style={styles.title}>Community</Text>
        <Text style={styles.subtitle}>Journals and stories from travelers</Text>
      </View>
      <View style={styles.empty}>
        <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>Community feed coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: SIZES.spacing_lg,
    paddingTop: SIZES.spacing_base,
    paddingBottom: SIZES.spacing_md,
  },
  title: {
    fontSize: SIZES.xxl,
    fontFamily: 'PlayfairDisplay_700Bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    marginTop: SIZES.spacing_base,
  },
});
