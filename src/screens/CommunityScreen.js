import React, { useState } from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { ScreenHeader } from '../components';

/**
 * CommunityScreen - placeholder for the journals / community feed.
 */
export default function CommunityScreen() {
  const [headerHeight, setHeaderHeight] = useState(0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.white} />

      <View style={[styles.empty, { paddingTop: headerHeight }]}>
        <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>Community feed coming soon</Text>
      </View>

      {/* Shared floating header panel. Content sits beneath it. */}
      <ScreenHeader
        title="Community"
        subtitle="Journals and stories from travelers"
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
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
