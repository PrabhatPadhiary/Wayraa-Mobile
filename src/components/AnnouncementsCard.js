import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import { avatarColorFor, initialsFor } from './TripStackCard';
import { showAlert } from './AppDialog';
import {
  ANNOUNCEMENT_MAX_LENGTH,
  getAnnouncements,
  peekAnnouncements,
  rememberAnnouncements,
  postAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../services/announcementsService';
import { cloudinarySized, IMAGE_WIDTH } from '../utils/cloudinary';
import { timeAgo } from '../utils/timeAgo';
import { ArrivalGlow, useLiveArrivals } from './Motion';
import { useOnReconnect } from '../hooks/useNetwork';

/**
 * Announcements on the trip's Overview: notes from the owner to everyone
 * ("Flight PNR AB123, meet at Gate 4, 6am"). The newest is shown in full,
 * older ones behind "+N earlier". The owner posts (everyone else gets a
 * notification), edits and deletes; everyone else reads.
 *
 * Hidden for non-owners until there's something to read.
 *
 * @param {string} tripId
 * @param {boolean} isOwner
 * @param {number} liveKey  bumps when someone changes the trip (live updates): reload
 */
export default function AnnouncementsCard({ tripId, isOwner, liveKey }) {
  // As last loaded, at once; the fresh copy loads behind it.
  const [items, setItems] = useState(() => peekAnnouncements(tripId) || []);
  const [loaded, setLoaded] = useState(() => !!peekAnnouncements(tripId));
  useEffect(() => {
    if (loaded) rememberAnnouncements(tripId, items);
  }, [loaded, items, tripId]);
  const [expanded, setExpanded] = useState(false);
  // An announcement that just came in (live): it glows once.
  const freshIds = useLiveArrivals(items, liveKey);
  const [composer, setComposer] = useState(null); // null | { id?, text }

  const load = useCallback(() => {
    if (!tripId) return;
    getAnnouncements(tripId)
      .then((list) => { setItems(list); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [tripId]);
  // Back online: reload what may have failed.
  useOnReconnect(load);

  useEffect(() => { load(); }, [load, liveKey]);

  const openMenu = (item) => {
    showAlert('Announcement', null, [
      { text: 'Edit', onPress: () => setComposer({ id: item.id, text: item.text }) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => showAlert('Delete this announcement?', 'It goes for everyone on the trip.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              const before = items;
              setItems((prev) => prev.filter((a) => a.id !== item.id));
              try {
                await deleteAnnouncement(tripId, item.id);
              } catch (e) {
                setItems(before);
                showAlert('Couldn\'t delete it', e?.message || 'Please try again.');
              }
            },
          },
        ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onSaved = (saved, isNew) => {
    setItems((prev) => (isNew
      ? [saved, ...prev]
      : prev.map((a) => (a.id === saved.id ? saved : a))));
    setComposer(null);
  };

  if (!loaded || (!isOwner && items.length === 0)) {
    return <Composer tripId={tripId} draft={composer} onClose={() => setComposer(null)} onSaved={onSaved} />;
  }

  const [latest, ...earlier] = items;
  const shown = expanded ? items : (latest ? [latest] : []);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Ionicons name="megaphone" size={15} color={COLORS.accent} />
          </View>
          <Text style={styles.title}>Announcements</Text>
        </View>
        {isOwner && items.length > 0 && (
          <TouchableOpacity
            style={styles.postButton}
            onPress={() => setComposer({ text: '' })}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Post an announcement"
          >
            <Ionicons name="add" size={16} color={COLORS.accent} />
            <Text style={styles.postButtonText}>Post</Text>
          </TouchableOpacity>
        )}
      </View>

      {items.length === 0 ? (
        // Owner, nothing posted yet: a gentle nudge.
        <TouchableOpacity
          style={styles.empty}
          onPress={() => setComposer({ text: '' })}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Post an announcement"
        >
          <Text style={styles.emptyText}>
            Share flight details, meeting points or reminders. Everyone on the trip gets a notification.
          </Text>
          <View style={styles.emptyCta}>
            <Ionicons name="create-outline" size={15} color={COLORS.white} />
            <Text style={styles.emptyCtaText}>Post an announcement</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <>
          {shown.map((item, i) => (
            <AnnouncementRow
              key={item.id}
              item={item}
              first={i === 0}
              arrived={freshIds.has(item.id)}
              onMenu={isOwner ? () => openMenu(item) : null}
            />
          ))}
          {earlier.length > 0 && (
            <TouchableOpacity
              style={styles.more}
              onPress={() => setExpanded((v) => !v)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.moreText}>
                {expanded ? 'Show less' : `+${earlier.length} earlier`}
              </Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.primaryLight} />
            </TouchableOpacity>
          )}
        </>
      )}

      <Composer tripId={tripId} draft={composer} onClose={() => setComposer(null)} onSaved={onSaved} />
    </View>
  );
}

function AnnouncementRow({ item, first, onMenu, arrived }) {
  const name = item.author?.name || 'Former traveller';
  return (
    <View style={[styles.item, !first && styles.itemDivider]}>
      <ArrivalGlow active={arrived} radius={12} style={styles.itemGlow} />
      <View style={styles.itemHead}>
        <View style={[styles.avatar, { backgroundColor: avatarColorFor(name) }]}>
          {item.author?.photoUrl
            ? <Image source={{ uri: cloudinarySized(item.author.photoUrl, IMAGE_WIDTH.AVATAR) }} style={[StyleSheet.absoluteFill, styles.avatarImage]} contentFit="cover" />
            : <Text style={styles.avatarText}>{initialsFor(name)}</Text>}
        </View>
        <Text style={styles.author} numberOfLines={1}>{name.split(' ')[0]}</Text>
        <Text style={styles.time}>
          · {timeAgo(item.createdAt)}{item.editedAt ? ' · edited' : ''}
        </Text>
        {onMenu && (
          <TouchableOpacity
            style={styles.menu}
            onPress={onMenu}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Edit or delete announcement"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.text} selectable>{item.text}</Text>
    </View>
  );
}

/** Bottom sheet to write or edit an announcement. `draft`: null (closed) or { id?, text }. */
function Composer({ tripId, draft, onClose, onSaved }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!draft?.id;

  useEffect(() => {
    if (draft) {
      setText(draft.text || '');
      setError('');
      setSaving(false);
    }
  }, [draft]);

  const trimmed = text.trim();
  const tooLong = text.length > ANNOUNCEMENT_MAX_LENGTH;
  const canSave = !!trimmed && !tooLong && !saving && (!isEdit || trimmed !== draft?.text);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const saved = isEdit
        ? await updateAnnouncement(tripId, draft.id, trimmed)
        : await postAnnouncement(tripId, trimmed);
      onSaved(saved, !isEdit);
    } catch (e) {
      setError(e?.message || 'Couldn\'t save it. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!draft} transparent animationType="slide" onRequestClose={() => !saving && onClose()}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => !saving && onClose()} accessibilityLabel="Close" />
        <View style={[styles.sheet, { marginBottom: keyboardHeight, paddingBottom: (keyboardHeight ? 0 : insets.bottom) + SIZES.spacing_lg }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>{isEdit ? 'Edit announcement' : 'New announcement'}</Text>
          <Text style={styles.sheetHint}>
            {isEdit
              ? 'Everyone sees the change. No new notification is sent.'
              : 'Everyone on the trip gets a notification.'}
          </Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={(t) => { setText(t); setError(''); }}
            placeholder="e.g. Flight PNR AB123. Meet at Gate 4 by 6am."
            placeholderTextColor={COLORS.textMuted}
            multiline
            autoFocus
            textAlignVertical="top"
            editable={!saving}
            accessibilityLabel="Announcement"
          />
          <View style={styles.counterRow}>
            {!!error && <Text style={styles.error} numberOfLines={2}>{error}</Text>}
            <Text style={[styles.counter, tooLong && styles.counterOver]}>
              {text.length}/{ANNOUNCEMENT_MAX_LENGTH}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={save}
            disabled={!canSave}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            {saving
              ? <ActivityIndicator color={COLORS.white} />
              : <Text style={styles.saveText}>{isEdit ? 'Save' : 'Post to everyone'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: SIZES.radius_xl,
    padding: SIZES.spacing_base,
    marginBottom: SIZES.spacing_md,
    borderWidth: 1,
    borderColor: '#F6DCCF',
    shadowColor: '#2B3F51',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SIZES.spacing_sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.spacing_sm,
  },
  titleIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FDEFEA',
  },
  title: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_700Bold',
    color: COLORS.primary,
  },
  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: SIZES.radius_full,
    backgroundColor: '#FDEFEA',
  },
  postButtonText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.accent,
  },
  item: {
    paddingVertical: SIZES.spacing_sm,
  },
  itemGlow: {
    left: -8,
    right: -8,
  },
  itemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    borderRadius: 12,
  },
  avatarText: {
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
  author: {
    flexShrink: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.textPrimary,
  },
  time: {
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  menu: {
    marginLeft: 'auto',
    paddingHorizontal: 4,
  },
  text: {
    fontSize: SIZES.md,
    lineHeight: 21,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingTop: SIZES.spacing_xs,
  },
  moreText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.primaryLight,
  },
  empty: {
    padding: SIZES.spacing_md,
    borderRadius: SIZES.radius_lg,
    backgroundColor: '#FFF6F1',
  },
  emptyText: {
    fontSize: SIZES.sm,
    lineHeight: 19,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textSecondary,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: SIZES.spacing_sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: SIZES.radius_full,
    backgroundColor: COLORS.accent,
  },
  emptyCtaText: {
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
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
    minHeight: 120,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius_md,
    paddingHorizontal: SIZES.spacing_base,
    paddingTop: SIZES.spacing_md,
    paddingBottom: SIZES.spacing_md,
    fontSize: SIZES.base,
    lineHeight: 22,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textPrimary,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.spacing_sm,
    marginTop: 6,
  },
  error: {
    flex: 1,
    fontSize: SIZES.sm,
    fontFamily: 'Poppins_500Medium',
    color: '#D33F2F',
  },
  counter: {
    marginLeft: 'auto',
    fontSize: SIZES.xs,
    fontFamily: 'Poppins_400Regular',
    color: COLORS.textMuted,
  },
  counterOver: {
    color: '#D33F2F',
    fontFamily: 'Poppins_600SemiBold',
  },
  saveButton: {
    marginTop: SIZES.spacing_base,
    height: 50,
    borderRadius: SIZES.radius_full,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: SIZES.lg,
    fontFamily: 'Poppins_600SemiBold',
    color: COLORS.white,
  },
});
