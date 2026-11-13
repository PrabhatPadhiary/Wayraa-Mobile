import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Feather, Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES } from '../constants';
import { ScreenHeader } from '../components';
import { avatarColorFor, initialsFor } from '../components/TripStackCard';
import { getBlockedUsers, unblockUser } from '../services';
import { showAlert } from '../components/AppDialog';
import { RowListSkeleton } from '../components/skeletons';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';

/**
 * Blocked people (from Profile): everyone you've blocked, with Unblock.
 * Their stories and comments come back once unblocked.
 */
export default function BlockedPeopleScreen({ navigation }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  const load = useCallback(async () => {
    try {
      setError('');
      setPeople(await getBlockedUsers());
    } catch (e) {
      setError(e?.message || 'Couldn\'t load blocked people.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const unblock = (person) => {
    const name = person.name || 'this traveller';
    showAlert(`Unblock ${name}?`, 'You\'ll see their stories and comments again. They won\'t be told.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          setBusyId(person.id);
          try {
            await unblockUser(person.id);
            setPeople((prev) => prev.filter((p) => p.id !== person.id));
          } catch (e) {
            showAlert('Couldn\'t unblock them', e?.message || 'Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const renderPerson = ({ item }) => {
    const name = item.name || 'Traveller';
    return (
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: avatarColorFor(name) }]}>
          {item.photoUrl
            ? <Image source={{ uri: cloudinarySized(item.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, styles.avatarImage]} contentFit="cover" />
            : <Text style={styles.avatarText}>{initialsFor(name)}</Text>}
        </View>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {busyId === item.id ? (
          <ActivityIndicator color={COLORS.accent} />
        ) : (
          <TouchableOpacity
            style={styles.unblock}
            onPress={() => unblock(item)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Unblock ${name}`}
          >
            <Text style={styles.unblockText}>Unblock</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return <RowListSkeleton thumb={42} round label="Loading blocked people" />;
    return (
      <View style={styles.state}>
        <Feather name={error ? 'cloud-off' : 'user-check'} size={36} color={COLORS.textMuted} />
        <Text style={styles.stateTitle}>{error || 'No one blocked'}</Text>
        {!error && (
          <Text style={styles.stateText}>
            People you block from a story's ⋯ menu or a comment show up here.
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        data={people}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderPerson}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight + SIZES.spacing_md }]}
      />
      <ScreenHeader
        title="Blocked people"
        subtitle="Their stories and comments are hidden"
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundWarm,
  },
  list: {
    paddingHorizontal: SIZES.spacing_base,
    paddingBottom: 120,
    flexGrow: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_md,
    padding: SIZES.spacing_md,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  separator: {
    height: SIZES.spacing_sm,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    borderRadius: 21,
  },
  avatarText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  name: {
    flex: 1,
    fontSize: SIZES.base,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  unblock: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#f0f2f5',
  },
  unblockText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  loader: {
    marginTop: SIZES.spacing_xxl,
  },
  state: {
    alignItems: 'center',
    paddingTop: SIZES.spacing_xxl,
    paddingHorizontal: SIZES.spacing_xl,
    gap: SIZES.spacing_sm,
  },
  stateTitle: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  stateText: {
    fontSize: SIZES.md,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
